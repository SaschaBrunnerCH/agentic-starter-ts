import { EventEmitter } from "node:events";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readRuns, withRun } from "./browser-evidence.ts";
import { spawnSync } from "node:child_process";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { writeProfile, type GpuProfile } from "./browser-gpu-profile.ts";

const fixture = vi.hoisted(() => ({
  args: [] as string[],
  childArgs: [] as string[],
  childEnv: {} as NodeJS.ProcessEnv,
  close: vi.fn(async () => {}),
  commands: [] as string[],
  buildStatus: 0,
  gitFailure: false,
  sourceChanged: false,
  directory: "",
  record: "",
  onFork: undefined as ((env: NodeJS.ProcessEnv) => void) | undefined,
}));
vi.mock("node:fs", async (original) => {
  const actual = await original<typeof import("node:fs")>();
  return {
    ...actual,
    openSync: (path: string, flags: string) =>
      actual.openSync(
        path.endsWith("/.local/browser-evidence.json") ? fixture.record : path,
        flags,
      ),
  };
});
vi.mock("../shared/script-arguments.ts", () => ({ scriptArguments: () => fixture.args }));
vi.mock("./browser-gpu-discovery.ts", () => ({
  discoverGpu: async (env: NodeJS.ProcessEnv) => ({
    profile: {
      browser: { channel: "chrome" },
      backend: "gl",
      apis: ["webgpu"],
      webgpuFeatureLevel: env.BROWSER_WEBGPU_FEATURE_LEVEL ?? "core",
    },
    results: [{ api: "webgpu", identity: "Intel Graphics" }],
    version: "test-browser",
    report: "test-report",
    wsEndpoint: "ws://owned",
    close: fixture.close,
  }),
}));
vi.mock("node:child_process", async (original) => {
  const actual = await original<typeof import("node:child_process")>();
  return {
    ...actual,
    spawnSync: (command: string, args: string[]) => {
      fixture.commands.push([command, ...args].join(" "));
      if (command === "git") {
        return {
          status: fixture.gitFailure ? 1 : 0,
          stdout:
            args[0] === "rev-parse"
              ? "a".repeat(40)
              : args[0] === "status" && fixture.sourceChanged
                ? " M app.ts"
                : "",
          stderr: "identity unavailable",
        };
      }
      if (args.some((arg) => arg.endsWith("vite.js")))
        return { status: fixture.buildStatus, stdout: "", stderr: "" };
      return actual.spawnSync(command, args, { encoding: "utf8" });
    },
    fork: (_module: URL, args: string[], options: { env: NodeJS.ProcessEnv }) => {
      fixture.childArgs = args;
      fixture.childEnv = options.env;
      fixture.commands.push("browser tests");
      fixture.onFork?.(options.env);
      const child = new EventEmitter();
      setImmediate(() => child.emit("exit", 0));
      return child;
    },
  };
});

