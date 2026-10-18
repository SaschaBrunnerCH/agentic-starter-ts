import { attributionLine } from "../git/attribution.ts";

/** A title as a short lower-case path segment. */
export function slug(title: string, maxLength = 40): string {
  const words = title
    .normalize("NFKD")
    // "ü" becomes "u" plus a combining mark; drop the mark, keep the letter.
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .replace(/^epic:\s*/u, "")
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "");
  return words.slice(0, maxLength).replace(/-+$/u, "") || "task";
}

export const branchTypes = ["feat", "fix", "docs", "chore"] as const;
export type BranchType = (typeof branchTypes)[number];

/** The branch type an issue's labels imply. */
export function branchType(labels: readonly string[]): BranchType {
  if (labels.includes("bug")) return "fix";
  if (labels.includes("documentation")) return "docs";
  return "feat";
}

/** Branch and sibling worktree directory for an issue, as the task lifecycle names them. */
export function taskNames(repository: string, issue: number, title: string, type: BranchType) {
  const suffix = `${issue}-${slug(title)}`;
  return { branch: `${type}/${suffix}`, directory: `${repository}-${suffix}` };
}

/**
 * Issue numbers of this repository that a pull-request body closes or belongs to.
 * The closing keywords are GitHub's: close, closes, closed, fix, fixes, fixed,
 * resolve, resolves, resolved.
 */
