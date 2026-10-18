import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  gh,
  ghJson,
  graphql,
  limitEnvironmentToMain,
  mutation,
  quote,
  root,
} from "../shared/github.ts";
import { labelChanges, loadProjectLabels } from "./project-labels.ts";
import { missingScopes } from "./token-scopes.ts";
import * as json from "../shared/json-shape.ts";
import {
  rulesetDrift,
  rulesetShape,
  wantedWorkflowPermissions,
  workflowPermissionsDiffer,
  workflowPermissionsShape,
} from "./ruleset-drift.ts";

const reason = (error: unknown) => (error instanceof Error ? error.message.trim() : String(error));

// A GitHub template copies files only. This script creates what is not a file:
// labels, the Project with its fields and views, merge settings and rulesets.
// It reads the current state first and writes only differences, so a second
// run reports no changes. It needs `gh` with the `repo` and `project` scopes
// (`gh auth refresh -s project`) and administrator rights on the repository.

// Validate all project data before any GitHub call, including reads.
const labels = loadProjectLabels(join(root, ".github/labels.json"));

type Option = Readonly<{ name: string; color: string; description: string }>;

const statusOptions: readonly Option[] = [
  { name: "Backlog", color: "GRAY", description: "Accepted, not next or not ready to start" },
  { name: "Ready", color: "BLUE", description: "Specified, unblocked, can be claimed" },
  { name: "In progress", color: "YELLOW", description: "Being implemented or validated" },
  { name: "In review", color: "PURPLE", description: "Pull request awaits merge authorization" },
  { name: "Blocked", color: "RED", description: "Paused by a dependency or decision" },
  { name: "Done", color: "GREEN", description: "Closed with acceptance criteria satisfied" },
];
// A new Project starts with "Todo"; keep its item values when it becomes "Backlog".
const statusAliases: Readonly<Record<string, string>> = { todo: "Backlog" };

const priorityOptions: readonly Option[] = [
  { name: "P0", color: "RED", description: "Done first" },
  { name: "P1", color: "ORANGE", description: "Next" },
  { name: "P2", color: "GRAY", description: "When nothing above it is available" },
];

const views: readonly (readonly [name: string, layout: string, filter: string])[] = [
  ["Ready", "TABLE_LAYOUT", "is:open status:Ready -label:epic"],
  ["Current work", "TABLE_LAYOUT", 'is:open status:"In progress","In review"'],
  ["Decisions", "TABLE_LAYOUT", "is:open label:decision-needed"],
  ["Blocked", "TABLE_LAYOUT", "is:open status:Blocked"],
  ["Epics", "TABLE_LAYOUT", "is:open label:epic"],
  ["Backlog", "TABLE_LAYOUT", "is:open status:Backlog"],
  ["Board", "BOARD_LAYOUT", "is:open"],
];

const changes: string[] = [];
const notApplied: string[] = [];
// Settings a plan may not offer; reported without failing the run.
const unavailable: string[] = [];

function optionsLiteral(desired: readonly Option[], existing: readonly FieldOption[]): string {
  const idByName = new Map(existing.map((option) => [canonical(option.name), option.id]));
  return desired
    .map((option) => {
      const id = idByName.get(option.name.toLowerCase());
      const idPart = id === undefined ? "" : `id:${quote(id)},`;
      return `{${idPart}name:${quote(option.name)},color:${option.color},description:${quote(option.description)}}`;
    })
    .join(",");
}

function canonical(name: string): string {
  return (statusAliases[name.toLowerCase()] ?? name).toLowerCase();
}

const fieldOptionShape = json.object({
  id: json.string,
  name: json.string,
  color: json.optional(json.string),
  description: json.optional(json.string),
});
type FieldOption = json.ShapeOf<typeof fieldOptionShape>;
// Fields of other types match the fragment with an empty object.
const fieldShape = json.object({
  id: json.optional(json.string),
  name: json.optional(json.string),
  options: json.optional(json.array(fieldOptionShape)),
});
const viewShape = json.object({
  id: json.string,
  name: json.string,
  layout: json.string,
  filter: json.nullable(json.string),
});
const projectShape = json.object({
  id: json.string,
  number: json.number,
  title: json.string,
  url: json.string,
});
type Project = json.ShapeOf<typeof projectShape>;

