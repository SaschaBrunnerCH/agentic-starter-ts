const workTypeLabels = [
  "bug",
  "enhancement",
  "documentation",
  "investigation",
  "verification",
  "epic",
] as const;
const readinessLabels = ["ready-for-agent", "ready-for-human"] as const;

/** The most issues that may be In progress at once, not counting epics. */
export const inProgressLimit = 4;

export type IssueFacts = Readonly<{
  labels: readonly string[];
  /** Labels of each ancestor, nearest first. */
  ancestors: readonly (readonly string[])[];
  status: string | undefined;
  priority: string | undefined;
  openBlockers: number;
}>;

const hasAny = (labels: readonly string[], wanted: readonly string[]) =>
  labels.some((label) => wanted.includes(label));

/** What the issue metadata rules in engineering/agents/issue-tracker.md find wrong with an issue. */
export function metadataProblems(issue: IssueFacts): string[] {
  const problems: string[] = [];
  const isEpic = issue.labels.includes("epic");
  if (!hasAny(issue.labels, workTypeLabels)) problems.push("no work-type label");
  if (!issue.labels.some((label) => label.startsWith("area:"))) problems.push("no area:* label");
  if (issue.labels.includes("needs-triage")) problems.push("still carries needs-triage");
  if (!isEpic && !issue.ancestors.some((labels) => labels.includes("epic"))) {
    problems.push(
      issue.ancestors.length === 0 ? "no parent issue" : "no ancestor is labelled epic",
    );
  }
  if (issue.status === undefined) problems.push("not in the Project, or without a Status");
  // An issue gets a priority when it leaves Backlog; epics are ordered by their children.
  if (
    !isEpic &&
    issue.status !== undefined &&
    !["Backlog", "Done"].includes(issue.status) &&
    issue.priority === undefined
  ) {
    problems.push(`${issue.status} without a Priority`);
  }
  if (issue.status === "Ready") {
    if (isEpic) problems.push("an epic is never Ready");
    if (!hasAny(issue.labels, readinessLabels)) problems.push("Ready without a readiness label");
    if (issue.openBlockers > 0) problems.push("Ready with an open blocker");
  }
  if (isEpic && hasAny(issue.labels, readinessLabels)) {
    problems.push("an epic carries no readiness label");
  }
  return problems;
}

/** Why an agent may not start this issue now; empty when it may. */
export function startBlockers(issue: IssueFacts, inProgress: number): string[] {
  const blockers: string[] = [];
  if (issue.labels.includes("epic")) blockers.push("it is an epic; work on one of its children");
  if (issue.labels.includes("decision-needed")) blockers.push("it waits for the owner's decision");
  if (issue.labels.includes("needs-triage") || issue.labels.includes("needs-info")) {
    blockers.push("it is not triaged");
  }
  if (issue.openBlockers > 0) blockers.push(`it has ${issue.openBlockers} open blocker(s)`);
  if (issue.priority === undefined && !issue.labels.includes("epic")) {
    blockers.push("it has no Priority; set one with pnpm issue status");
  }
  if (issue.status !== "In progress" && inProgress >= inProgressLimit) {
    blockers.push(`${inProgress} issues are already In progress (limit ${inProgressLimit})`);
  }
  return blockers;
}
