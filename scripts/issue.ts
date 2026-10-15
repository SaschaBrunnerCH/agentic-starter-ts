import { readFileSync } from "node:fs";
import { gh, ghJson, graphql, mutation, quote } from "./github.ts";
import { scriptArguments } from "./script-arguments.ts";
import * as json from "./json-shape.ts";
import { overlaps, touchesOf } from "./issue-touches.ts";
import {
  bodyProblems,
  inProgressLimit,
  metadataProblems,
  startBlockers,
  type IssueFacts,
} from "./issue-metadata.ts";

// The mandatory issue operations of engineering/agents/issue-tracker.md as
// commands, so nobody has to look up Project field and option identifiers.

const usage = `Usage: pnpm issue <command>

  create --title <t> --label <l>... [--body-file <f> | --body <text>] [--parent <n>] [--status <s>] [--priority <p>]
                                       Create an issue with complete metadata in one step; a non-epic needs --parent
  show <number>                        Labels, parent chain, Project fields, blockers and metadata problems
  status <number> <status> [priority]  Add to the Project if needed, set Status (and Priority), read back
  parent <number> <parent>             Set the native parent issue
  blocked-by <number> <blocker>        Add a native blocker; <blocker> is a number or owner/repo#number
  claim <number> [--check]             Assign yourself and set In progress, if the issue may be started;
                                       --check only reports whether it may be started
  wip                                  List the issues In progress against the limit
  ready                                List the Ready issues, highest Priority first

Statuses: Backlog, Ready, "In progress", "In review", Blocked, Done. Priorities: P0, P1, P2.`;

const labelsShape = json.object({ nodes: json.array(json.object({ name: json.string })) });
type Labels = json.ShapeOf<typeof labelsShape>;
type Ancestor = { number: number; title: string; labels: Labels; parent?: Ancestor | null };
function ancestorShape(value: unknown, path: string, problems: string[]): value is Ancestor {
  return json.object({
    number: json.number,
    title: json.string,
    labels: labelsShape,
    parent: json.optional(json.nullable(ancestorShape)),
  })(value, path, problems);
}
const singleSelectValue = json.nullable(json.object({ name: json.string }));
const issueShape = json.object({
  id: json.string,
  number: json.number,
  title: json.string,
  body: json.string,
  state: json.string,
  labels: labelsShape,
  assignees: json.object({ nodes: json.array(json.object({ login: json.string })) }),
  parent: json.nullable(ancestorShape),
  blockedBy: json.object({
    nodes: json.array(
      json.object({
        number: json.number,
        state: json.string,
        repository: json.object({ nameWithOwner: json.string }),
      }),
    ),
  }),
  projectItems: json.object({
    nodes: json.array(
      json.object({
        id: json.string,
        project: json.object({ id: json.string }),
        status: singleSelectValue,
        priority: singleSelectValue,
      }),
    ),
  }),
});
type Issue = json.ShapeOf<typeof issueShape>;
// Fields of other types match the fragment with an empty object.
const projectShape = json.object({
  id: json.string,
  number: json.number,
  title: json.string,
  url: json.string,
  fields: json.object({
    nodes: json.array(
      json.object({
        id: json.optional(json.string),
        name: json.optional(json.string),
        options: json.optional(json.array(json.object({ id: json.string, name: json.string }))),
      }),
    ),
  }),
});
type Project = json.ShapeOf<typeof projectShape>;

const repositoryShape = json.object({
  name: json.string,
  owner: json.object({ login: json.string }),
});
let knownRepository: json.ShapeOf<typeof repositoryShape> | undefined;

/** Asked on first use, so the usage text prints without the GitHub CLI. */
function repository() {
  knownRepository ??= ghJson(["repo", "view", "--json", "name,owner"], repositoryShape);
  return knownRepository;
}

