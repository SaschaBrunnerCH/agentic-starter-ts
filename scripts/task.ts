import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { gh, ghJson, prBuild, root } from "./github.ts";
import { scriptArguments } from "./script-arguments.ts";
import {
  EVIDENCE_FILE,
  evidenceFor,
  evidenceMarker,
  evidenceMarkdown,
  readRuns,
} from "./browser-evidence.ts";
import {
  browserTestFiles,
  judge,
  namesControl,
  runOnBase,
  unitTestFiles,
  type BaseRun,
} from "./regression-proof.ts";
import * as json from "./json-shape.ts";
import {
  authorizationComment,
  branchType,
  cleanupDecision,
  branchTypes,
  isApprovedHead,
  linkedIssues,
  readinessProblems,
  taskNames,
  worktreeOfBranch,
  type BranchType,
  type PullRequestFacts,
} from "./task-rules.ts";

// The start and end of a task as commands: the steps of the task lifecycle and
// of "Requesting merge authorization" that are the same every time. Each
// command checks before it writes and refuses instead of guessing.

const usage = `Usage: pnpm task <command>

  start <issue> [feat|fix|docs|chore]   Claim the issue, create its sibling worktree and branch from origin/main, install
  ready <pr>                            Check that the pull request can be merged; set its issue to In review
  merge <pr> --authorized-by-owner --head <sha> [--admin]
                                        Merge the commit the owner approved, record the authorization, set issues Done
  cleanup <pr> [--discard-ignored]      After the merge: remove the task's worktree, branch and handoff
  handoff <issue>                       Create the handoff file for unfinished work if missing, and print its path

"merge" acts only with --authorized-by-owner and the head commit the owner approved, as "ready" printed it.
Pass them when the owner has said yes to this pull request at that commit, and never otherwise.
If "merge" stops after the merge, run it again: it then only records the authorization and sets Done.
--admin passes the review ruleset with the owner's account; it is needed for pull requests the owner did not author.`;

function git(args: readonly string[], cwd = root) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (result.error) throw new Error(`Could not run git (${result.error.message}).`);
  return { ok: result.status === 0, out: result.stdout.trim(), err: result.stderr.trim() };
}

function mustGit(args: readonly string[], cwd = root): string {
  const result = git(args, cwd);
  if (!result.ok) throw new Error(`git ${args.join(" ")} failed:\n${result.err}`);
  return result.out;
}

/** Runs another command of this repository with its output shown; returns whether it succeeded. */
function run(command: string, args: readonly string[], cwd = root): boolean {
  return spawnSync(command, args, { cwd, stdio: "inherit" }).status === 0;
}

const issueCommand = (args: readonly string[]) =>
  run(process.execPath, [join(root, "scripts/issue.ts"), ...args]);

const commonDirectory = mustGit(["rev-parse", "--path-format=absolute", "--git-common-dir"]);
const primaryCheckout = dirname(commonDirectory);
const handoffPath = (issue: number) => join(commonDirectory, "agent-handoffs", `issue-${issue}.md`);

type PullRequest = PullRequestFacts & {
  number: number;
  url: string;
  headRefOid: string;
  headRefName: string;
  isCrossRepository: boolean;
};

