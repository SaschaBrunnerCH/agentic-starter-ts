import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as json from "./json-shape.ts";
import type { LaunchOptions } from "@playwright/test";
import type { SpawnOptions } from "node:child_process";

const originalPlatform = process.platform;

const fixture = vi.hoisted(() => {
  const launches: LaunchOptions[] = [];
  return {
    directory: "",
    identity: "Intel UHD Graphics",
    work: true,
    fallback: false,
    cleanupFails: false,
    closeHangs: false,
    killFails: false,
    killHangs: false,
    killLeavesAlive: false,
    profile: "",
    probeFails: false,
    firstBrowserFails: false,
    onlyCompatibility: false,
    requestedLevels: [] as string[],
    launches,
    closes: 0,
    kills: 0,
    killDelayMs: 0,
    taskkillArguments: [] as string[],
    browserExited: () => {},
    probeAbort: () => {},
    abort: () => {},
  };
});
vi.mock("node:os", async (original) => ({
  ...(await original<typeof import("node:os")>()),
  homedir: () => fixture.directory,
}));
vi.mock("node:child_process", async (original) => {
  const actual = await original<typeof import("node:child_process")>();
  return {
    ...actual,
    spawn: vi.fn((_command: string, args: string[], options: SpawnOptions) => {
      fixture.taskkillArguments = args;
      fixture.kills += 1;
      const child = new actual.ChildProcess();
      const aborted = () => child.emit("error", new Error("Termination command aborted"));
      options.signal?.addEventListener("abort", aborted, { once: true });
      child.once("close", () => options.signal?.removeEventListener("abort", aborted));
      if (!fixture.killHangs)
        setTimeout(() => {
          if (!fixture.killFails && !fixture.killLeavesAlive) fixture.browserExited();
          const code = fixture.killFails ? 1 : 0;
          Object.defineProperty(child, "exitCode", { value: code });
          child.emit("close", code, null);
        }, fixture.killDelayMs);
      return child;
    }),
  };
});
vi.mock("@playwright/test", () => ({
  chromium: {
    launchServer: async (options: LaunchOptions) => {
      fixture.launches.push(options);
      fixture.abort();
      if (
        fixture.firstBrowserFails &&
        /google-chrome$|chrome\.exe$/u.test(options.executablePath ?? "")
      )
        throw new Error("First browser cannot launch");
      let exitCode: number | null = fixture.closeHangs || fixture.cleanupFails ? null : 0;
      fixture.browserExited = () => {
        exitCode = 0;
      };
      return {
        process: () => ({
          pid: 123,
          spawnargs: fixture.profile ? [`--user-data-dir=${fixture.profile}`] : [],
          get exitCode() {
            return exitCode;
          },
          signalCode: null,
        }),
        wsEndpoint: () => "ws://owned-server",
        close: async () => {
          fixture.closes += 1;
          if (fixture.closeHangs) await new Promise<void>(() => {});
          if (fixture.cleanupFails) throw new Error("Owned browser did not close");
        },
        kill: async () => {
          fixture.kills += 1;
          if (fixture.killDelayMs) vi.advanceTimersByTime(fixture.killDelayMs);
          if (fixture.killHangs) await new Promise<void>(() => {});
          if (fixture.killFails) throw new Error("Owned browser did not terminate");
          if (!fixture.killLeavesAlive) exitCode = 0;
        },
      };
    },
    connect: async () => ({
      version: () => "test-version",
      newPage: async () => ({
        close: async () => {},
        setDefaultTimeout: () => {},
        goto: async () => {},
        evaluate: async (script: string) => {
          if (!script.includes("const results")) return "GPU diagnostic text";
          fixture.probeAbort();
          if (fixture.probeFails) throw new Error("Graphics context lost during probe");
          const { apis, webgpuFeatureLevel } = json.parseJson(
            script.slice(script.lastIndexOf(")(") + 2, -1),
            json.object({ apis: json.array(json.string), webgpuFeatureLevel: json.string }),
            "Probe APIs",
          );
          fixture.requestedLevels.push(webgpuFeatureLevel);
          return apis.map((api) => ({
            api,
            identity:
              fixture.onlyCompatibility && api === "webgpu" && webgpuFeatureLevel === "core"
                ? null
                : fixture.identity,
            fallback: fixture.fallback,
            work:
              fixture.onlyCompatibility && api === "webgpu" && webgpuFeatureLevel === "core"
                ? false
                : fixture.work,
            reason:
              fixture.onlyCompatibility && api === "webgpu" && webgpuFeatureLevel === "core"
                ? "no adapter"
                : null,
          }));
        },
      }),
      close: async () => {},
    }),
  },
}));

