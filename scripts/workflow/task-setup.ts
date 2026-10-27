import * as json from "../shared/json-shape.ts";

const begin = "<!-- task-setup -->";
const end = "<!-- /task-setup -->";
const shape = json.object({
  issue: json.number,
  owner: json.string,
  directory: json.string,
  branch: json.string,
  base: json.string,
  stage: json.string,
  completed: json.array(json.string),
  failure: json.optional(json.string),
});
export type TaskSetup = json.ShapeOf<typeof shape>;
const setupSteps = ["claim", "install", "hooks"] as const;
export type SetupStep = (typeof setupSteps)[number];

/** Keep the setup receipt in the existing handoff, preserving its authored content. */
export function setupHandoff(text: string, setup: TaskSetup): string {
  if (text.split(begin).length > 2 || text.split(end).length > 2)
    throw new Error("Malformed setup receipt; duplicate framing.");
  const recovery = setupRecovery(setup);
  const instructions =
    recovery.length === 0
      ? ""
      : `\nRemaining setup recovery:\n\n\`\`\`text\n${recovery.join("\n")}\n\`\`\`\n`;
  const section = `${begin}\n\`\`\`json\n${JSON.stringify(setup, null, 2)}\n\`\`\`\n${instructions}${end}`;
  const start = text.indexOf(begin),
    finish = text.indexOf(end);
  if (start === -1 && finish === -1) return `${text.trimEnd()}\n\n## Setup receipt\n\n${section}\n`;
  if (start === -1 || finish < start)
    throw new Error("Malformed setup receipt; preserve the handoff and inspect it.");
  return text.slice(0, start) + section + text.slice(finish + end.length);
}

export function readSetup(text: string): TaskSetup | undefined {
  if (text.split(begin).length > 2 || text.split(end).length > 2)
    throw new Error("Malformed setup receipt; duplicate framing.");
  const block =
    /<!-- task-setup -->\n```json\n([^]*?)\n```\n(?:\nRemaining setup recovery:\n\n```text\n[^]*?\n```\n)?<!-- \/task-setup -->/u.exec(
      text,
    )?.[1];
  if (block === undefined) {
    if (text.includes(begin) || text.includes(end))
      throw new Error("Malformed setup receipt; preserve the handoff and inspect it.");
    return undefined;
  }
  const result = json.parseJson(block, shape, "task setup receipt");
  const stages = [...setupSteps, "complete"];
  if (
    !Number.isSafeInteger(result.issue) ||
    !result.owner ||
    !result.directory ||
    !result.branch ||
    result.issue <= 0 ||
    !stages.includes(result.stage) ||
    !/^[a-f\d]{40}$/u.test(result.base) ||
    result.completed.some((step) => !setupSteps.some((known) => known === step))
  )
    throw new Error("Invalid task setup receipt; no recovery was attempted.");
  const expected =
    result.stage === "complete"
      ? [...setupSteps]
      : setupSteps.slice(
          0,
          setupSteps.findIndex((step) => step === result.stage),
        );
  if (
    result.completed.join(",") !== expected.join(",") ||
    (result.stage === "complete" && result.failure !== undefined)
  )
    throw new Error("Inconsistent task setup receipt; no recovery was attempted.");
  return result;
}

export function setupResult(setup: TaskSetup, step: SetupStep, failure?: string): TaskSetup {
  if (failure !== undefined) return { ...setup, stage: step, failure };
  const { failure: _failure, ...previous } = setup;
  return {
    ...previous,
    completed: [...setup.completed, step],
    stage: setupSteps[setupSteps.indexOf(step) + 1] ?? "complete",
  };
}

/** POSIX display only: the supported task platforms use this shell quoting. */
export function setupRecovery(setup: TaskSetup): string[] {
  if (setup.stage === "complete") return [];
  if (setup.stage === "claim")
    return [
      `pnpm issue show ${setup.issue}`,
      "Resolve the incomplete claim before local setup; no remote write is retried automatically.",
    ];
  const directory = `'${setup.directory.replaceAll("'", "'\\''")}'`;
  return [
    ...(setup.stage === "install" ? [`cd ${directory} && pnpm install --frozen-lockfile`] : []),
    `cd ${directory} && pnpm check:hooks`,
    `pnpm task resume ${setup.issue} # explicitly retry only the remaining local setup steps`,
  ];
}
