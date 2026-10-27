import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { FullResult, Reporter, TestCase } from "@playwright/test/reporter";
import { count, EVIDENCE_FILE, readRuns, withRun, type Counts } from "./browser-evidence.ts";
import { guardBrowserSource } from "./browser-source.ts";

const root = resolve(import.meta.dirname, "../..");

/**
 * Records each local browser run in .local/browser-evidence.json: the commit, the renderer
 * the GPU check found (browser-test.ts leaves it in the environment) and the counts per
 * project. `pnpm task ready` puts the run for the head commit into the pull request.
 */
export default class BrowserEvidenceReporter implements Reporter {
  private readonly source =
    process.env.CI === "true" || process.env.CI === "1" || process.argv.includes("--list")
      ? undefined
      : guardBrowserSource(root);
  private counts: Record<string, Counts> = {};

  onTestEnd(test: TestCase): void {
    const project = test.parent.project()?.name ?? "default";
    this.counts = count(this.counts, project, test.outcome());
  }

  async onEnd(result: FullResult): Promise<void | { status: FullResult["status"] }> {
    // CI keeps its own results; discovery executes no tests and creates no acceptance record.
    if (this.source === undefined) return;
    let stable = true;
    try {
      this.source.assertStable();
    } catch {
      stable = false;
    } finally {
      this.source.close();
    }
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
        ...(environment.BROWSER_TEST_RUN_ID === undefined
          ? {}
          : { id: environment.BROWSER_TEST_RUN_ID }),
        commit: this.source.commit,
        dirty: this.source.dirty || !stable,
        sourceStable: stable,
        ...(environment.BROWSER_TEST_BUILD_COMMIT === undefined
          ? {}
          : { buildCommit: environment.BROWSER_TEST_BUILD_COMMIT }),
        finishedAt: new Date().toISOString(),
        status: stable ? result.status : "failed",
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
    if (!stable) return { status: "failed" };
  }
}
