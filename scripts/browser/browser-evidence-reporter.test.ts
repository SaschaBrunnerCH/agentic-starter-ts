import { afterEach, beforeEach, expect, it, vi } from "vitest";
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
