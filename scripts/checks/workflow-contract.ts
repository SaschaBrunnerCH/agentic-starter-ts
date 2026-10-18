/** One job of a workflow file: its identifier and its lines, indentation kept. */
export type WorkflowJob = Readonly<{ id: string; lines: readonly string[] }>;

/**
 * The jobs of a workflow, read from its text. The workflows here are plain enough
 * that their structure can be read by indentation; actionlint checks the syntax.
 */
export function workflowJobs(workflow: string): WorkflowJob[] {
  const lines = workflow.split("\n");
  const start = lines.indexOf("jobs:");
  const jobs: { id: string; lines: string[] }[] = [];
  for (const line of start === -1 ? [] : lines.slice(start + 1)) {
    const id = /^ {2}([\w-]+):\s*$/u.exec(line)?.[1];
    if (id !== undefined) jobs.push({ id, lines: [] });
    else if (/^\S/u.test(line)) break;
    else jobs.at(-1)?.lines.push(line);
  }
  return jobs;
}

/** The steps of a job, each as its lines. */
function steps(job: WorkflowJob): string[][] {
  const found: string[][] = [];
  for (const line of job.lines) {
    if (/^ {6}- /u.test(line)) found.push([line]);
    else found.at(-1)?.push(line);
  }
  return found;
}

/** What every job of every workflow must have, whatever it does. */
export function jobProblems(job: WorkflowJob): string[] {
  const problems: string[] = [];
  if (!job.lines.some((line) => /^ {4}timeout-minutes: \d+/u.test(line))) {
    problems.push(`job ${job.id} has no timeout-minutes`);
  }
  for (const step of steps(job)) {
    const text = step.join("\n");
    if (/uses: actions\/checkout@/u.test(text) && !/persist-credentials: false/u.test(text)) {
      problems.push(`job ${job.id} checks out without persist-credentials: false`);
    }
    if (/uses: actions\/upload-artifact@/u.test(text) && !/retention-days: \d+/u.test(text)) {
      problems.push(`job ${job.id} uploads an artifact without retention-days`);
    }
  }
  return problems;
}

/**
 * Every job of the PR build must be a required status of the ruleset, so a job
 * added later cannot fail unnoticed. Its status is its name.
 */
export function requiredStatusProblems(
  jobs: readonly WorkflowJob[],
  required: readonly string[],
): string[] {
  return jobs.flatMap((job) => {
    const name = job.lines.map((line) => /^ {4}name: (.+)$/u.exec(line)?.[1]).find(Boolean);
    return name !== undefined && required.includes(name)
      ? []
      : [`job ${job.id} is not a required status of the ruleset`];
  });
}

/** PR browser acceptance runs locally on the verified GPU and is reported on the PR. */
export function browserStepProblems(job: WorkflowJob): string[] {
  return steps(job).flatMap((step) => {
    const text = step.join("\n");
    if (!/pnpm (?:run )?(?:test:browser|browser:cli)|playwright (?:test|install)/u.test(text))
      return [];
    const name = /- name: (.+)$/u.exec(step[0] ?? "")?.[1] ?? "unnamed step";
    return [
      `step "${name}" of job ${job.id} runs browser acceptance in CI; run it locally on the GPU and report it on the PR`,
    ];
  });
}
