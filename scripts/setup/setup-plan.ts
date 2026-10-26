import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { gh } from "../shared/github.ts";
import * as json from "../shared/json-shape.ts";
import { loadProjectLabels, labelChanges } from "./project-labels.ts";
import { personalizationProblems } from "./personalization.ts";
import { statusOptions, priorityOptions, views, canonical } from "./setup-configuration.ts";
import {
  rulesetShape,
  rulesetDrift,
  workflowPermissionsDiffer,
  workflowPermissionsShape,
} from "./ruleset-drift.ts";
import { missingScopes } from "./token-scopes.ts";

// Planning never runs the apply path: newly created resources have no real IDs or
// readbacks yet. Keep dependent work explicit instead of simulating successful writes.
type Status = "change" | "unchanged" | "deferred" | "blocked";
export type SetupPlan = { destination: string; items: { status: Status; description: string }[] };
type Read = (args: readonly string[]) => string;
const strings = json.array(json.object({ name: json.string }));

/** All REST requests here are GETs; GraphQL requests below contain queries only. */
function reader(read: Read) {
  function raw(path: string, optional = false): string | undefined {
    try {
      return read(["api", "--method", "GET", path]);
    } catch (error) {
      if (optional && error instanceof Error && /\bHTTP 404\b/u.test(error.message))
        return undefined;
      throw error;
    }
  }
  return {
    raw,
    value<T>(path: string, shape: json.Shape<T>): T {
      return json.parseJson(read(["api", "--method", "GET", path]), shape, path);
    },
    query<T>(query: string, shape: json.Shape<T>, variables: Readonly<Record<string, string>>): T {
      const args = ["api", "graphql", "-f", `query=${query}`];
      for (const [key, value] of Object.entries(variables)) args.push("-f", `${key}=${value}`);
      return json.parseJson(read(args), json.object({ data: shape }), "GitHub query").data;
    },
  };
}

function environmentPlan(
  api: ReturnType<typeof reader>,
  plan: SetupPlan,
  repository: string,
  name: string,
): boolean {
  const path = `repos/${repository}/environments/${name}`;
  const current = api.raw(path, true);
  if (current === undefined) {
    plan.items.push({
      status: "change",
      description: `create environment ${name} if absent and accessible (HTTP 404: not found or not visible)`,
    });
    plan.items.push({
      status: "deferred",
      description: `restrict ${name} to main after creation; branch policies cannot yet be inspected`,
    });
    return false;
  }
  const policy = json.parseJson(
    current,
    json.object({
      deployment_branch_policy: json.nullable(
        json.object({ protected_branches: json.boolean, custom_branch_policies: json.boolean }),
      ),
    }),
    path,
  ).deployment_branch_policy;
  const restricted = policy?.protected_branches === false && policy.custom_branch_policies;
  plan.items.push({
    status: restricted ? "unchanged" : "change",
    description: `environment ${name}: use custom deployment branches`,
  });
  const policies = api.value(
    `${path}/deployment-branch-policies`,
    json.object({
      branch_policies: json.array(
        json.object({ name: json.string, type: json.optional(json.string) }),
      ),
    }),
  ).branch_policies;
  const main = policies.some((entry) => entry.name === "main" && entry.type !== "tag");
  plan.items.push({
    status: main ? "unchanged" : "change",
    description: `environment ${name}: allow branch main`,
  });
  const others = policies.filter((entry) => entry.name !== "main" || entry.type === "tag");
  if (others.length)
    plan.items.push({
      status: "blocked",
      description: `environment ${name}: review other allowed branches/tags (${others.map((entry) => entry.name).join(", ")}); normal setup does not remove them`,
    });
  return restricted && main && others.length === 0;
}

function identity<T extends { url: string }>(
  root: string,
  read: Read,
  fields: string,
  shape: json.Shape<T>,
): T {
  const repository = json.parseJson(
    read(["repo", "view", "--json", fields]),
    shape,
    "repository identity",
  );
  const problems = personalizationProblems(root, repository.url);
  if (problems.length) throw new Error(problems.join("\n"));
  return repository;
}