let lock: string;
let home: string;
let cwd: string;
let commands: typeof import("./browser-gpu-discovery.ts");
beforeEach(async () => {
  vi.resetModules();
  fixture.directory = mkdtempSync(join(tmpdir(), "starter-gpu-discovery-"));
  home = fixture.directory;
  cwd = process.cwd();
  process.chdir(home);
  Object.assign(fixture, {
    identity: "Intel UHD Graphics",
    work: true,
    fallback: false,
    cleanupFails: false,
    closeHangs: false,
    killFails: false,
    killHangs: false,
    killLeavesAlive: false,
    profile: "",
    probeFails: false,
    firstBrowserFails: false,
    onlyCompatibility: false,
    closes: 0,
    kills: 0,
    killDelayMs: 0,
    browserExited: () => {},
    probeAbort: () => {},
    abort: () => {},
  });
  fixture.launches.length = 0;
  fixture.requestedLevels.length = 0;
  fixture.taskkillArguments = [];
  lock = join(home, ".cache", "browser-gpu-tests", "lock");
  vi.spyOn(console, "log").mockImplementation(() => {});
  commands = await import("./browser-gpu-discovery.ts");
});
afterEach(() => {
  Object.defineProperty(process, "platform", { value: originalPlatform });
  vi.useRealTimers();
  process.chdir(cwd);
  rmSync(home, { recursive: true, force: true });
  vi.restoreAllMocks();
});