const repository = ghJson(
  [
    "repo",
    "view",
    "--json",
    "id,name,nameWithOwner,owner,squashMergeAllowed,mergeCommitAllowed,rebaseMergeAllowed,deleteBranchOnMerge",
  ],
  json.object({
    id: json.string,
    name: json.string,
    nameWithOwner: json.string,
    owner: json.object({ login: json.string }),
    squashMergeAllowed: json.boolean,
    mergeCommitAllowed: json.boolean,
    rebaseMergeAllowed: json.boolean,
    deleteBranchOnMerge: json.boolean,
  }),
);
console.log(`Repository: ${repository.nameWithOwner}`);

// Fail early with the fix, not halfway with a GraphQL error.
const missing = missingScopes(gh(["api", "--include", "user"]), ["repo", "project"]);
if (missing.length > 0) {
  console.error(
    `The gh login lacks the scope ${missing.join(", ")}. Add it with: gh auth refresh -s ${missing.join(",")}`,
  );
  process.exit(1);
}

// Labels
const existingLabels = ghJson(
  ["label", "list", "--limit", "500", "--json", "name,color,description"],
  json.array(json.object({ name: json.string, color: json.string, description: json.string })),
);
for (const { label, exists } of labelChanges(labels, existingLabels)) {
  gh([
    "label",
    "create",
    label.name,
    "--color",
    label.color,
    "--description",
    label.description,
    "--force",
  ]);
  changes.push(`label ${label.name} ${exists ? "updated" : "created"}`);
}

// Merge settings: squash only, branch removed after merge.
if (
  !repository.squashMergeAllowed ||
  repository.mergeCommitAllowed ||
  repository.rebaseMergeAllowed ||
  !repository.deleteBranchOnMerge
) {
  gh([
    "repo",
    "edit",
    repository.nameWithOwner,
    "--enable-squash-merge",
    "--enable-merge-commit=false",
    "--enable-rebase-merge=false",
    "--delete-branch-on-merge",
  ]);
  changes.push("merge settings set to squash only with branch deletion");
}

// Project
const owner = graphql(
  "query($login:String!){repositoryOwner(login:$login){id ... on ProjectV2Owner{projectsV2(first:100){nodes{id number title url closed}}}}}",
  json.object({
    repositoryOwner: json.object({
      id: json.string,
      projectsV2: json.object({
        nodes: json.array(
          json.object({
            id: json.string,
            number: json.number,
            title: json.string,
            url: json.string,
            closed: json.boolean,
          }),
        ),
      }),
    }),
  }),
  { login: repository.owner.login },
).repositoryOwner;
let project: Project | undefined = owner.projectsV2.nodes.find(
  (candidate) => candidate.title === repository.name && !candidate.closed,
);
const projectIsNew = project === undefined;
if (project === undefined) {
  project = graphql(
    `mutation{createProjectV2(input:{ownerId:${quote(owner.id)},title:${quote(repository.name)},repositoryId:${quote(repository.id)}}){projectV2{id number title url}}}`,
    json.object({ createProjectV2: json.object({ projectV2: projectShape }) }),
  ).createProjectV2.projectV2;
  changes.push(`Project "${project.title}" created`);
} else {
  const linked = graphql(
    "query($owner:String!,$name:String!){repository(owner:$owner,name:$name){projectsV2(first:100){nodes{id}}}}",
    json.object({
      repository: json.object({
        projectsV2: json.object({ nodes: json.array(json.object({ id: json.string })) }),
      }),
    }),
    { owner: repository.owner.login, name: repository.name },
  ).repository.projectsV2.nodes;
  if (!linked.some((candidate) => candidate.id === project?.id)) {
    mutation(
      `mutation{linkProjectV2ToRepository(input:{projectId:${quote(project.id)},repositoryId:${quote(repository.id)}}){clientMutationId}}`,
    );
    changes.push("Project linked to the repository");
  }
}
console.log(`Project: ${project.url}`);