export function githubSetupPlan(root: string, read: Read = gh): SetupPlan {
  // Preserve validation before even the first identity read.
  const labels = loadProjectLabels(join(root, ".github/labels.json"));
  const rules = readdirSync(join(root, ".github/rulesets"))
    .filter((file) => file.endsWith(".json"))
    .toSorted()
    .map((file) =>
      json.parseJson(
        readFileSync(join(root, ".github/rulesets", file), "utf8"),
        rulesetShape,
        file,
      ),
    );
  const repository = identity(
    root,
    read,
    "id,name,nameWithOwner,url,owner,squashMergeAllowed,mergeCommitAllowed,rebaseMergeAllowed,deleteBranchOnMerge",
    json.object({
      id: json.string,
      name: json.string,
      nameWithOwner: json.string,
      url: json.string,
      owner: json.object({ login: json.string }),
      squashMergeAllowed: json.boolean,
      mergeCommitAllowed: json.boolean,
      rebaseMergeAllowed: json.boolean,
      deleteBranchOnMerge: json.boolean,
    }),
  );
  const api = reader(read);
  const missing = missingScopes(read(["api", "--include", "user"]), ["repo", "project"]);
  if (missing.length) throw new Error(`Missing GitHub scopes: ${missing.join(", ")}`);
  const plan: SetupPlan = { destination: repository.url, items: [] };
  const add = (status: Status, description: string) => plan.items.push({ status, description });
  const path = `repos/${repository.nameWithOwner}`;
  const hostedLabels = json.parseJson(
    read(["label", "list", "--limit", "500", "--json", "name,color,description"]),
    json.array(json.object({ name: json.string, color: json.string, description: json.string })),
    "labels",
  );
  const changes = labelChanges(labels, hostedLabels);
  for (const change of changes)
    add(
      "change",
      `${change.exists ? "update" : "create"} label ${change.label.name}: color ${change.label.color}, description ${change.label.description}`,
    );
  if (!changes.length) add("unchanged", "configured labels");
  add(
    repository.squashMergeAllowed &&
      !repository.mergeCommitAllowed &&
      !repository.rebaseMergeAllowed &&
      repository.deleteBranchOnMerge
      ? "unchanged"
      : "change",
    "squash-only merging and branch deletion",
  );
  const owner = api.query(
    "query($login:String!){repositoryOwner(login:$login){id ... on ProjectV2Owner{projectsV2(first:100){nodes{id number title url closed}}}}}",
    json.object({
      repositoryOwner: json.object({
        projectsV2: json.object({
          nodes: json.array(
            json.object({ id: json.string, title: json.string, closed: json.boolean }),
          ),
        }),
      }),
    }),
    { login: repository.owner.login },
  ).repositoryOwner;
  const project = owner.projectsV2.nodes.find(
    (entry) => entry.title === repository.name && !entry.closed,
  );
  if (!project) {
    add("change", `create and link Project ${repository.name}`);
    add(
      "deferred",
      "configure Status/Priority options and standard views, removing the new default View 1, after the real Project exists; no future IDs or readbacks are assumed",
    );
  } else {
    const linked = api.query(
      "query($owner:String!,$name:String!){repository(owner:$owner,name:$name){projectsV2(first:100){nodes{id}}}}",
      json.object({
        repository: json.object({
          projectsV2: json.object({ nodes: json.array(json.object({ id: json.string })) }),
        }),
      }),
      { owner: repository.owner.login, name: repository.name },
    ).repository.projectsV2.nodes;
    add(
      linked.some((entry) => entry.id === project.id) ? "unchanged" : "change",
      "Project link to repository",
    );
    const state = api.query(
      "query($id:ID!){node(id:$id){... on ProjectV2{fields(first:50){nodes{... on ProjectV2SingleSelectField{id name options{id name color description}}}} views(first:50){nodes{id name layout filter}}}}}",
      json.object({
        node: json.object({
          fields: json.object({
            nodes: json.array(
              json.object({
                id: json.optional(json.string),
                name: json.optional(json.string),
                options: json.optional(json.array(json.object({ name: json.string }))),
              }),
            ),
          }),
          views: json.object({
            nodes: json.array(
              json.object({
                name: json.string,
                layout: json.string,
                filter: json.nullable(json.string),
              }),
            ),
          }),
        }),
      }),
      { id: project.id },
    ).node;
    for (const [name, standard] of [
      ["Status", statusOptions],
      ["Priority", priorityOptions],
    ] as const) {
      const field = state.fields.nodes.find((entry) => entry.name === name);
      if (field?.id === undefined && name === "Status") {
        add("blocked", "Project has no Status field");
        continue;
      }
      const existing = (field?.options ?? []).map((entry) => entry.name);
      const standardNames = new Set(standard.map((entry) => entry.name.toLowerCase()));
      const wanted = [
        ...standard.map((entry) => entry.name),
        ...existing.filter((entry) => !standardNames.has(canonical(entry))),
      ];
      add(
        field?.id !== undefined && existing.join("|") === wanted.join("|") ? "unchanged" : "change",
        `Project ${name} options: ${wanted.join(", ")} (preserve custom options and existing IDs)`,
      );
    }
    for (const [name, layout, filter] of views) {
      const view = state.views.nodes.find((entry) => entry.name === name);
      add(
        view?.layout === layout && view.filter === filter ? "unchanged" : "change",
        `Project view ${name}: ${layout}, filter ${filter}`,
      );
    }
  }
  add(
    api.raw(`${path}/vulnerability-alerts`, true) === undefined ? "change" : "unchanged",
    "Dependabot alerts (enable if available; a 404 does not prove absence)",
  );
  const fixes = api.value(
    `${path}/automated-security-fixes`,
    json.object({ enabled: json.boolean }),
  );
  add(fixes.enabled ? "unchanged" : "change", "Dependabot security updates");
  add(
    workflowPermissionsDiffer(
      api.value(`${path}/actions/permissions/workflow`, workflowPermissionsShape),
    )
      ? "change"
      : "unchanged",
    "read-only workflow token; workflows cannot approve pull requests",
  );
  const security = api.value(
    path,
    json.object({
      security_and_analysis: json.optional(
        json.nullable(
          json.object({
            secret_scanning: json.optional(json.object({ status: json.optional(json.string) })),
            secret_scanning_push_protection: json.optional(
              json.object({ status: json.optional(json.string) }),
            ),
          }),
        ),
      ),
    }),
  ).security_and_analysis;
  add(
    security?.secret_scanning?.status === "enabled" &&
      security.secret_scanning_push_protection?.status === "enabled"
      ? "unchanged"
      : "deferred",
    "enable secret scanning and push protection if the repository plan offers them; availability is established only on apply",
  );
  const pagesText = api.raw(`${path}/pages`, true);
  const pages =
    pagesText === undefined
      ? undefined
      : json.parseJson(
          pagesText,
          json.object({ build_type: json.optional(json.nullable(json.string)) }),
          "Pages",
        );
  add(
    pages?.build_type === "workflow" ? "unchanged" : "change",
    "Pages workflow deployment (create/switch only where available; 404 may mean not visible)",
  );
  const mainOnly = environmentPlan(api, plan, repository.nameWithOwner, "github-pages");
  environmentPlan(api, plan, repository.nameWithOwner, "browser-farm");
  for (const endpoint of ["immutable-releases", "private-vulnerability-reporting"]) {
    const current = api.raw(`${path}/${endpoint}`, true);
    add(
      current !== undefined &&
        json.parseJson(current, json.object({ enabled: json.boolean }), endpoint).enabled
        ? "unchanged"
        : "deferred",
      `enable ${endpoint} where available; confirm on apply`,
    );
  }
  const hostedRules = api.value(
    `${path}/rulesets`,
    json.array(json.object({ id: json.number, name: json.string })),
  );
  for (const wanted of rules) {
    const hosted = hostedRules.find((entry) => entry.name === wanted.name);
    if (!hosted) add("change", `create ruleset ${wanted.name} from .github/rulesets`);
    else {
      const drift = rulesetDrift(wanted, api.value(`${path}/rulesets/${hosted.id}`, rulesetShape));
      add(
        drift.length ? "blocked" : "unchanged",
        `ruleset ${wanted.name}${drift.length ? `: ${drift.join("; ")}; existing rulesets are not overwritten` : ""}`,
      );
    }
  }
  const variables = json
    .parseJson(
      read([
        "api",
        "--method",
        "GET",
        `${path}/actions/variables?per_page=100`,
        "--paginate",
        "--slurp",
      ]),
      json.array(
        json.object({
          variables: json.array(json.object({ name: json.string, value: json.string })),
        }),
      ),
      "repository variables",
    )
    .flatMap((page) => page.variables);
  const initialized = variables.find((entry) => entry.name === "PAGES_DEPLOYMENT_ENABLED");
  if (initialized) add("unchanged", "preserve the explicit PAGES_DEPLOYMENT_ENABLED choice");
  else
    add(
      pages?.build_type === "workflow" &&
        mainOnly &&
        !plan.items.some((entry) => entry.status === "blocked")
        ? "change"
        : "deferred",
      "set PAGES_DEPLOYMENT_ENABLED=true only after complete successful setup and actual Pages/environment verification",
    );
  return plan;
}