// These tests exercise ownership/search failures with browser processes mocked.
// They are not evidence of hardware access on any platform.
describe("discovery ownership and failure paths", () => {
  it("keeps a core failure failed and offers compatibility as a separate diagnostic", async () => {
    fixture.onlyCompatibility = true;
    const env = { BROWSER_GPU_EXECUTABLE: "/chosen", BROWSER_GPU_APIS: "webgpu" };
    await expect(commands.discoverGpu(env, new AbortController().signal)).rejects.toThrow(
      "pnpm browser:doctor --api webgpu --webgpu-feature-level compatibility",
    );
    expect(fixture.requestedLevels.length).toBeGreaterThan(0);
    expect(fixture.requestedLevels.every((level) => level === "core")).toBe(true);
    expect(
      fixture.launches.every((launch) => !launch.args?.includes("--use-webgpu-adapter=opengles")),
    ).toBe(true);
    expect(existsSync(lock)).toBe(false);
    const compatible = await commands.discoverGpu(
      { ...env, BROWSER_WEBGPU_FEATURE_LEVEL: "compatibility" },
      new AbortController().signal,
    );
    expect(compatible.profile.webgpuFeatureLevel).toBe("compatibility");
    expect(fixture.requestedLevels.at(-1)).toBe("compatibility");
    await compatible.close();
    expect(readFileSync(compatible.report, "utf8")).toContain(
      '"webgpuFeatureLevel": "compatibility"',
    );
  });
  it("revalidates a saved profile instead of trusting an earlier hardware pass", async () => {
    const first = await commands.discoverGpu(
      { BROWSER_GPU_EXECUTABLE: "/chosen" },
      new AbortController().signal,
    );
    const profile = first.profile;
    await first.close();
    fixture.identity = "SwiftShader";
    await expect(commands.discoverGpu({}, new AbortController().signal, profile)).rejects.toThrow(
      "No verified hardware profile",
    );
    expect(fixture.launches).toHaveLength(2);
    expect(existsSync(lock)).toBe(false);
  });
  it("checks WebGPU independently without adding WebGL", async () => {
    const gpu = await commands.discoverGpu(
      { BROWSER_GPU_EXECUTABLE: "/chosen", BROWSER_GPU_APIS: "webgpu" },
      new AbortController().signal,
    );
    expect(gpu.results.map((result) => result.api)).toEqual(["webgpu"]);
    expect(fixture.launches[0]?.args).toContain("--enable-unsafe-webgpu");
    await gpu.close();
  });
  it("releases an unused lock and preserves the directory-creation error", async () => {
    writeFileSync(join(home, ".local"), "blocks directory creation");
    await expect(
      commands.discoverGpu({ BROWSER_GPU_EXECUTABLE: "/chosen" }, new AbortController().signal),
    ).rejects.toThrow(/mkdir/u);
    expect(existsSync(lock)).toBe(false);
    expect(fixture.launches).toHaveLength(0);
  });
  it("keeps the lock through acceptance and refuses an overlapping run", async () => {
    const gpu = await commands.discoverGpu(
      { BROWSER_GPU_EXECUTABLE: "/chosen" },
      new AbortController().signal,
    );
    expect(existsSync(lock)).toBe(true);
    await expect(
      commands.discoverGpu({ BROWSER_GPU_EXECUTABLE: "/chosen" }, new AbortController().signal),
    ).rejects.toThrow("GPU lock");
    expect(fixture.launches).toHaveLength(1);
    expect(fixture.closes).toBe(0);
    expect(readFileSync(gpu.report, "utf8")).toContain("test-version");
    expect(readFileSync(gpu.report, "utf8")).toContain('"reproduce": [');
    expect(readFileSync(gpu.report, "utf8")).toContain('"browser:doctor"');
    await gpu.close();
    await gpu.close();
    expect(existsSync(lock)).toBe(false);
    expect(readFileSync(gpu.report, "utf8")).toContain('"discovery": "passed"');
  });
  it.each(["missing", "unreadable", "replaced"])(
    "fails safely and records cleanup when its lock is %s",
    async (mode) => {
      const gpu = await commands.discoverGpu(
        { BROWSER_GPU_EXECUTABLE: "/chosen" },
        new AbortController().signal,
      );
      const replacement =
        mode === "unreadable"
          ? "incomplete owner"
          : JSON.stringify({
              pid: process.pid,
              directory: home,
              startedAt: "another acquisition",
            });
      if (mode === "missing") rmSync(lock);
      else writeFileSync(lock, replacement);
      await expect(gpu.close()).rejects.toThrow("GPU lock");
      expect(fixture.closes).toBe(1);
      expect(readFileSync(gpu.report, "utf8")).toContain('"status": "lock-release-failed"');
      expect(readFileSync(gpu.report, "utf8")).toContain('"lockReleased": false');
      if (mode !== "missing") expect(readFileSync(lock, "utf8")).toBe(replacement);
    },
  );
  it("preserves the discovery failure when lock cleanup also fails", async () => {
    fixture.identity = "SwiftShader";
    fixture.abort = () => rmSync(lock, { force: true });
    await expect(
      commands.discoverGpu({ BROWSER_GPU_EXECUTABLE: "/chosen" }, new AbortController().signal),
    ).rejects.toThrow(/No verified hardware profile.*GPU lock/su);
  });
  it("preserves an unreadable lock, and diagnoses explicit remote verification", async () => {
    mkdirSync(join(lock, ".."), { recursive: true });
    writeFileSync(lock, "incomplete owner");
    await expect(commands.discoverGpu({}, new AbortController().signal)).rejects.toThrow(
      "unreadable owner",
    );
    expect(readFileSync(lock, "utf8")).toBe("incomplete owner");
    await expect(
      commands.discoverGpu(
        { REMOTE_BROWSER_WS_ENDPOINT: "ws://redacted" },
        new AbortController().signal,
      ),
    ).rejects.toThrow("rendering host");
    expect(fixture.launches).toHaveLength(0);
  });
  it("tries another installed browser and retains earlier launch failures", async () => {
    const bin = join(home, "bin");
    mkdirSync(bin);
    const first = process.platform === "win32" ? "chrome.exe" : "google-chrome";
    const second = process.platform === "win32" ? "chromium.exe" : "chromium";
    writeFileSync(join(bin, first), "");
    writeFileSync(join(bin, second), "");
    fixture.firstBrowserFails = true;
    const gpu = await commands.discoverGpu({ PATH: bin }, new AbortController().signal);
    expect(gpu.profile.browser).toEqual({ executablePath: join(bin, second) });
    expect(fixture.launches.length).toBeGreaterThan(1);
    const report = readFileSync(gpu.report, "utf8");
    expect(report).toContain("First browser cannot launch");
    expect(report).toContain("Intel UHD Graphics");
    await gpu.close();
  });
  it.each(["software", "unknown", "no-work", "fallback"])(
    "rejects %s without retaining a false pass or a lock",
    async (mode) => {
      fixture.identity =
        mode === "software"
          ? "Intel SwiftShader"
          : mode === "unknown"
            ? "Generic WebGL"
            : fixture.identity;
      fixture.work = mode !== "no-work";
      fixture.fallback = mode === "fallback";
      await expect(
        commands.discoverGpu({ BROWSER_GPU_EXECUTABLE: "/chosen" }, new AbortController().signal),
      ).rejects.toThrow("No verified hardware profile");
      expect(existsSync(lock)).toBe(false);
      expect(fixture.closes).toBe(fixture.launches.length);
    },
  );
  it("stops after unproved cleanup and retains the ownership barrier", async () => {
    fixture.cleanupFails = true;
    fixture.killFails = true;
    fixture.identity = "SwiftShader";
    await expect(
      commands.discoverGpu({ BROWSER_GPU_EXECUTABLE: "/chosen" }, new AbortController().signal),
    ).rejects.toThrow("Cleanup unproved");
    expect(fixture.launches).toHaveLength(1);
    expect(existsSync(lock)).toBe(true);
    const [run] = readdirSync(join(home, ".local", "browser-gpu"));
    expect(
      readFileSync(join(home, ".local", "browser-gpu", run ?? "", "report.json"), "utf8"),
    ).toContain('"status": "cleanup-unproved"');
  });
  it("terminates its stalled browser within the existing cleanup budget before releasing ownership", async () => {
    fixture.closeHangs = true;
    const gpu = await commands.discoverGpu(
      { BROWSER_GPU_EXECUTABLE: "/chosen" },
      new AbortController().signal,
    );
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance"] });
    const outcome = gpu.close().then(
      () => "closed",
      (error: unknown) => String(error),
    );
    const gracefulBudget = process.platform === "win32" ? 1_000 : 3_000;
    await vi.advanceTimersByTimeAsync(gracefulBudget - 1);
    expect(fixture.kills).toBe(0);
    expect(existsSync(lock)).toBe(true);
    await vi.advanceTimersByTimeAsync(5_001 - gracefulBudget);
    expect(await outcome).toBe("closed");
    expect(fixture.kills).toBe(1);
    expect(existsSync(lock)).toBe(false);
    expect(readFileSync(join(gpu.report, "..", "1", "cleanup.json"), "utf8")).toContain(
      '"forced": true',
    );
  });
  it("retains ownership when forced termination cannot prove process exit", async () => {
    fixture.closeHangs = true;
    fixture.killLeavesAlive = true;
    const gpu = await commands.discoverGpu(
      { BROWSER_GPU_EXECUTABLE: "/chosen" },
      new AbortController().signal,
    );
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance"] });
    const outcome = gpu.close().then(
      () => "closed",
      (error: unknown) => String(error),
    );
    await vi.advanceTimersByTimeAsync(5_000);
    expect(await outcome).toContain("Owned browser process is still running");
    expect(existsSync(lock)).toBe(true);
    expect(readFileSync(gpu.report, "utf8")).toContain('"status": "cleanup-unproved"');
  });
  it("preserves the original probe error alongside terminal cleanup failure", async () => {
    fixture.probeFails = true;
    fixture.cleanupFails = true;
    fixture.killFails = true;
    await expect(
      commands.discoverGpu({ BROWSER_GPU_EXECUTABLE: "/chosen" }, new AbortController().signal),
    ).rejects.toThrow(/Graphics context lost during probe.*cleanup failed/su);
    expect(fixture.launches).toHaveLength(1);
    expect(existsSync(lock)).toBe(true);
  });
  it("keeps the five-second bound and lock when forced termination also stalls", async () => {
    fixture.closeHangs = true;
    fixture.killHangs = true;
    const gpu = await commands.discoverGpu(
      { BROWSER_GPU_EXECUTABLE: "/chosen" },
      new AbortController().signal,
    );
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance"] });
    const outcome = gpu.close().then(
      () => "closed",
      (error: unknown) => String(error),
    );
    await vi.advanceTimersByTimeAsync(5_000);
    expect(await outcome).toContain("Browser cleanup timed out");
    expect(fixture.kills).toBe(1);
    expect(existsSync(lock)).toBe(true);
    expect(readFileSync(gpu.report, "utf8")).toContain('"status": "cleanup-unproved"');
  });
  it("retains ownership until the disposable profile is gone even after process exit", async () => {
    fixture.profile = join(home, "owned-browser-profile");
    mkdirSync(fixture.profile);
    const gpu = await commands.discoverGpu(
      { BROWSER_GPU_EXECUTABLE: "/chosen" },
      new AbortController().signal,
    );
    await expect(gpu.close()).rejects.toThrow("Owned browser profile still exists");
    expect(existsSync(fixture.profile)).toBe(true);
    expect(existsSync(lock)).toBe(true);
  });
  it("keeps Windows tree termination asynchronous within the five-second budget", async () => {
    fixture.closeHangs = true;
    fixture.killDelayMs = 3_000;
    const gpu = await commands.discoverGpu(
      { BROWSER_GPU_EXECUTABLE: "/chosen" },
      new AbortController().signal,
    );
    Object.defineProperty(process, "platform", { value: "win32" });
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance"] });
    const outcome = gpu.close().then(
      () => "closed",
      (error: unknown) => String(error),
    );
    await vi.advanceTimersByTimeAsync(5_000);
    expect(await outcome).toBe("closed");
    const evidence = json.parseJson(
      readFileSync(join(gpu.report, "..", "1", "cleanup.json"), "utf8"),
      json.object({ elapsedMs: json.number }),
      "Windows cleanup",
    );
    expect(evidence.elapsedMs).toBeLessThanOrEqual(5_000);
    expect(fixture.taskkillArguments).toEqual(["/pid", "123", "/T", "/F"]);
    expect(existsSync(lock)).toBe(false);
  });
  it("cancels discovery, closes its browser and releases the lock", async () => {
    const controller = new AbortController();
    fixture.abort = () => controller.abort(new Error("cancelled by control"));
    await expect(
      commands.discoverGpu({ BROWSER_GPU_EXECUTABLE: "/chosen" }, controller.signal),
    ).rejects.toThrow();
    expect(fixture.launches).toHaveLength(1);
    expect(fixture.closes).toBe(1);
    expect(existsSync(lock)).toBe(false);
  });
  it("shares one owned shutdown between cancellation and probe finalization", async () => {
    const controller = new AbortController();
    fixture.probeAbort = () => controller.abort(new Error("cancelled in probe"));
    await expect(
      commands.discoverGpu({ BROWSER_GPU_EXECUTABLE: "/chosen" }, controller.signal),
    ).rejects.toThrow();
    expect(fixture.closes).toBe(1);
    expect(existsSync(lock)).toBe(false);
  });
});