const state = graphql(
  "query($id:ID!){node(id:$id){... on ProjectV2{fields(first:50){nodes{... on ProjectV2SingleSelectField{id name options{id name color description}}}} views(first:50){nodes{id name layout filter}}}}}",
  json.object({
    node: json.object({
      fields: json.object({ nodes: json.array(fieldShape) }),
      views: json.object({ nodes: json.array(viewShape) }),
    }),
  }),
  { id: project.id },
).node;

// Status and Priority: options are sent with their existing ids, so item values
// survive. Options a repository added itself are kept after the standard ones; this
// script removes nothing.
function setOptions(name: string, standard: readonly Option[]) {
  const field = state.fields.nodes.find((candidate) => candidate.name === name);
  if (field?.id === undefined) return false;
  const existing = field.options ?? [];
  const standardNames = new Set(standard.map((option) => option.name.toLowerCase()));
  const own = existing
    .filter((option) => !standardNames.has(canonical(option.name)))
    .map((option) => ({
      name: option.name,
      color: option.color ?? "GRAY",
      description: option.description ?? "",
    }));
  const wanted = [...standard, ...own];
  const names = existing.map((option) => option.name);
  if (names.join("|") !== wanted.map((option) => option.name).join("|")) {
    mutation(
      `mutation{updateProjectV2Field(input:{fieldId:${quote(field.id)},singleSelectOptions:[${optionsLiteral(wanted, existing)}]}){projectV2Field{... on ProjectV2SingleSelectField{id}}}}`,
    );
    changes.push(`${name} options set (were: ${names.join(", ")})`);
  }
  return true;
}

if (!setOptions("Status", statusOptions)) throw new Error("The Project has no Status field");
if (!setOptions("Priority", priorityOptions)) {
  mutation(
    `mutation{createProjectV2Field(input:{projectId:${quote(project.id)},dataType:SINGLE_SELECT,name:"Priority",singleSelectOptions:[${optionsLiteral(priorityOptions, [])}]}){projectV2Field{... on ProjectV2SingleSelectField{id}}}}`,
  );
  changes.push("Priority field created");
}

// Views
for (const [name, layout, filter] of views) {
  let view = state.views.nodes.find((candidate) => candidate.name === name);
  if (view === undefined) {
    view = graphql(
      `mutation{createProjectV2View(input:{projectId:${quote(project.id)},name:${quote(name)},layout:${layout}}){projectV2View{id name layout filter}}}`,
      json.object({ createProjectV2View: json.object({ projectV2View: viewShape }) }),
    ).createProjectV2View.projectV2View;
    changes.push(`view "${name}" created`);
  }
  if (view.layout !== layout) {
    mutation(
      `mutation{updateProjectV2View(input:{viewId:${quote(view.id)},layout:${layout}}){projectV2View{id}}}`,
    );
    changes.push(`view "${name}" layout set (was ${view.layout})`);
  }
  if ((view.filter ?? "") !== filter) {
    mutation(
      `mutation{updateProjectV2View(input:{viewId:${quote(view.id)},filter:${quote(filter)}}){projectV2View{id}}}`,
    );
    changes.push(`view "${name}" filter set`);
  }
}
// GitHub gives a new Project a view "View 1" that shows everything. Only a Project this
// run created loses it, so a view someone named so later is kept.
for (const view of state.views.nodes) {
  if (projectIsNew && view.name === "View 1") {
    mutation(`mutation{deleteProjectV2View(input:{viewId:${quote(view.id)}}){clientMutationId}}`);
    changes.push('default view "View 1" removed');
  }
}

