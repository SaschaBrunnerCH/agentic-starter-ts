import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as json from "./json-shape.ts";
import type { LaunchOptions } from "@playwright/test";

const fixture = vi.hoisted(() => {
  const launches: LaunchOptions[] = [];
  return {
    directory: "",
    identity: "Intel UHD Graphics",
    work: true,
    fallback: false,
    cleanupFails: false,
    firstBrowserFails: false,
    launches,
    closes: 0,
    abort: () => {},
  };
});
vi.mock("node:os", async (original) => ({
  ...(await original<typeof import("node:os")>()),
  homedir: () => fixture.directory,
}));
vi.mock("@playwright/test", () => ({
  chromium: {
    launchServer: async (options: LaunchOptions) => {
      fixture.launches.push(options);
      fixture.abort();
      if (fixture.firstBrowserFails && options.executablePath?.endsWith("google-chrome"))
        throw new Error("First browser cannot launch");
      return {
        process: () => ({ pid: 123, spawnargs: [], exitCode: 0, signalCode: null }),
        wsEndpoint: () => "ws://owned-server",
        close: async () => {
          fixture.closes += 1;
          if (fixture.cleanupFails) throw new Error("Owned browser did not close");
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
          const apis = json.parseJson(
            script.slice(script.lastIndexOf(")(") + 2, -1),
            json.array(json.string),
            "Probe APIs",
          );
          return apis.map((api) => ({
            api,
            identity: fixture.identity,
            fallback: fixture.fallback,
            work: fixture.work,
            reason: null,
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
    firstBrowserFails: false,
    closes: 0,
    abort: () => {},
  });
  fixture.launches.length = 0;
  lock = join(home, ".cache", "browser-gpu-tests", "lock");
  vi.spyOn(console, "log").mockImplementation(() => {});
  commands = await import("./browser-gpu-discovery.ts");
});
afterEach(() => {
  process.chdir(cwd);
  rmSync(home, { recursive: true, force: true });
  vi.restoreAllMocks();
});

// These tests exercise ownership/search failures with browser processes mocked.
// They are not evidence of hardware access on any platform.
describe("discovery ownership and failure paths", () => {
  it("checks WebGPU independently without adding WebGL", async () => {
    const gpu = await commands.discoverGpu(
      { BROWSER_GPU_EXECUTABLE: "/chosen", BROWSER_GPU_APIS: "webgpu" },
      new AbortController().signal,
    );
    expect(gpu.results.map((result) => result.api)).toEqual(["webgpu"]);
    expect(fixture.launches[0]?.args).toContain("--enable-unsafe-webgpu");
    await gpu.close();
  });
  it("keeps the lease through acceptance and refuses an overlapping run", async () => {
    const gpu = await commands.discoverGpu(
      { BROWSER_GPU_EXECUTABLE: "/chosen" },
      new AbortController().signal,
    );
    expect(existsSync(lock)).toBe(true);
    await expect(
      commands.discoverGpu({ BROWSER_GPU_EXECUTABLE: "/chosen" }, new AbortController().signal),
    ).rejects.toThrow("GPU lease");
    expect(fixture.launches).toHaveLength(1);
    expect(fixture.closes).toBe(0);
    expect(readFileSync(gpu.report, "utf8")).toContain("test-version");
    await gpu.close();
    await gpu.close();
    expect(existsSync(lock)).toBe(false);
    expect(readFileSync(gpu.report, "utf8")).toContain('"discovery": "passed"');
  });
  it("preserves an unreadable lease, and diagnoses explicit remote verification", async () => {
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
    writeFileSync(join(bin, "google-chrome"), "");
    writeFileSync(join(bin, "chromium"), "");
    fixture.firstBrowserFails = true;
    const gpu = await commands.discoverGpu({ PATH: bin }, new AbortController().signal);
    expect(gpu.profile.browser).toEqual({ executablePath: join(bin, "chromium") });
    expect(fixture.launches.length).toBeGreaterThan(1);
    const report = readFileSync(gpu.report, "utf8");
    expect(report).toContain("First browser cannot launch");
    expect(report).toContain("Intel UHD Graphics");
    await gpu.close();
  });
  it.each(["software", "unknown", "no-work", "fallback"])(
    "rejects %s without retaining a false pass or a lease",
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
    fixture.identity = "SwiftShader";
    await expect(
      commands.discoverGpu({ BROWSER_GPU_EXECUTABLE: "/chosen" }, new AbortController().signal),
    ).rejects.toThrow("Cleanup unproved");
    expect(fixture.launches).toHaveLength(1);
    expect(existsSync(lock)).toBe(true);
  });
  it("cancels discovery, closes its browser and releases the lease", async () => {
    const controller = new AbortController();
    fixture.abort = () => controller.abort(new Error("cancelled by control"));
    await expect(
      commands.discoverGpu({ BROWSER_GPU_EXECUTABLE: "/chosen" }, controller.signal),
    ).rejects.toThrow();
    expect(fixture.launches).toHaveLength(1);
    expect(fixture.closes).toBe(1);
    expect(existsSync(lock)).toBe(false);
  });
});