function pullRequest(reference: string): PullRequest {
  const repository = ghJson(
    ["repo", "view", "--json", "nameWithOwner,defaultBranchRef"],
    json.object({
      nameWithOwner: json.string,
      defaultBranchRef: json.object({ name: json.string }),
    }),
  );
  const found = ghJson(
    [
      "pr",
      "view",
      reference,
      "--json",
      "number,url,title,body,state,isDraft,author,headRefOid,headRefName,baseRefName,isCrossRepository,closingIssuesReferences,commits",
    ],
    json.object({
      number: json.number,
      url: json.string,
      title: json.string,
      body: json.string,
      state: json.string,
      isDraft: json.boolean,
      author: json.object({ login: json.string }),
      headRefOid: json.string,
      headRefName: json.string,
      baseRefName: json.string,
      isCrossRepository: json.boolean,
      closingIssuesReferences: json.array(json.object({ number: json.number })),
      commits: json.array(json.object({ messageHeadline: json.string, messageBody: json.string })),
    }),
  );
  const behindBy = Number(
    gh([
      "api",
      `repos/${repository.nameWithOwner}/compare/${found.baseRefName}...${found.headRefOid}`,
      "--jq",
      ".behind_by",
    ]),
  );
  const build = prBuild(repository.nameWithOwner, found.headRefOid);
  return {
    number: found.number,
    url: found.url,
    title: found.title,
    body: found.body,
    state: found.state,
    isDraft: found.isDraft,
    author: found.author.login,
    headRefOid: found.headRefOid,
    headRefName: found.headRefName,
    baseRefName: found.baseRefName,
    isCrossRepository: found.isCrossRepository,
    defaultBranch: repository.defaultBranchRef.name,
    behindBy,
    build,
    closingIssues: found.closingIssuesReferences.map((issue) => issue.number),
    commitMessages: found.commits.map(
      (commit) => `${commit.messageHeadline}\n\n${commit.messageBody}`,
    ),
  };
}

function issuesOf(found: PullRequest) {
  const links = linkedIssues(found.body);
  const closes = new Set([...links.closes, ...found.closingIssues]);
  return { closes: [...closes], partOf: links.partOf.filter((number) => !closes.has(number)) };
}

const isBranchType = (text: string): text is BranchType =>
  branchTypes.some((candidate) => candidate === text);

function start(issueArgument: string, typeArgument?: string): number {
  const issue = Number(issueArgument);
  if (!Number.isInteger(issue) || issue <= 0)
    throw new Error(`Not an issue number: ${issueArgument}`);
  if (typeArgument !== undefined && !isBranchType(typeArgument)) {
    throw new Error(`Unknown branch type "${typeArgument}". Use one of: ${branchTypes.join(", ")}`);
  }
  const found = ghJson(
    ["issue", "view", String(issue), "--json", "title,labels"],
    json.object({ title: json.string, labels: json.array(json.object({ name: json.string })) }),
  );
  const type = typeArgument ?? branchType(found.labels.map((label) => label.name));
  const names = taskNames(basename(primaryCheckout), issue, found.title, type);
  const directory = resolve(primaryCheckout, "..", names.directory);

  if (git(["rev-parse", "--verify", "--quiet", `refs/heads/${names.branch}`]).ok) {
    console.error(`Branch ${names.branch} already exists. Resume it instead of starting again:`);
    console.error(
      `  git worktree list   # then work in its directory, or: git worktree add ${directory} ${names.branch}`,
    );
    return 1;
  }
  if (existsSync(directory)) {
    console.error(`${directory} already exists. Inspect it before reusing or removing it.`);
    return 1;
  }
  // Nothing is written until the issue may be started and the worktree exists,
  // so a refusal or a failed fetch leaves no claim behind.
  if (!issueCommand(["claim", String(issue), "--check"])) return 1;
  mustGit(["fetch", "origin", "main"]);
  const base = mustGit(["rev-parse", "origin/main"]);
  mustGit(["worktree", "add", "--no-track", "-b", names.branch, directory, "origin/main"]);
  if (!issueCommand(["claim", String(issue)])) {
    // A refused claim leaves the issue unassigned to this account. A claim that failed
    // after assigning may have written more, so its worktree is kept for the record.
    const me = gh(["api", "user", "--jq", ".login"]).trim();
    const assignees = ghJson(
      ["issue", "view", String(issue), "--json", "assignees"],
      json.object({ assignees: json.array(json.object({ login: json.string })) }),
    ).assignees.map((user) => user.login);
    if (assignees.includes(me)) {
      writeHandoff(issue, { branch: names.branch, directory, base });
      console.error(
        `The claim of #${issue} failed partway: it is assigned to you. Check it with "pnpm issue show ${issue}"; the worktree ${directory} and the handoff are kept.`,
      );
      return 1;
    }
    // Another session took it in between. The worktree and branch are seconds old and empty.
    mustGit(["worktree", "remove", directory]);
    mustGit(["branch", "-D", names.branch]);
    console.error(`Removed the new worktree and branch again; #${issue} was not claimed.`);
    return 1;
  }
  // The handoff exists before anything else can fail.
  writeHandoff(issue, { branch: names.branch, directory, base });
  console.log(`\nInstalling dependencies in ${directory}`);
  if (!run("pnpm", ["install", "--frozen-lockfile"], directory)) {
    console.error(
      "pnpm install --frozen-lockfile failed in the new worktree; fix it there before working.",
    );
    return 1;
  }
  console.log(`\nStarted issue #${issue}`);
  console.log(`  Worktree: ${directory}`);
  console.log(`  Branch:   ${names.branch} from origin/main ${base.slice(0, 8)}`);
  console.log(`  Handoff:  ${handoffPath(issue)}`);
  console.log(`\nWork in the worktree. When the gate passes: push, open the pull request, then`);
  console.log(`  pnpm task ready <pr>`);
  return 0;
}

