// The standup report of `pnpm issue standup`: where the work stands, in one view, built from
// GitHub data without a model. scripts/workflow/issue.ts gathers the data; this file only writes it.

export type StandupIssue = {
  reference: string;
  title: string;
  priority?: string;
  /** The task worktree, for issues In progress. */
  worktree?: string;
  /** Open blockers, as references. */
  blockers: string[];
};

export type StandupPullRequest = {
  number: number;
  build: "success" | "failure" | "pending" | "missing";
  /** The branch it targets, which behindBy is counted against. */
  base: string;
  behindBy: number;
  /** Whether it is a draft. */
  draft: boolean;
};

export type StandupData = {
  inProgress: StandupIssue[];
  inReview: Array<StandupIssue & { pullRequests: StandupPullRequest[] }>;
  ready: StandupIssue[];
  /** Open issues with an open blocker, or with Status Blocked for a reason of their own. */
  blocked: StandupIssue[];
  limit: number;
};

/** How many Ready issues the report lists. */
const NEXT_READY = 5;

function pullRequestLine(pr: StandupPullRequest): string {
  const parts = [`build ${pr.build}`];
  if (pr.behindBy > 0) parts.push(`${pr.behindBy} behind ${pr.base}`);
  if (pr.draft) parts.push("draft");
  return `#${pr.number} (${parts.join(", ")})`;
}

/** The report as lines of text. */
export function standupReport(data: StandupData): string[] {
  const lines: string[] = [];
  lines.push(`In progress: ${data.inProgress.length} of ${data.limit}`);
  for (const issue of data.inProgress) {
    lines.push(
      `- ${issue.reference} ${issue.title}${issue.worktree === undefined ? " · no worktree here" : ` · ${issue.worktree}`}`,
    );
  }
  lines.push("", `In review: ${data.inReview.length}`);
  for (const issue of data.inReview) {
    const prs =
      issue.pullRequests.length === 0
        ? "no open pull request"
        : issue.pullRequests.map(pullRequestLine).join("; ");
    lines.push(`- ${issue.reference} ${issue.title} · ${prs}`);
  }
  lines.push("", `Blocked: ${data.blocked.length}`);
  for (const issue of data.blocked) {
    const why =
      issue.blockers.length === 0
        ? "Status Blocked, no blocker issue"
        : `by ${issue.blockers.join(", ")}`;
    lines.push(`- ${issue.reference} ${issue.title} · ${why}`);
  }
  const next = data.ready.filter((issue) => issue.blockers.length === 0).slice(0, NEXT_READY);
  lines.push("", `Next Ready: ${next.length} of ${data.ready.length}`);
  for (const issue of next) {
    lines.push(`- ${issue.priority ?? "no priority"} ${issue.reference} ${issue.title}`);
  }
  return lines;
}
