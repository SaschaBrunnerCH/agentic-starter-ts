import { EventEmitter } from "node:events";
import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, it, vi } from "vitest";
import { writeProfile, type GpuProfile } from "./browser-gpu-profile.ts";

const fixture = vi.hoisted(() => ({
  args: [] as string[],
  childArgs: [] as string[],
  childEnv: {} as NodeJS.ProcessEnv,
  close: vi.fn(async () => {}),
}));
vi.mock("./script-arguments.ts", () => ({ scriptArguments: () => fixture.args }));
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
vi.mock("node:child_process", async (original) => ({
  ...(await original<typeof import("node:child_process")>()),
  fork: (_module: URL, args: string[], options: { env: NodeJS.ProcessEnv }) => {
    fixture.childArgs = args;
    fixture.childEnv = options.env;
    const child = new EventEmitter();
    setImmediate(() => child.emit("exit", 0));
    return child;
  },
}));

const originalExitCode = process.exitCode;
afterEach(() => {
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