const originalExitCode = process.exitCode;
beforeEach(() => {
  fixture.directory = mkdtempSync(join(tmpdir(), "browser-command-"));
  fixture.record = join(fixture.directory, "evidence.json");
  fixture.sourceChanged = false;
  fixture.onFork = undefined;
  fixture.commands = [];
  fixture.childArgs = [];
  fixture.buildStatus = 0;
  fixture.gitFailure = false;
  fixture.args = [];
  vi.stubEnv("CI", "");
  vi.stubEnv("BROWSER_TEST_BASE_URL", undefined);
});
afterEach(() => {
  rmSync(fixture.directory, { recursive: true, force: true });
  process.exitCode = originalExitCode;
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("browser command feature-level propagation", () => {
  it.each(["separate", "equals"])(
    "preserves %s compatibility selection in the worker profile",
    async (form) => {
      vi.resetModules();
      vi.stubEnv("BROWSER_GPU", "required");
      vi.stubEnv("BROWSER_WEBGPU_FEATURE_LEVEL", "core");
      fixture.args = [
        "--api",
        "webgpu",
        ...(form === "separate"
          ? ["--webgpu-feature-level", "compatibility"]
          : ["--webgpu-feature-level=compatibility"]),
      ];
      await import("./browser-test.ts");
      const expected: GpuProfile = {
        browser: { channel: "chrome" },
        backend: "gl",
        apis: ["webgpu"],
        webgpuFeatureLevel: "compatibility",
      };
      expect(fixture.childEnv.BROWSER_GPU_PROFILE).toBe(writeProfile(expected));
      expect(fixture.childEnv.BROWSER_WEBGPU_FEATURE_LEVEL).toBe("compatibility");
      expect(fixture.childEnv.BROWSER_GPU_WS_ENDPOINT).toBe("ws://owned");
      expect(fixture.childArgs).toEqual(["test", "--project", "chromium"]);
      expect(fixture.close).toHaveBeenCalledOnce();
      expect(process.exitCode).toBe(0);
    },
  );

  it.each(["browser-doctor.ts", "browser-test.ts"])(
    "rejects an unknown level in %s before discovery",
    (file) => {
      const result = spawnSync(
        process.execPath,
        [
          `${import.meta.dirname}/${file}`,
          "--api",
          "webgpu",
          "--webgpu-feature-level",
          "automatic",
        ],
        { encoding: "utf8" },
      );
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("must be core or compatibility");
      expect(result.stdout).not.toContain("GPU attempt");
    },
  );
});

describe("browser build identity", () => {
  it("replaces stale output before testing the current checkout", async () => {
    vi.resetModules();
    vi.stubEnv("BROWSER_GPU", "off");
    await import("./browser-test.ts");
    const build = fixture.commands.findIndex((command) => command.includes("vite.js build"));
    expect(build).toBeGreaterThanOrEqual(0);
    expect(fixture.commands.indexOf("browser tests")).toBeGreaterThan(build);
    expect(fixture.childEnv.BROWSER_TEST_BUILD_COMMIT).toBe("a".repeat(40));
  });

  it("invalidates the completed run in place after source changes, retaining its counts", async () => {
    vi.resetModules();
    vi.stubEnv("BROWSER_GPU", "off");
    fixture.onFork = (env) => {
      writeFileSync(
        fixture.record,
        withRun([], {
          id: env.BROWSER_TEST_RUN_ID,
          commit: "a".repeat(40),
          dirty: false,
          sourceStable: true,
          buildCommit: "a".repeat(40),
          finishedAt: "2026-10-27T00:00:00Z",
          status: "passed",
          gpu: "off",
          renderer: null,
          rendererKind: null,
          display: null,
          remote: false,
          platform: "test",
          projects: { chromium: { passed: 3, failed: 0, skipped: 0, flaky: 0 } },
        }),
      );
      fixture.sourceChanged = true;
    };
    await import("./browser-test.ts");
    expect(process.exitCode).toBe(1);
    const runs = readRuns(readFileSync(fixture.record, "utf8"));
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({
      status: "failed",
      dirty: true,
      sourceStable: false,
      projects: { chromium: { passed: 3, failed: 0 } },
    });
  });

  it("starts no browser after a failed build", async () => {
    vi.resetModules();
    fixture.buildStatus = 1;
    vi.stubEnv("BROWSER_GPU", "off");
    await import("./browser-test.ts");
    expect(process.exitCode).toBe(1);
    expect(fixture.commands).not.toContain("browser tests");
  });

  it("starts no build or browser when Git identity is unavailable", async () => {
    vi.resetModules();
    fixture.gitFailure = true;
    vi.stubEnv("BROWSER_GPU", "off");
    await import("./browser-test.ts");
    expect(process.exitCode).toBe(1);
    expect(fixture.commands.some((command) => command.includes("vite.js"))).toBe(false);
    expect(fixture.commands).not.toContain("browser tests");
  });

  it.each(["--help", "--list"])("%s starts no build or source check", async (arg) => {
    vi.resetModules();
    fixture.args = [arg];
    vi.stubEnv("BROWSER_GPU", "off");
    await import("./browser-test.ts");
    expect(fixture.commands).toEqual(["browser tests"]);
  });

  it.each(["deployment", "release"])("does not rebuild a %s producer's output", async (mode) => {
    vi.resetModules();
    vi.stubEnv("BROWSER_GPU", "off");
    if (mode === "deployment") vi.stubEnv("BROWSER_TEST_BASE_URL", "https://example.test/app/");
    else vi.stubEnv("CI", "true");
    await import("./browser-test.ts");
    expect(fixture.commands.some((command) => command.includes("vite.js"))).toBe(false);
    expect(fixture.commands).toContain("browser tests");
    expect(fixture.childEnv.BROWSER_TEST_BUILD_COMMIT).toBeUndefined();
  });
});
