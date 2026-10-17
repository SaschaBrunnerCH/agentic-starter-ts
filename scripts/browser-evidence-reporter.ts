import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { FullResult, Reporter, TestCase } from "@playwright/test/reporter";
import { count, EVIDENCE_FILE, readRuns, withRun, type Counts } from "./browser-evidence.ts";

const root = resolve(import.meta.dirname, "..");

function git(args: readonly string[]): string {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8" });
  return result.status === 0 ? result.stdout.trim() : "";
}

/**
 * Records each local browser run in .local/browser-evidence.json: the commit, the renderer
 * the GPU check found (browser-gpu-setup.ts leaves it in the environment) and the counts per
 * project. `pnpm task ready` puts the run for the head commit into the pull request.
 */
export default class BrowserEvidenceReporter implements Reporter {
  // Read when the run starts: a file changed during the run does not make it clean.
  private readonly commit = git(["rev-parse", "HEAD"]);
  private readonly dirty = git(["status", "--porcelain"]) !== "";
  private counts: Record<string, Counts> = {};

  onTestEnd(test: TestCase): void {
    const project = test.parent.project()?.name ?? "default";
    this.counts = count(this.counts, project, test.outcome());
  }

  onEnd(result: FullResult): void {
    // CI keeps its own results; the record is for runs on a developer's machine.
    if (this.commit === "" || process.env.CI === "true") return;
    const file = resolve(root, EVIDENCE_FILE);
    let previous: string | undefined;
    try {
      previous = readFileSync(file, "utf8");
    } catch {
      previous = undefined;
    }
    const environment = process.env;
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(
      file,
      withRun(readRuns(previous), {
        commit: this.commit,
        dirty: this.dirty,
        finishedAt: new Date().toISOString(),
        status: result.status,
        gpu: environment.BROWSER_GPU_SETTING ?? "off",
        renderer: environment.BROWSER_GPU_RENDERER ?? null,
        rendererKind: environment.BROWSER_GPU_KIND ?? null,
        display: environment.BROWSER_GPU_REACHED ?? null,
        ...(environment.BROWSER_WEBGPU_ADAPTER === undefined
          ? {}
          : { webgpuAdapter: environment.BROWSER_WEBGPU_ADAPTER }),
        remote: environment.REMOTE_BROWSER_WS_ENDPOINT !== undefined,
        ...(environment.BROWSER_TEST_BASE_URL === undefined
          ? {}
          : { target: environment.BROWSER_TEST_BASE_URL }),
        ...(environment.BROWSER_GPU_PROFILE === undefined
          ? {}
          : { gpuProfile: environment.BROWSER_GPU_PROFILE }),
        ...(environment.BROWSER_GPU_REPORT === undefined
          ? {}
          : { gpuReport: environment.BROWSER_GPU_REPORT }),
        ...(environment.BROWSER_GPU_VERSION === undefined
          ? {}
          : { browserVersion: environment.BROWSER_GPU_VERSION }),
        platform: `${process.platform} ${process.arch}`,
        projects: this.counts,
      }),
    );
  }
}