function writeHandoff(
  issue: number,
  known: { branch?: string; directory?: string; base?: string } = {},
): boolean {
  const path = handoffPath(issue);
  if (existsSync(path)) return false;
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(
    path,
    [
      `# Issue #${issue}`,
      "",
      `- Issue: #${issue}`,
      "- Pull request: none yet",
      "- Owner of the task: <session or person>",
      `- Worktree: ${known.directory ?? "<path>"}`,
      `- Branch: ${known.branch ?? "<branch>"}`,
      `- Base: origin/main ${known.base ?? "<commit>"}`,
      "- Current commit and uncommitted work: <state>",
      "",
      "## Decisions",
      "",
      "<accepted decisions with links to their durable records>",
      "",
      "## Remaining",
      "",
      "<acceptance criteria still open, and blockers>",
      "",
      "## Verification",
      "",
      "<commands, tested commits, outcomes, CI state>",
      "",
      "## Next action",
      "",
      "<what to do next; merge authorization given or its conditions; cleanup still owed>",
      "",
    ].join("\n"),
  );
  return true;
}

function handoff(issueArgument: string): number {
  const issue = Number(issueArgument);
  if (!Number.isInteger(issue) || issue <= 0)
    throw new Error(`Not an issue number: ${issueArgument}`);
  const created = writeHandoff(issue);
  console.log(`${created ? "Created" : "Exists"}: ${handoffPath(issue)}`);
  console.log("Fill in every placeholder before stopping; verify it against live state on resume.");
  console.log("This command does not print the content; open the file to read or edit it.");
  return 0;
}

