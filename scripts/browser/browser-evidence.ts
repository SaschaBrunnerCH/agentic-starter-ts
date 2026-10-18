import { readProfile } from "./browser-gpu-profile.ts";
import * as json from "../shared/json-shape.ts";

// The record of local browser runs that `pnpm task ready` puts into the pull request, so the
// numbers there are the ones a run produced, for the commit it ran on, and not copied by hand.
// See engineering/agents/browser-testing.md.

/** Where the runs are recorded, relative to the repository root; ignored by Git. */
export const EVIDENCE_FILE = ".local/browser-evidence.json";
/** Runs kept in the file, newest last. */
const KEPT_RUNS = 20;

const countsShape = json.object({
  passed: json.number,
  failed: json.number,
  skipped: json.number,
  flaky: json.number,
});
const runShape = json.object({
  commit: json.string,
  /** Uncommitted changes when the run started: it then tested something else than the commit. */
  dirty: json.boolean,
  finishedAt: json.string,
  /** Playwright's overall status: passed, failed, timedout or interrupted. */
  status: json.string,
  /** "required" or "off", as BROWSER_GPU was. */
  gpu: json.string,
  /** The WebGL renderer the GPU check found; null when it did not run. */
  renderer: json.nullable(json.string),
  /** hardware or software, as the GPU check classified it; null when it did not run. */
  rendererKind: json.nullable(json.string),
  /** How the GPU was reached: headless, or a virtual display; null without the GPU check. */
  display: json.nullable(json.string),
  /** The WebGPU adapter when BROWSER_WEBGPU=required; absent otherwise. */
  webgpuAdapter: json.optional(json.string),
  /** A remote browser (a testing farm) instead of a local one. */
  remote: json.boolean,
  /** BROWSER_TEST_BASE_URL: a deployment, not necessarily the commit; absent for its build. */
  target: json.optional(json.string),
  /** Node's test-driver OS/architecture; does not establish a remote rendering device's OS. */
  platform: json.string,
  gpuProfile: json.optional(json.string),
  gpuReport: json.optional(json.string),
  browserVersion: json.optional(json.string),
  projects: json.record(countsShape),
});
const evidenceShape = json.object({ runs: json.array(runShape) });

export type Counts = json.ShapeOf<typeof countsShape>;
export type BrowserRun = json.ShapeOf<typeof runShape>;

/** The runs in the file's text; none for a missing or empty file. */
export function readRuns(text: string | undefined): BrowserRun[] {
  if (text === undefined || text.trim() === "") return [];
  return json.parseJson(text, evidenceShape, EVIDENCE_FILE).runs;
}

/** The file's text with this run added, keeping the newest runs. */
export function withRun(runs: readonly BrowserRun[], run: BrowserRun): string {
  return `${JSON.stringify({ runs: [...runs, run].slice(-KEPT_RUNS) }, null, 2)}\n`;
}

/** The outcome of one test, as Playwright reports it, added to a project's counts. */
export function count(
  counts: Readonly<Record<string, Counts>>,
  project: string,
  outcome: "expected" | "unexpected" | "flaky" | "skipped",
): Record<string, Counts> {
  const current = counts[project] ?? { passed: 0, failed: 0, skipped: 0, flaky: 0 };
  const key = (
    { expected: "passed", unexpected: "failed", flaky: "flaky", skipped: "skipped" } as const
  )[outcome];
  return { ...counts, [project]: { ...current, [key]: current[key] + 1 } };
}

export type EvidenceVerdict =
  | { kind: "found"; run: BrowserRun }
  | { kind: "none" }
  | { kind: "other-commit"; run: BrowserRun }
  | { kind: "dirty"; run: BrowserRun };

/**
 * What the record says about the head commit: the newest run on it with a clean tree, or why
 * there is none. A run on the head with uncommitted changes tested something else.
 */
export function evidenceFor(runs: readonly BrowserRun[], head: string): EvidenceVerdict {
  const onHead = runs.filter((run) => run.commit === head);
  const clean = onHead.filter((run) => !run.dirty).at(-1);
  if (clean !== undefined) return { kind: "found", run: clean };
  const dirty = onHead.at(-1);
  if (dirty !== undefined) return { kind: "dirty", run: dirty };
  const latest = runs.at(-1);
  return latest === undefined ? { kind: "none" } : { kind: "other-commit", run: latest };
}

/** The marker that identifies the evidence comment for one commit. */
export function evidenceMarker(commit: string): string {
  return `<!-- browser-evidence ${commit} -->`;
}

// Publication uses browser names and repository-relative evidence paths. Full
// executable/profile locations remain in the ignored local record.
function publicProfile(text: string): string {
  try {
    const profile = readProfile(text);
    const name =
      "channel" in profile.browser
        ? profile.browser.channel
        : profile.browser.executablePath.split(/[\\/]/u).at(-1);
    return `${name}, ${profile.backend}, ${profile.apis.join(", ")}, ${profile.display === undefined ? "headless" : "private display"}`;
  } catch {
    return "unavailable (invalid recorded profile)";
  }
}

function publicReport(path: string | undefined): string {
  const relative = path?.replaceAll("\\", "/").match(/(?:^|\/)\.local\/(.+)$/u)?.[1];
  return relative === undefined ? "unavailable" : `.local/${relative}`;
}

/** The pull-request comment for a run. */
export function evidenceMarkdown(run: BrowserRun): string {
  const renderer =
    run.renderer === null
      ? `not checked (BROWSER_GPU=${run.gpu}${run.remote ? ", remote browser" : ""})`
      : `${run.renderer} (${run.rendererKind ?? "unknown"}${run.display === null ? "" : `, ${run.display}`})`;
  const application =
    run.target === undefined
      ? "the commit's production build, served locally"
      : `${run.target}, a deployment that need not be this commit`;
  const rows = Object.entries(run.projects).map(
    ([project, c]) => `| ${project} | ${c.passed} | ${c.failed} | ${c.skipped} | ${c.flaky} |`,
  );
  return [
    evidenceMarker(run.commit),
    `**Browser tests** on \`${run.commit.slice(0, 7)}\`, finished ${run.finishedAt}: ${run.status}.`,
    "",
    `Driver platform: ${run.platform}.`,
    ...(run.remote ? ["Rendering OS/device: not established by this remote run record."] : []),
    "",
    `Application: ${application}.`,
    "",
    // The GPU check probes Chromium; other browsers' renderers are not known.
    `Renderer (Chromium's GPU check): ${renderer}.`,
    ...(run.gpuProfile === undefined
      ? []
      : [
          "",
          `Chromium launch profile: \`${publicProfile(run.gpuProfile)}\`. Browser version: ${run.browserVersion ?? "unknown"}.`,
          `Discovery report: \`${publicReport(run.gpuReport)}\` (local evidence; other engines and physical mobile devices are unverified).`,
        ]),
    ...(run.webgpuAdapter === undefined ? [] : ["", `WebGPU adapter: ${run.webgpuAdapter}.`]),
    "",
    "| Project | Passed | Failed | Skipped | Flaky |",
    "| --- | --- | --- | --- | --- |",
    ...rows,
    "",
    "Recorded by the local run in `.local/browser-evidence.json` and posted by `pnpm task ready`.",
  ].join("\n");
}
