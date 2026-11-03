import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { resolve } from "node:path";
import BrowserEvidenceReporter from "./browser-evidence-reporter.ts";
import { readRuns } from "./browser-evidence.ts";

const fixture = vi.hoisted(() => ({
  dirty: false,
  stable: true,
  previous: undefined as string | undefined,
  written: "",
  writtenPath: "",
  close: vi.fn(),
}));
vi.mock("../shared/local-artifact-paths.ts", () => ({
  localArtifactPaths: () => ({
    directory: "/fixture/.local/gh-00059-issue-fixture",
    primaryLocal: "/fixture/.local",
  }),
}));
vi.mock("./browser-source.ts", () => ({
  guardBrowserSource: () => ({
    commit: "a".repeat(40),
    dirty: fixture.dirty,
    assertStable: () => {
      if (!fixture.stable) throw new Error("changed");
    },
    close: fixture.close,
  }),
}));
vi.mock("node:fs", () => ({
  mkdirSync: () => {},
  existsSync: () => fixture.previous !== undefined,
  readFileSync: () => {
    if (fixture.previous === undefined) throw new Error("missing");
    return fixture.previous;
  },
  writeFileSync: (path: string, text: string) => {
    fixture.writtenPath = path;
    fixture.written = text;
  },
}));
beforeEach(() => {
  Object.assign(fixture, { dirty: false, stable: true, previous: undefined, written: "" });
  vi.stubEnv("CI", "");
  for (const name of [
    "BROWSER_TEST_RUN_ID",
    "BROWSER_TEST_BUILD_COMMIT",
    "BROWSER_TEST_FULL_SUITE",
    "BROWSER_GPU_SETTING",
    "BROWSER_GPU_RENDERER",
    "BROWSER_GPU_KIND",
    "BROWSER_GPU_REACHED",
    "BROWSER_WEBGPU_ADAPTER",
    "BROWSER_GPU_PROFILE",
    "BROWSER_GPU_REPORT",
    "BROWSER_GPU_VERSION",
    "REMOTE_BROWSER_WS_ENDPOINT",
    "BROWSER_TEST_BASE_URL",
  ])
    vi.stubEnv(name, undefined);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});
const result = { status: "passed", startTime: new Date(), duration: 1 } as const;
type CompletionConfig = Parameters<BrowserEvidenceReporter["onBegin"]>[0];
const project = { name: "chromium", repeatEach: 1, retries: 0, grep: /.*/, grepInvert: null };
const config = (changes: Partial<CompletionConfig> = {}): CompletionConfig => ({
  configFile: resolve(import.meta.dirname, "../../playwright.config.ts"),
  forbidOnly: true,
  grep: /.*/,
  grepInvert: null,
  shard: null,
  filteredProjects: [project],
  ...changes,
});
const testCase: Parameters<BrowserEvidenceReporter["onTestEnd"]>[0] = {
  parent: { project: () => ({ name: "chromium" }) },
  expectedStatus: "passed",
  outcome: () => "expected",
};

it("records completeness only when the full inventory passes once", async () => {
  vi.stubEnv("BROWSER_TEST_FULL_SUITE", "true");
  const reporter = new BrowserEvidenceReporter();
  reporter.onBegin(config(), { allTests: () => [{}, {}] });
  reporter.onTestEnd(testCase, { status: "passed" });
  reporter.onTestEnd(testCase, { status: "passed" });
  await reporter.onEnd(result);
  expect(readRuns(fixture.written)[0]).toMatchObject({
    complete: true,
    projects: { chromium: { passed: 2, failed: 0 } },
  });
});

it.each<[string, Partial<CompletionConfig>]>([
  ["custom config", { configFile: "/custom.ts" }],
  ["only not forbidden", { forbidOnly: false }],
  ["shard", { shard: { total: 2, current: 1 } }],
  ["grep", { grep: /smoke/ }],
  ["grep array", { grep: [/.*/] }],
  ["grep flags", { grep: /.*/i }],
  ["grep invert", { grepInvert: /manual/ }],
  ["no projects", { filteredProjects: [] }],
  ["multiple projects", { filteredProjects: [project, project] }],
  ["other project", { filteredProjects: [{ ...project, name: "firefox" }] }],
  ["repeats", { filteredProjects: [{ ...project, repeatEach: 2 }] }],
  ["retries", { filteredProjects: [{ ...project, retries: 1 }] }],
  ["project grep", { filteredProjects: [{ ...project, grep: /smoke/ }] }],
  ["project grep invert", { filteredProjects: [{ ...project, grepInvert: /manual/ }] }],
])("does not mark %s selection complete", async (_name, changes) => {
  vi.stubEnv("BROWSER_TEST_FULL_SUITE", "true");
  const reporter = new BrowserEvidenceReporter();
  reporter.onBegin(config(changes), { allTests: () => [{}] });
  reporter.onTestEnd(testCase, { status: "passed" });
  await reporter.onEnd(result);
  expect(readRuns(fixture.written)[0]?.complete).toBe(false);
});

