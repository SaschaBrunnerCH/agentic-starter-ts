import { evidenceFor, type BrowserRun } from "../browser/browser-evidence.ts";
import { classifyRenderer } from "../browser/browser-gpu.ts";

const documentation = (file: string) =>
  file.startsWith("engineering/") ||
  file === "LICENSE" ||
  /^[^/]+\.(?:md|mdx)$/u.test(file) ||
  (file.startsWith(".github/") && file.endsWith(".md"));
const unrelatedTooling = (file: string) =>
  file.startsWith("scripts/git/") ||
  /^scripts\/workflow\/(?:issue(?:-(?:metadata|touches))?|standup)(?:\.test)?\.ts$/u.test(file);

/** Local workflow policy, not attestation or a substitute for hosted merge rules. */
export function browserAcceptance(
  files: readonly string[],
  runs: readonly BrowserRun[],
  head: string,
): { ok: boolean; required: boolean; message: string } {
  if (files.length === 0)
    return {
      ok: false,
      required: true,
      message: "Browser acceptance: the PR diff is empty or unavailable.",
    };
  if (files.every((file) => documentation(file) || unrelatedTooling(file)))
    return {
      ok: true,
      required: false,
      message: "Browser acceptance exempt: documentation and unrelated issue/Git tooling only.",
    };

  const verdict = evidenceFor(runs, head);
  const missing =
    "Browser acceptance required: no run for the current PR head. Run pnpm test:browser on its clean checkout.";
  if (verdict.kind === "none" || verdict.kind === "other-commit")
    return { ok: false, required: true, message: missing };
  const run = verdict.run;
  const problems: string[] = [];
  if (run.dirty || run.sourceStable !== true) problems.push("source is dirty or unverified");
  if (run.buildCommit !== head) problems.push("local build identity does not match the head");
  if (run.target !== undefined || run.remote)
    problems.push("it tested a deployment or remote browser");
  if (run.status !== "passed") problems.push(`run status is ${run.status}`);
  if (run.complete !== true) problems.push("the full Chromium suite is incomplete or unverified");
  if (!Number.isFinite(Date.parse(run.finishedAt))) problems.push("run time is invalid");
  if (
    run.gpu !== "required" ||
    run.rendererKind !== "hardware" ||
    classifyRenderer(run.renderer) !== "hardware"
  )
    problems.push("local hardware verification is missing");
  if (run.projects.chromium === undefined) problems.push("Chromium was not tested");
  if (
    Object.values(run.projects).some(
      (counts) =>
        !Object.values(counts).every((value) => Number.isSafeInteger(value) && value >= 0) ||
        counts.passed === 0 ||
        counts.failed !== 0 ||
        counts.skipped !== 0 ||
        counts.flaky !== 0,
    )
  )
    problems.push("tests are failed, skipped, flaky, empty or have invalid counts");
  return {
    ok: problems.length === 0,
    required: true,
    message:
      problems.length === 0
        ? `Browser acceptance passed for ${head.slice(0, 7)}: complete local Chromium build on verified hardware.`
        : `Browser acceptance required: ${problems.join("; ")}. Rerun pnpm test:browser on the clean PR head.`,
  };
}