function project(): Project {
  const projects = graphql(
    "query($owner:String!,$name:String!){repository(owner:$owner,name:$name){projectsV2(first:20){nodes{id number title url fields(first:50){nodes{... on ProjectV2SingleSelectField{id name options{id name}}}}}}}}",
    json.object({
      repository: json.object({ projectsV2: json.object({ nodes: json.array(projectShape) }) }),
    }),
    { owner: repository().owner.login, name: repository().name },
  ).repository.projectsV2.nodes;
  const found = projects.find((candidate) => candidate.title === repository().name);
  if (found === undefined) {
    throw new Error(
      `No Project named "${repository().name}" is linked to this repository. Run \`pnpm setup:github\` first.`,
    );
  }
  return found;
}

const ancestorFields = "number title labels(first:30){nodes{name}}";

function issue(reference: string): Issue {
  const match = /^(?:([\w.-]+)\/([\w.-]+)#)?(\d+)$/u.exec(reference.replace(/^#/u, ""));
  if (match === null) throw new Error(`Not an issue reference: ${reference}`);
  const [, owner = repository().owner.login, name = repository().name, number = ""] = match;
  const found = graphql(
    `query($owner:String!,$name:String!){repository(owner:$owner,name:$name){issue(number:${number}){id number title body state labels(first:30){nodes{name}} assignees(first:10){nodes{login}} parent{${ancestorFields} parent{${ancestorFields} parent{${ancestorFields} parent{${ancestorFields}}}}} blockedBy(first:30){nodes{number state repository{nameWithOwner}}} projectItems(first:10){nodes{id project{id} status:fieldValueByName(name:"Status"){... on ProjectV2ItemFieldSingleSelectValue{name}} priority:fieldValueByName(name:"Priority"){... on ProjectV2ItemFieldSingleSelectValue{name}}}}}}}`,
    json.object({ repository: json.object({ issue: json.nullable(issueShape) }) }),
    { owner, name },
  ).repository.issue;
  if (found === null) throw new Error(`Issue ${reference} does not exist`);
  return found;
}

const labelNames = (item: { labels: Labels }) => item.labels.nodes.map((label) => label.name);

function ancestors(found: Issue): Ancestor[] {
  const chain: Ancestor[] = [];
  for (let next: Ancestor | null | undefined = found.parent; next; next = next.parent)
    chain.push(next);
  return chain;
}

function facts(found: Issue, board: Project): IssueFacts {
  const item = found.projectItems.nodes.find((candidate) => candidate.project.id === board.id);
  return {
    labels: found.labels.nodes.map((label) => label.name),
    ancestors: ancestors(found).map((ancestor) => ancestor.labels.nodes.map((label) => label.name)),
    status: item?.status?.name,
    priority: item?.priority?.name,
    openBlockers: found.blockedBy.nodes.filter((blocker) => blocker.state === "OPEN").length,
  };
}

/** Prints the issue and returns how many metadata problems it has. */
function show(reference: string): number {
  const board = project();
  const found = issue(reference);
  const item = found.projectItems.nodes.find((candidate) => candidate.project.id === board.id);
  const chain = ancestors(found);
  console.log(`#${found.number} ${found.title} [${found.state}]`);
  console.log(`Labels:    ${found.labels.nodes.map((label) => label.name).join(", ") || "none"}`);
  console.log(`Assignees: ${found.assignees.nodes.map((user) => user.login).join(", ") || "none"}`);
  console.log(
    `Parents:   ${chain.map((ancestor) => `#${ancestor.number} ${ancestor.title}`).join(" < ") || "none"}`,
  );
  console.log(`Status:    ${item?.status?.name ?? "not set"}`);
  console.log(`Priority:  ${item?.priority?.name ?? "not set"}`);
  console.log(
    `Blockers:  ${
      found.blockedBy.nodes
        .map((blocker) => `${blocker.repository.nameWithOwner}#${blocker.number} ${blocker.state}`)
        .join(", ") || "none"
    }`,
  );
  console.log(`Touches:   ${touchesOf(found.body).join(", ") || "not stated"}`);
  const problems = found.state === "OPEN" ? metadataProblems(facts(found, board)) : [];
  console.log(problems.length === 0 ? "Metadata:  complete" : `Metadata:  ${problems.join("; ")}`);
  return problems.length;
}

function optionId(board: Project, fieldName: string, optionName: string) {
  const field = board.fields.nodes.find((candidate) => candidate.name === fieldName);
  const option = field?.options?.find(
    (candidate) => candidate.name.toLowerCase() === optionName.toLowerCase(),
  );
  if (field?.id === undefined || option === undefined) {
    const known = field?.options?.map((candidate) => candidate.name).join(", ") ?? "none";
    throw new Error(`${fieldName} has no option "${optionName}". Options: ${known}`);
  }
  return { fieldId: field.id, optionId: option.id };
}

/** The item of an issue in the Project, added when absent. */
function projectItem(board: Project, reference: string): string {
  // Setting a parent can make GitHub add the issue to the Project at the same moment;
  // the add then fails with "already exists" before the item is visible. Look again.
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const found = issue(reference);
    const existing = found.projectItems.nodes.find((item) => item.project.id === board.id);
    if (existing !== undefined) return existing.id;
    try {
      return graphql(
        `mutation{addProjectV2ItemById(input:{projectId:${quote(board.id)},contentId:${quote(found.id)}}){item{id}}}`,
        json.object({
          addProjectV2ItemById: json.object({ item: json.object({ id: json.string }) }),
        }),
      ).addProjectV2ItemById.item.id;
    } catch (error) {
      if (!String(error).includes("already exists")) throw error;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1000);
    }
  }
  throw new Error(`Could not find or add ${reference} in the Project; try again.`);
}

function setFields(reference: string, status: string, priority?: string) {
  const board = project();
  const itemId = projectItem(board, reference);
  const values: [field: string, option: string][] = [["Status", status]];
  if (priority !== undefined) values.push(["Priority", priority]);
  for (const [fieldName, optionName] of values) {
    const ids = optionId(board, fieldName, optionName);
    mutation(
      `mutation{updateProjectV2ItemFieldValue(input:{projectId:${quote(board.id)},itemId:${quote(itemId)},fieldId:${quote(ids.fieldId)},value:{singleSelectOptionId:${quote(ids.optionId)}}}){clientMutationId}}`,
    );
  }
}

const itemListLimit = 1000;

// Draft items have no number; fields without a value are absent.
const itemShape = json.object({
  status: json.optional(json.string),
  priority: json.optional(json.string),
  title: json.string,
  labels: json.optional(json.array(json.string)),
  content: json.object({
    number: json.optional(json.number),
    repository: json.optional(json.string),
  }),
});

/** "#12" for an issue of this repository, "owner/name#12" for one of another repository. */
function itemReference(item: json.ShapeOf<typeof itemShape>): string {
  const here = `${repository().owner.login}/${repository().name}`.toLowerCase();
  const number = `#${item.content.number ?? "?"}`;
  const there = item.content.repository;
  return there === undefined || there.toLowerCase() === here ? number : `${there}${number}`;
}

function items(board: Project) {
  const list = ghJson(
    [
      "project",
      "item-list",
      String(board.number),
      "--owner",
      repository().owner.login,
      "--limit",
      String(itemListLimit),
      "--format",
      "json",
    ],
    json.object({ items: json.array(itemShape) }),
  );
  if (list.items.length >= itemListLimit) {
    throw new Error(
      `The Project has ${itemListLimit} or more items, so a list from it may be incomplete. Archive Done items.`,
    );
  }
  return list.items.filter((item) => !(item.labels ?? []).includes("epic"));
}

const inProgress = (board: Project) => items(board).filter((item) => item.status === "In progress");

/** The Ready issues in the order to take them: Priority first, then the older issue. */
function ready(): number {
  const waiting = items(project())
    .filter((item) => item.status === "Ready")
    .toSorted(
      (a, b) =>
        (a.priority ?? "P9").localeCompare(b.priority ?? "P9") ||
        (a.content.number ?? 0) - (b.content.number ?? 0),
    );
  console.log(`Ready: ${waiting.length}`);
  for (const item of waiting) {
    const who =
      (item.labels ?? []).find((label) => label.startsWith("ready-for-")) ?? "no readiness label";
    console.log(
      `- ${item.priority ?? "no priority"} ${itemReference(item)} ${item.title} [${who}]`,
    );
  }
  if (waiting.length > 0)
    console.log("Check one before starting: pnpm issue claim <number> --check");
  return 0;
}

function wip(): number {
  const active = inProgress(project());
  console.log(`In progress: ${active.length} of ${inProgressLimit}`);
  for (const item of active) console.log(`- ${itemReference(item)} ${item.title}`);
  return active.length > inProgressLimit ? 1 : 0;
}

// Other issues In progress or In review whose "Touches" overlap this one's: a warning, since
// only the owner can say whether the work may run side by side.
function overlapWarnings(found: Issue, board: Project): string[] {
  const mine = touchesOf(found.body);
  if (mine.length === 0) return [];
  return items(board)
    .filter(
      (item) =>
        (item.status === "In progress" || item.status === "In review") &&
        item.content.number !== undefined &&
        item.content.number !== found.number &&
        itemReference(item).startsWith("#"),
    )
    .flatMap((item) => {
      const shared = overlaps(mine, touchesOf(issue(String(item.content.number)).body));
      return shared.length === 0
        ? []
        : [
            `${itemReference(item)} ${item.title} (${item.status}) also touches ${shared.join(", ")}`,
          ];
    });
}

function claim(reference: string, checkOnly: boolean): number {
  const board = project();
  const found = issue(reference);
  for (const warning of overlapWarnings(found, board)) console.log(`Warning: ${warning}.`);
  const before = facts(found, board).status;
  // Incomplete metadata stops the claim before anything is written.
  const blockers = [
    ...startBlockers(facts(found, board), inProgress(board).length),
    ...metadataProblems(facts(found, board)).map(
      (problem) => `its metadata is incomplete: ${problem}`,
    ),
  ];
  if (found.state !== "OPEN") blockers.unshift("it is closed");
  const others = found.assignees.nodes.map((user) => user.login);
  const me = gh(["api", "user", "--jq", ".login"]).trim();
  if (others.length > 0 && !others.includes(me)) {
    blockers.push(`it is assigned to ${others.join(", ")}`);
  }
  if (blockers.length > 0) {
    console.error(`#${found.number} cannot be started: ${blockers.join("; ")}.`);
    console.error("Report this to the owner instead of starting the work.");
    return 1;
  }
  if (checkOnly) {
    console.log(`#${found.number} may be started.`);
    return 0;
  }
  gh(["issue", "edit", String(found.number), "--add-assignee", "@me"]);
  // Two sessions can both see "unassigned". Whoever finds another assignee afterwards steps back.
  const rivals = issue(reference)
    .assignees.nodes.map((user) => user.login)
    .filter((login) => login !== me);
  if (rivals.length > 0) {
    gh(["issue", "edit", String(found.number), "--remove-assignee", "@me"]);
    console.error(
      `#${found.number} was claimed by ${rivals.join(", ")} at the same moment. Take another issue.`,
    );
    return 1;
  }
  setFields(reference, "In progress");
  // Two sessions claiming different issues at once can both pass the limit. Whoever
  // finds too many In progress afterwards steps back; both may, and both may retry.
  const active = inProgress(project()).length;
  if (before !== undefined && before !== "In progress" && active > inProgressLimit) {
    setFields(reference, before);
    if (others.length === 0)
      gh(["issue", "edit", String(found.number), "--remove-assignee", "@me"]);
    console.error(
      `#${found.number} was not started: ${active} issues were In progress after the claim (limit ${inProgressLimit}), so another session claimed one at the same moment. Try again later.`,
    );
    return 1;
  }
  show(reference);
  return 0;
}

function create(args: readonly string[]): number {
  const options = new Map<string, string[]>();
  for (let index = 0; index < args.length; index += 2) {
    const name = args[index];
    const value = args[index + 1];
    if (name === undefined || !name.startsWith("--") || value === undefined) {
      throw new Error(`Expected "--option value" pairs, got: ${args.slice(index).join(" ")}`);
    }
    options.set(name, [...(options.get(name) ?? []), value]);
  }
  const known = [
    "--title",
    "--label",
    "--body",
    "--body-file",
    "--parent",
    "--status",
    "--priority",
  ];
  const unknown = [...options.keys()].filter((name) => !known.includes(name));
  if (unknown.length > 0) throw new Error(`Unknown option: ${unknown.join(", ")}`);
  const one = (name: string) => options.get(name)?.[0];
  const title = one("--title");
  const labels = options.get("--label") ?? [];
  const parent = one("--parent");
  if (title === undefined) throw new Error("create needs --title");

  const bodyFile = one("--body-file");
  const bodyText = bodyFile === undefined ? (one("--body") ?? "") : readFileSync(bodyFile, "utf8");

  // Check the metadata before anything is created, so no half-described issue is left behind.
  const problems = metadataProblems({
    labels,
    ancestors:
      parent === undefined
        ? []
        : ancestors(issue(parent))
            .map(labelNames)
            .concat([labelNames(issue(parent))]),
    status: one("--status") ?? "Backlog",
    priority: one("--priority"),
    openBlockers: 0,
  }).concat(bodyProblems(bodyText, labels));
  if (problems.length > 0) {
    console.error(`Not created: ${problems.join("; ")}.`);
    return 1;
  }

  const board = project();
  optionId(board, "Status", one("--status") ?? "Backlog");
  const priority = one("--priority");
  if (priority !== undefined) optionId(board, "Priority", priority);

  const body =
    one("--body-file") === undefined
      ? ["--body", one("--body") ?? ""]
      : ["--body-file", one("--body-file") ?? ""];
  const url = gh([
    "issue",
    "create",
    "--title",
    title,
    ...body,
    ...labels.flatMap((label) => ["--label", label]),
  ]).trim();
  const number = url.slice(url.lastIndexOf("/") + 1);
  console.log(url);
  if (parent !== undefined) {
    mutation(
      `mutation{addSubIssue(input:{issueId:${quote(issue(parent).id)},subIssueId:${quote(issue(number).id)}}){clientMutationId}}`,
    );
  }
  setFields(number, one("--status") ?? "Backlog", one("--priority"));
  return show(number) === 0 ? 0 : 1;
}

const [command, ...commandArguments] = scriptArguments();
const [first, second, third] = commandArguments;
try {
  if (command === "create") process.exitCode = create(commandArguments);
  else if (command === "show" && first) process.exitCode = show(first) === 0 ? 0 : 1;
  else if (command === "status" && first && second) {
    // The exit code says whether the Status was written; "show" reports metadata problems.
    setFields(first, second, third);
    show(first);
  } else if (command === "parent" && first && second) {
    mutation(
      `mutation{addSubIssue(input:{issueId:${quote(issue(second).id)},subIssueId:${quote(issue(first).id)},replaceParent:true}){clientMutationId}}`,
    );
    show(first);
  } else if (command === "blocked-by" && first && second) {
    mutation(
      `mutation{addBlockedBy(input:{issueId:${quote(issue(first).id)},blockingIssueId:${quote(issue(second).id)}}){clientMutationId}}`,
    );
    show(first);
  } else if (command === "claim" && first) process.exitCode = claim(first, second === "--check");
  else if (command === "wip") process.exitCode = wip();
  else if (command === "ready") process.exitCode = ready();
  else {
    console.log(usage);
    process.exitCode = command === undefined || command === "help" ? 0 : 2;
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