// Dependency alerts and automatic security updates.
const repositoryPath = `repos/${repository.nameWithOwner}`;
const answers = (args: readonly string[]) => {
  try {
    return gh(args);
  } catch {
    return undefined;
  }
};
try {
  if (answers(["api", `${repositoryPath}/vulnerability-alerts`]) === undefined) {
    gh(["api", "-X", "PUT", `${repositoryPath}/vulnerability-alerts`]);
    changes.push("Dependabot alerts enabled");
  }
  if (
    answers(["api", `${repositoryPath}/automated-security-fixes`, "--jq", ".enabled"])?.trim() !==
    "true"
  ) {
    gh(["api", "-X", "PUT", `${repositoryPath}/automated-security-fixes`]);
    changes.push("Dependabot security updates enabled");
  }
} catch (error) {
  notApplied.push(`Dependabot alerts: ${reason(error)}`);
}

// Actions: the workflow token only reads unless a workflow asks for more, and no
// workflow can approve a pull request. Independent of the workflow files.
try {
  const path = `${repositoryPath}/actions/permissions/workflow`;
  if (workflowPermissionsDiffer(ghJson(["api", path], workflowPermissionsShape))) {
    gh(["api", "-X", "PUT", path, "--input", "-"], JSON.stringify(wantedWorkflowPermissions));
    changes.push("workflow token set to read-only; workflows cannot approve pull requests");
  }
} catch (error) {
  notApplied.push(`Actions workflow permissions: ${reason(error)}`);
}

// Secret scanning with push protection, where the plan and visibility offer it.
const scanningStatus = json.optional(json.object({ status: json.optional(json.string) }));
const scanning = ghJson(
  ["api", repositoryPath],
  json.object({
    security_and_analysis: json.optional(
      json.nullable(
        json.object({
          secret_scanning: scanningStatus,
          secret_scanning_push_protection: scanningStatus,
        }),
      ),
    ),
  }),
).security_and_analysis;
if (
  scanning?.secret_scanning?.status !== "enabled" ||
  scanning.secret_scanning_push_protection?.status !== "enabled"
) {
  try {
    gh(
      ["api", "-X", "PATCH", repositoryPath, "--input", "-"],
      JSON.stringify({
        security_and_analysis: {
          secret_scanning: { status: "enabled" },
          secret_scanning_push_protection: { status: "enabled" },
        },
      }),
    );
    changes.push("secret scanning and push protection enabled");
  } catch {
    unavailable.push(
      "secret scanning and push protection (GitHub offers them for public repositories and with its secret protection product); the local scan stays the only one",
    );
  }
}

// GitHub Pages, deployed by .github/workflows/deploy.yml, and its environment:
// only main may deploy. See engineering/operations/deployment.md.
const pages = answers(["api", `${repositoryPath}/pages`]);
try {
  if (pages === undefined) {
    gh(["api", "-X", "POST", `${repositoryPath}/pages`, "-f", "build_type=workflow"]);
    changes.push("GitHub Pages enabled for deploys from workflows");
  } else if (
    json.parseJson(
      pages,
      json.object({ build_type: json.optional(json.nullable(json.string)) }),
      "gh api pages",
    ).build_type !== "workflow"
  ) {
    gh(["api", "-X", "PUT", `${repositoryPath}/pages`, "-f", "build_type=workflow"]);
    changes.push("GitHub Pages switched to deploys from workflows");
  }
} catch (error) {
  unavailable.push(
    `GitHub Pages (a private repository needs a paid plan); disable the Deploy workflow until it is available: ${reason(error)}`,
  );
}
// Environments only main may use: Pages deploys, and the testing farm's endpoints,
// which .github/workflows/browser-farm.yml reads (engineering/agents/browser-testing.md).
for (const name of ["github-pages", "browser-farm"]) {
  try {
    const environment = limitEnvironmentToMain(repositoryPath, name);
    changes.push(...environment.changes);
    if (environment.others.length > 0) {
      notApplied.push(
        `environment ${name} also allows ${environment.others.join(", ")}; remove them unless they are wanted`,
      );
    }
  } catch (error) {
    notApplied.push(`environment ${name}: ${reason(error)}`);
  }
}