export function linkedIssues(body: string): { closes: number[]; partOf: number[] } {
  const numbers = (pattern: RegExp) => [...body.matchAll(pattern)].map((match) => Number(match[1]));
  return {
    closes: numbers(/\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?):?\s+#(\d+)/giu),
    partOf: numbers(/\bpart of\s+#(\d+)/giu),
  };
}

/** Authors whose pull requests need no issue: dependency updates are their own specification. */
const automatedAuthors = ["dependabot[bot]", "app/dependabot", "dependabot"];

export type PullRequestFacts = Readonly<{
  state: string;
  isDraft: boolean;
  title: string;
  body: string;
  author: string;
  baseRefName: string;
  defaultBranch: string;
  /** Commits on the base branch that the head does not contain. */
  behindBy: number;
  /** The latest `PR build` check of GitHub Actions on the head commit. */
  build: "success" | "failure" | "pending" | "missing";
  /** Issues GitHub will close on merge. */
  closingIssues: readonly number[];
  /** Full messages of the pull request's commits. */
  commitMessages: readonly string[];
}>;

/** Why a pull request may not be merged yet; empty when it may, given the owner's authorization. */
export function readinessProblems(pullRequest: PullRequestFacts): string[] {
  const problems: string[] = [];
  if (pullRequest.state !== "OPEN") problems.push(`it is ${pullRequest.state.toLowerCase()}`);
  if (pullRequest.isDraft) problems.push("it is a draft");
  if (pullRequest.baseRefName !== pullRequest.defaultBranch) {
    problems.push(
      `its base is ${pullRequest.baseRefName}, not ${pullRequest.defaultBranch}; retarget it first`,
    );
  }
  if (pullRequest.behindBy > 0) {
    problems.push(`its branch is ${pullRequest.behindBy} commit(s) behind the base`);
  }
  if (pullRequest.build !== "success") {
    problems.push(
      pullRequest.build === "missing"
        ? "its head commit has no PR build"
        : `PR build on its head commit is ${pullRequest.build}`,
    );
  }
  const links = linkedIssues(pullRequest.body);
  const named = links.closes.length + links.partOf.length + pullRequest.closingIssues.length;
  if (named === 0 && !automatedAuthors.includes(pullRequest.author)) {
    problems.push('its body names no issue ("Closes #n" or "Part of #n")');
  }
  const attribution =
    attributionLine(`${pullRequest.title}\n${pullRequest.body}`) ??
    attributionLine(pullRequest.commitMessages.join("\n"));
  if (attribution !== undefined) {
    problems.push(`its text or a commit carries AI attribution: "${attribution.trim()}"`);
  }
  return problems;
}

/** The comment that records the owner's merge authorization for one commit, after it merged. */
export function authorizationComment(headCommit: string, date: string): string {
  return `Merged on the owner's authorization of ${date} for head commit ${headCommit}, with PR build green on that commit and the branch current with main.`;
}

/** Whether a commit the owner approved (full or abbreviated, at least 7 characters) is this head. */
export function isApprovedHead(approved: string, head: string): boolean {
  const wanted = approved.toLowerCase();
  return /^[0-9a-f]{7,40}$/u.test(wanted) && head.toLowerCase().startsWith(wanted);
}

/**
 * The directory of the worktree that has exactly this branch checked out, from
 * `git worktree list --porcelain`. A branch whose name merely starts with it is another task.
 */
export function worktreeOfBranch(porcelain: string, branch: string): string | undefined {
  for (const block of porcelain.split(/\n\n+/u)) {
    const lines = block.split("\n");
    if (lines.includes(`branch refs/heads/${branch}`)) {
      return lines.find((line) => line.startsWith("worktree "))?.slice("worktree ".length);
    }
  }
  return undefined;
}

/** Ignored paths the gate and the installer recreate; everything else may be evidence. */
const regenerable = [
  // .local/, test-results/ and playwright-report/ hold evidence, not disposable output.
  "node_modules/",
  "dist/",
  "coverage/",
  ".artifacts/",
];

/**
 * Ignored files in a worktree that removing it would destroy for good, from
 * `git status --porcelain --ignored`.
 */
export function irreplaceableIgnored(statusPorcelain: string): string[] {
  return statusPorcelain
    .split("\n")
    .filter((line) => line.startsWith("!! "))
    .map((line) => line.slice(3))
    .filter((path) => !regenerable.some((prefix) => path === prefix || path.startsWith(prefix)));
}

/** Changes in a worktree that are not committed: modified, staged or untracked files. */
export function uncommitted(statusPorcelain: string): string[] {
  return statusPorcelain.split("\n").filter((line) => line !== "" && !line.startsWith("!! "));
}

export type CleanupFacts = Readonly<{
  number: number;
  state: string;
  isCrossRepository: boolean;
  baseRefName: string;
  defaultBranch: string;
  /** The head commit of the merged pull request. */
  mergedHead: string;
  branch: string;
  /** The commit of the local branch; undefined when the branch does not exist. */
  branchTip: string | undefined;
  /** The worktree that has the branch checked out, if any. */
  worktree: string | undefined;
  primaryCheckout: string;
  workingDirectory: string;
  /** `git status --porcelain --ignored` of that worktree; undefined when it could not be read. */
  worktreeStatus: string | undefined;
  discardIgnored: boolean;
}>;

export type CleanupDecision = Readonly<{
  /** Why nothing at all may be removed. */
  refusal?: string;
  /** What stays, each with its reason. */
  retained: readonly string[];
  removeWorktree: boolean;
  deleteBranch: boolean;
}>;

/** What cleanup after a merge may remove. It removes only what the merge provably contains. */
export function cleanupDecision(facts: CleanupFacts): CleanupDecision {
  const nothing = { retained: [], removeWorktree: false, deleteBranch: false };
  const pr = `#${facts.number}`;
  if (facts.state !== "MERGED") {
    return { ...nothing, refusal: `${pr} is ${facts.state.toLowerCase()}, not merged.` };
  }
  if (facts.isCrossRepository) {
    return {
      ...nothing,
      refusal: `${pr} came from a fork; its branch name says nothing about local branches.`,
    };
  }
  if (facts.baseRefName !== facts.defaultBranch) {
    return {
      ...nothing,
      refusal: `${pr} was merged into ${facts.baseRefName}, not ${facts.defaultBranch}; its work is not on ${facts.defaultBranch} yet.`,
    };
  }
  if (facts.branchTip !== undefined && facts.branchTip !== facts.mergedHead) {
    return {
      ...nothing,
      retained: [
        `branch ${facts.branch}: its tip ${facts.branchTip.slice(0, 8)} is not the merged head ${facts.mergedHead.slice(0, 8)}; it holds commits outside the merged work`,
      ],
    };
  }
  const retained: string[] = [];
  const worktree = facts.worktree;
  if (worktree !== undefined) {
    const changes = uncommitted(facts.worktreeStatus ?? "");
    const ignored = irreplaceableIgnored(facts.worktreeStatus ?? "");
    if (worktree === facts.primaryCheckout) {
      retained.push(`${worktree}: it is the primary checkout; switch it back to main by hand`);
    } else if (`${facts.workingDirectory}/`.startsWith(`${worktree}/`)) {
      retained.push(
        `worktree ${worktree}: run cleanup from the primary checkout, not from inside it`,
      );
    } else if (facts.worktreeStatus === undefined) {
      retained.push(`worktree ${worktree}: its status could not be read`);
    } else if (changes.length > 0) {
      retained.push(
        `worktree ${worktree}: it has uncommitted or untracked files:\n${changes.join("\n")}`,
      );
    } else if (ignored.length > 0 && !facts.discardIgnored) {
      retained.push(
        `worktree ${worktree}: it holds ignored files that cannot be recreated:\n${ignored.join("\n")}\nKeep what is evidence, then rerun with --discard-ignored`,
      );
    }
  }
  const clear = retained.length === 0;
  return {
    retained,
    removeWorktree: clear && worktree !== undefined,
    deleteBranch: clear && facts.branchTip !== undefined,
  };
}