function describe(found: PullRequest, problems: readonly string[]) {
  const issues = issuesOf(found);
  console.log(`#${found.number} ${found.title}`);
  console.log(`  ${found.url}`);
  console.log(`  Head commit: ${found.headRefOid}`);
  console.log(`  Base:        ${found.baseRefName}, ${found.behindBy} commit(s) behind`);
  console.log(`  PR build:    ${found.build}`);
  console.log(`  Closes:      ${issues.closes.map((n) => `#${n}`).join(", ") || "nothing"}`);
  if (issues.partOf.length > 0) {
    console.log(`  Part of:     ${issues.partOf.map((n) => `#${n}`).join(", ")}`);
  }
  if (problems.length > 0) console.log(`\nNot ready: ${problems.join("; ")}.`);
}

/** Sets the Project Status of issues and returns those that could not be set. */
function setStatus(issues: readonly number[], status: string): number[] {
  return issues.filter((issue) => !issueCommand(["status", String(issue), status]));
}

/** The issue labels that sort a pull request into a section of the release notes. */
const noteLabels = new Set(["enhancement", "bug", "documentation"]);

/** Copies those labels from the issues to the pull request; returns what failed. */
function labelPullRequest(found: PullRequest, issues: readonly number[]): string | undefined {
  try {
    const labels = new Set(
      issues.flatMap((issue) =>
        ghJson(
          ["issue", "view", String(issue), "--json", "labels"],
          json.object({ labels: json.array(json.object({ name: json.string })) }),
        )
          .labels.map((label) => label.name)
          .filter((name) => noteLabels.has(name)),
      ),
    );
    if (labels.size > 0) {
      gh(["pr", "edit", String(found.number), "--add-label", [...labels].join(",")]);
    }
    return undefined;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

// The local browser run for the head commit, as a pull-request comment once per commit; a
// warning when there is none. Browser runs are local, so this is the only place their results
// reach the pull request without being copied by hand.
function postBrowserEvidence(number: number, head: string): string {
  const file = resolve(root, EVIDENCE_FILE);
  const verdict = evidenceFor(
    readRuns(existsSync(file) ? readFileSync(file, "utf8") : undefined),
    head,
  );
  if (verdict.kind === "none") {
    return `No browser run is recorded in ${EVIDENCE_FILE}. If this change needs one, run pnpm test:browser and pnpm task ready again; otherwise say in the pull request why none is needed.`;
  }
  if (verdict.kind === "other-commit") {
    return `The latest recorded browser run is for ${verdict.run.commit.slice(0, 7)}, not the head ${head.slice(0, 7)}. Run the browser tests again, or say in the pull request why the earlier run still holds.`;
  }
  if (verdict.kind === "dirty") {
    return `The browser run on ${head.slice(0, 7)} started with uncommitted changes, so it tested something else. Commit or set them aside, run again, then pnpm task ready.`;
  }
  const comments = gh([
    "pr",
    "view",
    String(number),
    "--json",
    "comments",
    "--jq",
    ".comments[].body",
  ]);
  if (comments.includes(evidenceMarker(head)))
    return "Browser evidence for the head commit is already on the pull request.";
  gh(["pr", "comment", String(number), "--body", evidenceMarkdown(verdict.run)]);
  return `Posted the browser run of ${verdict.run.finishedAt} for ${head.slice(0, 7)} to the pull request.`;
}

// For a bug fix: the proof that its regression test fails without the fix, or why it is
// missing. The new or changed unit tests run against the code of the merge base.
function regressionProof(found: PullRequest): { ok: boolean; message: string } {
  const isBug = issuesOf(found).closes.some((issue) =>
    ghJson(
      ["issue", "view", String(issue), "--json", "labels"],
      json.object({ labels: json.array(json.object({ name: json.string })) }),
    ).labels.some((label) => label.name === "bug"),
  );
  if (!isBug) return { ok: true, message: "" };
  if (mustGit(["rev-parse", "HEAD"]) !== found.headRefOid) {
    return {
      ok: false,
      message: `a bug fix is proven from its head commit; check out ${found.headRefOid.slice(0, 7)} and run pnpm task ready again`,
    };
  }
  mustGit(["fetch", "--quiet", "origin", found.baseRefName]);
  const base = mustGit(["merge-base", `origin/${found.baseRefName}`, "HEAD"]);
  const changed = mustGit(["diff", "--name-only", "--diff-filter=AMR", base, "HEAD"])
    .split("\n")
    .filter((file) => file !== "");
  const units = unitTestFiles(changed);
  const browsers = browserTestFiles(changed);
  let baseRun: BaseRun | undefined;
  if (units.length > 0) {
    console.log(`\nRunning ${units.join(", ")} against the code of ${base.slice(0, 7)} …`);
    baseRun = runOnBase(root, base, found.headRefOid, units);
  }
  const verdict = judge(units, browsers, baseRun, namesControl(found.body));
  if (verdict.kind === "proven") {
    return {
      ok: true,
      message: `Regression proof: without the fix, ${verdict.failing.length} test(s) fail: ${verdict.failing.join("; ")}.`,
    };
  }
  if (verdict.kind === "browser-control") {
    return {
      ok: true,
      message: `Regression proof: the pull request names the control run for ${verdict.files.join(", ")}.`,
    };
  }
  return { ok: false, message: verdict.reason };
}

function ready(reference: string): number {
  const found = pullRequest(reference);
  const problems = readinessProblems(found);
  describe(found, problems);
  if (problems.length > 0) {
    if (found.behindBy > 0) {
      console.log(
        `Update the branch (gh pr update-branch ${found.number}) and wait for a new build.`,
      );
    }
    return 1;
  }
  const proof = regressionProof(found);
  if (!proof.ok) {
    console.log(`\nNot ready: ${proof.message}.`);
    return 1;
  }
  if (proof.message !== "") console.log(`\n${proof.message}`);
  console.log(`\n${postBrowserEvidence(found.number, found.headRefOid)}`);
  const unset = setStatus(issuesOf(found).closes, "In review");
  const unlabelled = labelPullRequest(found, issuesOf(found).closes);
  console.log(
    "\nReady. Show the owner this pull request and its head commit, and ask for authorization.",
  );
  console.log(
    `After an explicit yes: pnpm task merge ${found.number} --authorized-by-owner --head ${found.headRefOid}`,
  );
  if (unset.length > 0) {
    console.error(
      `\nCould not set In review for ${unset.map((n) => `#${n}`).join(", ")}; report this in the pull request.`,
    );
  }
  if (unlabelled !== undefined) {
    console.error(`\nCould not copy the issue labels to the pull request: ${unlabelled}`);
  }
  return 0;
}

function merge(reference: string, flags: readonly string[]): number {
  const approved = flags[flags.indexOf("--head") + 1];
  if (
    !flags.includes("--authorized-by-owner") ||
    !flags.includes("--head") ||
    approved === undefined ||
    approved.startsWith("--")
  ) {
    console.error("Refused: merge needs --authorized-by-owner and --head <sha>.");
    console.error(
      "Pass them only when the owner has said yes to this pull request at that head commit.",
    );
    return 2;
  }
  const found = pullRequest(reference);
  const problems = readinessProblems(found);
  describe(found, problems);
  if (!isApprovedHead(approved, found.headRefOid)) {
    console.error(
      `\nRefused: the owner approved ${approved}, but the head is now ${found.headRefOid}. A new commit needs a new authorization.`,
    );
    return 1;
  }
  // A merge whose record failed afterwards: record it now instead of merging again.
  if (found.state === "MERGED") return recordMerge(found);
  if (problems.length > 0) return 1;

  // The commit on main carries the title only: branch commit messages are not copied into it.
  const mergeArguments = [
    "pr",
    "merge",
    String(found.number),
    "--squash",
    "--match-head-commit",
    found.headRefOid,
    "--subject",
    `${found.title} (#${found.number})`,
    "--body",
    "",
  ];
  if (flags.includes("--admin")) mergeArguments.push("--admin");
  gh(mergeArguments);

  const state = gh([
    "pr",
    "view",
    String(found.number),
    "--json",
    "state",
    "--jq",
    ".state",
  ]).trim();
  if (state !== "MERGED") {
    console.error(
      `The merge was accepted but the pull request is ${state}; it may be queued. Nothing was recorded.`,
    );
    return 1;
  }
  return recordMerge(found);
}

/**
 * Records the authorization on a merged pull request and sets its issues Done. It runs
 * after the merge, so the record never claims a merge that did not happen, and again
 * when `merge` is repeated after a failure here; a record already present is kept.
 */
function recordMerge(found: PullRequest): number {
  const comments = ghJson(
    ["pr", "view", String(found.number), "--json", "comments"],
    json.object({ comments: json.array(json.object({ body: json.string })) }),
  ).comments;
  const recorded = comments.some(
    (comment) =>
      comment.body.startsWith("Merged on the owner's authorization") &&
      comment.body.includes(found.headRefOid),
  );
  if (!recorded) {
    const today = new Date().toISOString().slice(0, 10);
    gh([
      "pr",
      "comment",
      String(found.number),
      "--body",
      authorizationComment(found.headRefOid, today),
    ]);
  }
  console.log(`\n#${found.number} merged at ${found.headRefOid}; the authorization is recorded.`);
  const unset = setStatus(issuesOf(found).closes, "Done");
  if (unset.length > 0) {
    console.error(
      `Could not set Done for ${unset.map((n) => `#${n}`).join(", ")}; set it by hand.`,
    );
  }
  console.log(`\nNext, from the primary checkout: pnpm task cleanup ${found.number}`);
  return unset.length > 0 ? 1 : 0;
}

function cleanup(reference: string, flags: readonly string[]): number {
  // Fetched first, without a refspec, so the merged branch's remote-tracking ref is
  // pruned; a failed fetch stops the cleanup before anything is removed.
  mustGit(["fetch", "--prune", "origin"]);
  const found = pullRequest(reference);
  const branch = found.headRefName;
  const worktree = worktreeOfBranch(mustGit(["worktree", "list", "--porcelain"]), branch);
  const tip = git(["rev-parse", "--verify", "--quiet", `refs/heads/${branch}`]);
  const status =
    worktree === undefined ? undefined : git(["status", "--porcelain", "--ignored"], worktree);
  const decision = cleanupDecision({
    number: found.number,
    state: found.state,
    isCrossRepository: found.isCrossRepository,
    baseRefName: found.baseRefName,
    defaultBranch: found.defaultBranch,
    mergedHead: found.headRefOid,
    branch,
    branchTip: tip.ok ? tip.out : undefined,
    worktree,
    primaryCheckout,
    workingDirectory: process.cwd(),
    worktreeStatus: status?.ok === true ? status.out : undefined,
    discardIgnored: flags.includes("--discard-ignored"),
  });
  if (decision.refusal !== undefined) {
    console.error(`${decision.refusal} Nothing was removed.`);
    return 1;
  }
  const retained = decision.retained;
  const removed: string[] = [];
  if (decision.removeWorktree && worktree !== undefined) {
    // Not forced: git removes ignored files, and still refuses a locked worktree
    // or a file that appeared since the status above.
    mustGit(["worktree", "remove", worktree]);
    removed.push(`worktree ${worktree}`);
  }
  if (decision.deleteBranch) {
    // A squash merge leaves no ancestry; the rule compared the tip with the merged head.
    mustGit(["branch", "-D", branch]);
    removed.push(`branch ${branch}`);
  }
  // Read back what was removed.
  const left = [
    ...(decision.removeWorktree &&
    worktreeOfBranch(mustGit(["worktree", "list", "--porcelain"]), branch) !== undefined
      ? [`worktree of ${branch}`]
      : []),
    ...(decision.deleteBranch &&
    git(["rev-parse", "--verify", "--quiet", `refs/heads/${branch}`]).ok
      ? [`branch ${branch}`]
      : []),
  ];
  if (left.length > 0) {
    console.error(`Still present after removal: ${left.join(", ")}. Inspect them by hand.`);
    return 1;
  }
  if (retained.length === 0) {
    // A slice leaves its parent's handoff alone: that work is not finished.
    for (const issue of issuesOf(found).closes) {
      if (existsSync(handoffPath(issue))) {
        rmSync(handoffPath(issue));
        removed.push(`handoff ${handoffPath(issue)}`);
      }
    }
  }
  console.log(`#${found.number} merged at head ${found.headRefOid}`);
  console.log(
    removed.length > 0
      ? `Removed:\n${removed.map((item) => `- ${item}`).join("\n")}`
      : "Removed: nothing",
  );
  if (retained.length > 0) {
    console.log(`Retained:\n${retained.map((item) => `- ${item}`).join("\n")}`);
    return 1;
  }
  console.log(
    "Not checked by this command: processes still running from the worktree, and other sessions using it.",
  );
  return 0;
}

const [command, first, ...rest] = scriptArguments();
try {
  if (command === "start" && first) process.exitCode = start(first, rest[0]);
  else if (command === "ready" && first) process.exitCode = ready(first);
  else if (command === "merge" && first) process.exitCode = merge(first, rest);
  else if (command === "cleanup" && first) process.exitCode = cleanup(first, rest);
  else if (command === "handoff" && first) process.exitCode = handoff(first);
  else {
    console.log(usage);
    process.exitCode = command === undefined || command === "help" ? 0 : 2;
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