export function previewsSetupPlan(root: string, read: Read = gh): SetupPlan {
  const repository = identity(
    root,
    read,
    "nameWithOwner,visibility,url",
    json.object({ nameWithOwner: json.string, visibility: json.string, url: json.string }),
  );
  const api = reader(read);
  const plan: SetupPlan = { destination: repository.url, items: [] };
  const add = (status: Status, description: string) => plan.items.push({ status, description });
  const previews = `${repository.nameWithOwner}-previews`;
  const path = `repos/${previews}`;
  const current = api.raw(path, true);
  add(
    current === undefined ? "change" : "unchanged",
    `preview repository ${previews}: create with source visibility ${repository.visibility} if absent and accessible; a 404 may mean not visible`,
  );
  let pagesUrl: string | undefined;
  let keys: { id: number; title: string }[] = [];
  if (current === undefined) {
    add(
      "deferred",
      "create gh-pages/.nojekyll and Pages after preview repository creation; inspect its actual branch, Pages URL and deploy keys then",
    );
  } else {
    add(
      api.raw(`${path}/branches/gh-pages`, true) === undefined ? "change" : "unchanged",
      "preview gh-pages branch and .nojekyll (create the branch from actual HEAD if missing)",
    );
    const pages = api.raw(`${path}/pages`, true);
    if (pages === undefined)
      add("change", "enable preview Pages from gh-pages; obtain its URL on apply");
    else {
      pagesUrl = json.parseJson(
        pages,
        json.object({ html_url: json.string }),
        "preview Pages",
      ).html_url;
      add("unchanged", "preview Pages");
    }
    keys = api.value(
      `${path}/keys`,
      json.array(json.object({ id: json.number, title: json.string })),
    );
  }
  environmentPlan(api, plan, repository.nameWithOwner, "previews");
  const environment = api.raw(`repos/${repository.nameWithOwner}/environments/previews`, true);
  const environmentSecrets =
    environment === undefined
      ? []
      : json.parseJson(
          read(["secret", "list", "--env", "previews", "--json", "name"]),
          strings,
          "environment secret names",
        );
  const matching = keys.filter(
    (entry) => entry.title === `previews from ${repository.nameWithOwner}`,
  );
  const pair =
    current !== undefined &&
    matching.length === 1 &&
    environmentSecrets.some((entry) => entry.name === "PREVIEWS_DEPLOY_KEY");
  add(
    pair ? "unchanged" : "deferred",
    `deploy-key/environment-secret pair: ${pair ? "keep existing pair" : `replace ${matching.length} matching keys and create/store a pair only on apply; no key is generated or secret value accessed by this plan`}`,
  );
  const secrets = json.parseJson(
    read(["secret", "list", "--json", "name"]),
    strings,
    "repository secret names",
  );
  add(
    secrets.some((entry) => entry.name === "PREVIEWS_DEPLOY_KEY") ? "change" : "unchanged",
    "remove legacy repository-level PREVIEWS_DEPLOY_KEY if present",
  );
  const variables = json.parseJson(
    read(["variable", "list", "--json", "name,value"]),
    json.array(json.object({ name: json.string, value: json.string })),
    "preview variables",
  );
  add(
    variables.some((entry) => entry.name === "PREVIEWS_REPOSITORY" && entry.value === previews)
      ? "unchanged"
      : "change",
    `set PREVIEWS_REPOSITORY=${previews}`,
  );
  if (pagesUrl === undefined)
    add("deferred", "set PREVIEWS_URL after reading the actual Pages URL on apply");
  else
    add(
      variables.some((entry) => entry.name === "PREVIEWS_URL" && entry.value === pagesUrl)
        ? "unchanged"
        : "change",
      `set PREVIEWS_URL=${pagesUrl}`,
    );
  return plan;
}

export function printSetupPlan(plan: SetupPlan): boolean {
  console.log(
    `Dry run: ${plan.destination}\n` +
      plan.items.map((entry) => `[${entry.status}] ${entry.description}`).join("\n") +
      "\nNo changes applied. Deferred work requires actual resource creation or verification.",
  );
  return !plan.items.some((entry) => entry.status === "blocked");
}