it.each([0, 2])("rejects empty or unfinished inventories of %s tests", async (expected) => {
  vi.stubEnv("BROWSER_TEST_FULL_SUITE", "true");
  const reporter = new BrowserEvidenceReporter();
  reporter.onBegin(config(), { allTests: () => Array.from({ length: expected }) });
  if (expected > 0) reporter.onTestEnd(testCase, { status: "passed" });
  await reporter.onEnd(result);
  expect(readRuns(fixture.written)[0]?.complete).toBe(false);
});

it.each(["skipped", "flaky", "unexpected", "expected"] as const)(
  "does not accept %s failures/skips as passing acceptance",
  async (outcome) => {
    vi.stubEnv("BROWSER_TEST_FULL_SUITE", "true");
    const reporter = new BrowserEvidenceReporter();
    reporter.onBegin(config(), { allTests: () => [{}] });
    reporter.onTestEnd(
      { ...testCase, expectedStatus: "failed", outcome: () => outcome },
      { status: "failed" },
    );
    await reporter.onEnd(result);
    expect(readRuns(fixture.written)[0]?.complete).toBe(false);
  },
);

it("cannot claim completeness without the supported runner's selection marker", async () => {
  const reporter = new BrowserEvidenceReporter();
  reporter.onBegin(config(), { allTests: () => [{}] });
  reporter.onTestEnd(testCase, { status: "passed" });
  await reporter.onEnd(result);
  expect(readRuns(fixture.written)[0]?.complete).toBe(false);
});

it("records a fresh guarded source and optional renderer fields", async () => {
  for (const [name, value] of Object.entries({
    BROWSER_TEST_RUN_ID: "run",
    BROWSER_TEST_BUILD_COMMIT: "a".repeat(40),
    BROWSER_GPU_SETTING: "required",
    BROWSER_GPU_RENDERER: "Intel",
    BROWSER_GPU_KIND: "hardware",
    BROWSER_GPU_REACHED: "headless",
    BROWSER_WEBGPU_ADAPTER: "Intel",
    BROWSER_GPU_PROFILE: "profile",
    BROWSER_GPU_REPORT: "report",
    BROWSER_GPU_VERSION: "123",
    REMOTE_BROWSER_WS_ENDPOINT: "ws://example.test",
    BROWSER_TEST_BASE_URL: "https://example.test/app/",
  }))
    vi.stubEnv(name, value);
  fixture.previous = '{"runs":[]}';
  expect(await new BrowserEvidenceReporter().onEnd(result)).toBeUndefined();
  expect(readRuns(fixture.written)[0]).toMatchObject({
    id: "run",
    buildCommit: "a".repeat(40),
    sourceStable: true,
    dirty: false,
    renderer: "Intel",
    webgpuAdapter: "Intel",
    browserVersion: "123",
    remote: true,
    target: "https://example.test/app/",
    status: "passed",
  });
  expect(fixture.writtenPath).toBe("/fixture/.local/gh-00059-issue-fixture/browser-evidence.json");
  expect(fixture.close).toHaveBeenCalledOnce();
});
it("overrides passing counts when source validation fails", async () => {
  fixture.stable = false;
  expect(await new BrowserEvidenceReporter().onEnd(result)).toEqual({ status: "failed" });
  expect(readRuns(fixture.written)[0]).toMatchObject({
    dirty: true,
    sourceStable: false,
    status: "failed",
  });
  expect(fixture.close).toHaveBeenCalledOnce();
});
it("keeps dirty diagnostic runs distinct from clean acceptance", async () => {
  fixture.dirty = true;
  await new BrowserEvidenceReporter().onEnd({ ...result, status: "failed" });
  expect(readRuns(fixture.written)[0]).toMatchObject({
    dirty: true,
    sourceStable: true,
    status: "failed",
    remote: false,
  });
});
it.each(["true", "1"])("leaves CI=%s evidence to its producer", async (ci) => {
  vi.stubEnv("CI", ci);
  expect(await new BrowserEvidenceReporter().onEnd(result)).toBeUndefined();
  expect(fixture.written).toBe("");
  expect(fixture.close).not.toHaveBeenCalled();
});