// PR browser acceptance runs locally on the GPU and is reported on the PR.
// Legacy BROWSER_TESTS_IN_CI variables are harmless: no workflow consumes them.

// Immutable releases: a published release's assets and tag cannot change.
try {
  const immutable = answers(["api", `${repositoryPath}/immutable-releases`]);
  if (
    immutable === undefined ||
    !json.parseJson(immutable, json.object({ enabled: json.boolean }), "gh api immutable-releases")
      .enabled
  ) {
    gh(["api", "-X", "PUT", `${repositoryPath}/immutable-releases`]);
    changes.push("immutable releases enabled");
  }
} catch (error) {
  unavailable.push(`immutable releases: ${reason(error)}`);
}

// Private vulnerability reporting, the path SECURITY.md names.
try {
  const reporting = answers(["api", `${repositoryPath}/private-vulnerability-reporting`]);
  if (
    reporting === undefined ||
    !json.parseJson(
      reporting,
      json.object({ enabled: json.boolean }),
      "gh api private-vulnerability-reporting",
    ).enabled
  ) {
    gh(["api", "-X", "PUT", `${repositoryPath}/private-vulnerability-reporting`]);
    changes.push("private vulnerability reporting enabled");
  }
} catch {
  unavailable.push(
    "private vulnerability reporting (GitHub offers it for public repositories); until then, reporters contact the owner directly",
  );
}

// Rulesets: created from the files under .github/rulesets when none of that name exists.
// An existing one is compared with its file and never overwritten.
const rulesetDirectory = resolve(root, ".github/rulesets");
const rulesetFiles = readdirSync(rulesetDirectory)
  .filter((name) => name.endsWith(".json"))
  .toSorted();
let hostedRulesets: Map<string, number> | undefined;
try {
  hostedRulesets = new Map(
    ghJson(
      ["api", `${repositoryPath}/rulesets`],
      json.array(json.object({ id: json.number, name: json.string })),
    ).map((ruleset) => [ruleset.name, ruleset.id]),
  );
} catch (error) {
  notApplied.push(`rulesets could not be read: ${reason(error)}`);
}
for (const file of hostedRulesets === undefined ? [] : rulesetFiles) {
  const body = readFileSync(join(rulesetDirectory, file), "utf8");
  const wanted = json.parseJson(body, rulesetShape, `.github/rulesets/${file}`);
  const hostedId = hostedRulesets?.get(wanted.name);
  try {
    if (hostedId === undefined) {
      gh(["api", "-X", "POST", `${repositoryPath}/rulesets`, "--input", "-"], body);
      changes.push(`ruleset "${wanted.name}" created`);
      continue;
    }
    const hosted = ghJson(["api", `${repositoryPath}/rulesets/${hostedId}`], rulesetShape);
    const drift = rulesetDrift(wanted, hosted);
    if (drift.length > 0) {
      notApplied.push(
        `ruleset "${wanted.name}" differs from .github/rulesets/${file}: ${drift.join("; ")}`,
      );
    }
  } catch (error) {
    notApplied.push(`ruleset "${wanted.name}": ${reason(error)}`);
  }
}

console.log(
  changes.length === 0 ? "\nNo changes." : `\nChanged:\n${changes.map((c) => `- ${c}`).join("\n")}`,
);
if (unavailable.length > 0) {
  console.log(`\nNot available here:\n${unavailable.map((entry) => `- ${entry}`).join("\n")}`);
}
if (notApplied.length > 0) {
  console.error(`\nNot applied:\n${notApplied.map((entry) => `- ${entry}`).join("\n")}`);
  console.error("See engineering/operations/github-hosted-settings.md for the manual steps.");
  process.exitCode = 1;
}
