// Owns the discovery lock, disposable browser processes, private display and reports.
import { spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { homedir, release } from "node:os";
import { join, resolve } from "node:path";
import { chromium, type BrowserServer } from "@playwright/test";
import * as json from "../shared/json-shape.ts";
import {
  classifyRenderer,
  describeOwner,
  findOnPath,
  rendererNote,
  type LockOwner,
} from "./browser-gpu.ts";
import {
  browserCandidates,
  candidateProfiles,
  profileLaunchOptions,
  type GpuProfile,
  writeProfile,
} from "./browser-gpu-profile.ts";
import { GRAPHICS_PROBE } from "./browser-gpu-probe.ts";

const probeShape = json.array(
  json.object({
    api: json.string,
    identity: json.nullable(json.string),
    fallback: json.boolean,
    work: json.boolean,
    reason: json.nullable(json.string),
  }),
);
type Probe = json.ShapeOf<typeof probeShape>;
const ownerShape = json.object({
  pid: json.number,
  directory: json.string,
  startedAt: json.string,
});
const lockFile = join(homedir(), ".cache", "browser-gpu-tests", "lock");

function owner(): LockOwner {
  return json.parseJson(readFileSync(lockFile, "utf8"), ownerShape, "GPU lock");
}

function acquireLock(): () => void {
  mkdirSync(resolve(lockFile, ".."), { recursive: true, mode: 0o700 });
  const current = {
    pid: process.pid,
    directory: process.cwd(),
    startedAt: new Date().toISOString(),
  };
  try {
    writeFileSync(lockFile, JSON.stringify(current), { flag: "wx", mode: 0o600 });
  } catch (error) {
    if (!(error instanceof Error) || !("code" in error) || error.code !== "EEXIST") throw error;
    let description: string;
    try {
      description = describeOwner(owner());
    } catch {
      description = "an unreadable owner";
    }
    throw new Error(
      `GPU lock ${lockFile} is held by ${description}. Wait or inspect its owned cleanup; do not remove another run's lock.`,
      { cause: error },
    );
  }
  return () => {
    try {
      const held = owner();
      if (
        held.pid !== current.pid ||
        held.directory !== current.directory ||
        held.startedAt !== current.startedAt
      )
        throw new Error("Ownership changed");
      rmSync(lockFile);
    } catch (error) {
      throw new Error(`GPU lock ownership could not be released safely; inspect ${lockFile}.`, {
        cause: error,
      });
    }
  };
}

async function bounded<T>(promise: Promise<T>, milliseconds: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error(message)), milliseconds);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

class CleanupUnproved extends Error {}

async function stopWindowsBrowser(
  child: ChildProcess,
  profile: string | undefined,
  signal: AbortSignal,
): Promise<void> {
  if (child.pid === undefined) throw new Error("Owned browser has no process identifier");
  if (child.exitCode === null && child.signalCode === null) {
    // Playwright's Windows kill uses spawnSync, which prevents the deadline firing.
    // Use the same exact owned process tree asynchronously, never a process name.
    const command = spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], {
      stdio: "ignore",
      windowsHide: true,
      signal,
    });
    await new Promise<void>((accept, reject) => {
      command.once("error", reject);
      command.once("close", (code) => {
        // Graceful shutdown may finish while taskkill starts. The observed child
        // exit and the profile check below, rather than taskkill's status, prove cleanup.
        if (code === 0 || child.exitCode !== null || child.signalCode !== null) accept();
        else reject(new Error(`Owned process termination exited ${code}`));
      });
    });
  }
  // Playwright removes its disposable profile after the child process closes.
  if (profile !== undefined)
    while (existsSync(profile)) {
      signal.throwIfAborted();
      await new Promise<void>((accept) => setTimeout(accept, 20));
    }
}

async function closeBrowser(
  browser: BrowserServer,
  directory: string,
  probeError?: Error,
): Promise<void> {
  const started = performance.now();
  const child = browser.process();
  const profile = child.spawnargs
    .find((arg) => arg.startsWith("--user-data-dir="))
    ?.slice("--user-data-dir=".length);
  let forced = false;
  let gracefulError: string | null = null;
  let gracefulMs = 0;
  let failure: Error | undefined;
  try {
    try {
      // Reserve time to terminate this owned process; do not extend the five-second budget.
      await bounded(
        browser.close(),
        process.platform === "win32" ? 1_000 : 3_000,
        "Graceful browser close timed out",
      );
    } catch (error) {
      gracefulError = String(error);
      gracefulMs = performance.now() - started;
      forced = true;
      const controller = new AbortController();
      try {
        await bounded(
          process.platform === "win32"
            ? stopWindowsBrowser(child, profile, controller.signal)
            : browser.kill(),
          Math.max(0, 5_000 - gracefulMs),
          "Browser cleanup timed out",
        );
      } finally {
        controller.abort();
      }
    }
    if (!forced) gracefulMs = performance.now() - started;
    if (child.exitCode === null && child.signalCode === null)
      throw new Error("Owned browser process is still running");
    if (profile !== undefined && existsSync(profile))
      throw new Error("Owned browser profile still exists");
  } catch (error) {
    failure = error instanceof Error ? error : new Error(String(error));
  }
  const elapsedMs = performance.now() - started;
  try {
    writeFileSync(
      join(directory, "cleanup.json"),
      `${JSON.stringify({ browserPid: child.pid, forced, gracefulError, gracefulMs: Math.round(gracefulMs), forcedMs: forced ? Math.round(elapsedMs - gracefulMs) : 0, elapsedMs: Math.round(elapsedMs), processExited: child.exitCode !== null || child.signalCode !== null, profileRemoved: profile === undefined ? null : !existsSync(profile), error: failure === undefined ? null : String(failure) }, null, 2)}\n`,
    );
  } catch (error) {
    failure ??= error instanceof Error ? error : new Error(String(error));
  }
  if (failure !== undefined) {
    const cause =
      probeError === undefined
        ? failure
        : new AggregateError(
            [probeError, failure],
            `${probeError.message}; cleanup failed: ${failure.message}`,
          );
    throw new CleanupUnproved(cause.message, { cause });
  }
}

async function stopDisplay(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const exited = new Promise<void>((accept) => child.once("exit", () => accept()));
  child.kill("SIGTERM");
  try {
    await bounded(exited, 3_000, "Virtual display cleanup timed out");
  } catch (error) {
    throw new CleanupUnproved(String(error));
  }
}

async function startDisplay(
  signal: AbortSignal,
): Promise<{ child: ChildProcess; display: string }> {
  // Let Xvfb allocate an unused display and report readiness. Checking only a
  // filesystem socket misses Linux abstract sockets (including some WSL setups).
  const child = spawn(
    "Xvfb",
    ["-displayfd", "3", "-screen", "0", "1280x800x24", "-nolisten", "tcp"],
    { stdio: ["ignore", "ignore", "pipe", "pipe"] },
  );
  let diagnostic = "";
  child.stderr?.on("data", (data: Buffer) => {
    diagnostic = (diagnostic + data.toString()).slice(-4_000);
  });
  const interrupt = () => child.kill("SIGTERM");
  signal.addEventListener("abort", interrupt, { once: true });
  try {
    signal.throwIfAborted();
    const ready = new Promise<string>((accept, reject) => {
      let number = "";
      child.stdio[3]?.on("data", (data: Buffer) => {
        number += data.toString();
        if (/^\d+\n$/u.test(number)) accept(`:${number.trim()}`);
      });
      child.once("error", reject);
      child.once("exit", () => reject(new Error(`Xvfb exited during startup: ${diagnostic}`)));
    });
    const display = await bounded(ready, 5_000, "Xvfb startup timed out");
    return { child, display };
  } catch (error) {
    if (child.pid !== undefined) await stopDisplay(child);
    throw error;
  } finally {
    signal.removeEventListener("abort", interrupt);
  }
}

async function probe(
  profile: GpuProfile,
  env: Readonly<NodeJS.ProcessEnv>,
  directory: string,
  signal: AbortSignal,
): Promise<{ version: string; results: Probe; server: BrowserServer }> {
  const server = createServer((_request, response) => {
    response.setHeader("content-type", "text/html");
    response.end("<!doctype html><title>Graphics probe</title>");
  });
  await new Promise<void>((accept, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", accept);
  });
  let serverBrowser: BrowserServer | undefined;
  let browserCleanup: Promise<void> | undefined;
  let probeError: Error | undefined;
  const cleanupBrowser = () => {
    if (serverBrowser === undefined) return Promise.resolve();
    browserCleanup ??= closeBrowser(serverBrowser, directory, probeError);
    return browserCleanup;
  };
  let keepBrowser = false;
  let interrupted = false;
  // Closing the owned browser interrupts an unresponsive GPU operation; the finally
  // below still verifies cleanup before a next candidate or a lock release.
  const interrupt = () => {
    interrupted = true;
    probeError = signal.reason instanceof Error ? signal.reason : new Error("Probe interrupted");
    void cleanupBrowser().catch(() => {});
  };
  signal.addEventListener("abort", interrupt, { once: true });
  let complete = false;
  try {
    const result = await bounded(
      (async () => {
        signal.throwIfAborted();
        serverBrowser = await chromium.launchServer({
          ...profileLaunchOptions(profile, env),
          host: "127.0.0.1",
          // The command owns signal handling and must finish lock cleanup before exit.
          handleSIGINT: false,
          handleSIGTERM: false,
          handleSIGHUP: false,
        });
        const child = serverBrowser.process();
        writeFileSync(
          join(directory, "ownership.json"),
          JSON.stringify(
            {
              browserPid: child.pid,
              profileArgument:
                child.spawnargs.find((arg) => arg.startsWith("--user-data-dir=")) ?? null,
            },
            null,
            2,
          ),
        );
        const browser = await chromium.connect(serverBrowser.wsEndpoint());
        signal.throwIfAborted();
        const page = await browser.newPage();
        page.setDefaultTimeout(5_000);
        const address = server.address();
        if (typeof address !== "object" || address === null)
          throw new Error("Probe server has no port");
        await page.goto(`http://127.0.0.1:${address.port}/`);
        const raw: unknown = await bounded(
          page.evaluate(
            `(${GRAPHICS_PROBE})(${JSON.stringify({ apis: profile.apis, webgpuFeatureLevel: profile.webgpuFeatureLevel ?? "core" })})`,
          ),
          8_000,
          "Graphics API probe timed out",
        );
        const results = json.parseJson(JSON.stringify(raw), probeShape, "Browser graphics probe");
        if (interrupted) throw new Error("Graphics probe interrupted or timed out");
        const accepted = usable(results, profile.apis);
        if (!accepted) {
          try {
            await page.goto("chrome://gpu");
            const text = await page.evaluate<string>(
              `(() => { const texts = []; const walk = (node) => { if (node.nodeType === Node.TEXT_NODE && node.textContent.trim()) texts.push(node.textContent.trim()); if (node.shadowRoot) walk(node.shadowRoot); for (const child of node.childNodes) walk(child); }; walk(document.body); return texts.join("\\n"); })()`,
            );
            writeFileSync(join(directory, "chrome-gpu.txt"), text);
          } catch {
            /* The result still names the original failure when diagnostics cannot load. */
          }
        }
        const version = browser.version();
        await page.close();
        await browser.close(); // Disconnect; the task owns the server process until acceptance ends.
        keepBrowser = accepted;
        return { version, results, server: serverBrowser };
      })(),
      20_000,
      "Graphics attempt timed out",
    );
    complete = true;
    return result;
  } catch (error) {
    probeError = error instanceof Error ? error : new Error(String(error));
    throw error;
  } finally {
    signal.removeEventListener("abort", interrupt);
    try {
      if (serverBrowser !== undefined && (!complete || !keepBrowser)) {
        await cleanupBrowser();
      }
    } finally {
      server.closeAllConnections();
      await new Promise<void>((accept) => server.close(() => accept()));
    }
  }
}

function usable(results: Probe, apis: readonly string[]): boolean {
  return (
    results.length === apis.length &&
    apis.every((api) =>
      results.some(
        (result) =>
          result.api === api &&
          result.work &&
          !result.fallback &&
          result.reason === null &&
          classifyRenderer(result.identity) === "hardware",
      ),
    )
  );
}

export interface DiscoveredGpu {
  profile: GpuProfile;
  report: string;
  results: Probe;
  version: string;
  wsEndpoint: string;
  close: () => Promise<void>;
}

export async function discoverGpu(
  env: Readonly<NodeJS.ProcessEnv>,
  signal: AbortSignal,
  preferred?: GpuProfile,
): Promise<DiscoveredGpu> {
  if (env.REMOTE_BROWSER_WS_ENDPOINT !== undefined)
    throw new Error(
      "Explicit remote GPU verification is unavailable: local discovery cannot prove the remote browser's adapter. Run the doctor on the rendering host. See engineering/agents/browser-gpu-discovery.md.",
    );
  const profiles =
    preferred === undefined
      ? candidateProfiles(
          process.platform,
          env,
          browserCandidates(process.platform, env, existsSync),
        )
      : [{ ...preferred, display: undefined }];
  const unlock = acquireLock();
  const directory = resolve(".local", "browser-gpu", randomUUID());
  let display: { child: ChildProcess; display: string } | undefined;
  let cleanupProved = true;
  let acceptedBrowser: { server: BrowserServer; directory: string } | undefined;
  let closed = false;
  let lockReleased = false;
  const attempts: unknown[] = [];
  let selected: GpuProfile | undefined;
  const report = join(directory, "report.json");
  const profileFile = join(directory, "selected-profile.json");
  const metadata = {
    driverOS: `${process.platform} ${release()}`,
    browserOS: process.platform,
    wsl: env.WSL_DISTRO_NAME !== undefined || env.WSL_INTEROP !== undefined,
    container: existsSync("/.dockerenv") || existsSync("/run/.containerenv"),
    deviceAccess: { dxg: existsSync("/dev/dxg"), dri: existsSync("/dev/dri") },
    graphicsEnvironment: Object.fromEntries(
      [
        "DISPLAY",
        "WAYLAND_DISPLAY",
        "XDG_SESSION_TYPE",
        "MESA_LOADER_DRIVER_OVERRIDE",
        "MESA_D3D12_DEFAULT_ADAPTER_NAME",
        "VK_ICD_FILENAMES",
      ].flatMap((name) => (env[name] === undefined ? [] : [[name, env[name]]])),
    ),
  };
  const save = (status: string) => {
    writeFileSync(
      report,
      `${JSON.stringify({ ...metadata, status, lockReleased, discovery: selected === undefined ? "failed" : "passed", selected: selected ?? null, reproduce: selected === undefined ? null : ["pnpm", "browser:doctor", "--profile", profileFile], attempts }, null, 2)}\n`,
    );
  };
  const close = async () => {
    if (closed) return;
    closed = true;
    if (acceptedBrowser !== undefined) {
      try {
        await closeBrowser(acceptedBrowser.server, acceptedBrowser.directory);
      } catch (error) {
        cleanupProved = false;
        save("cleanup-unproved");
        throw error;
      }
    }
    if (display !== undefined) {
      try {
        await stopDisplay(display.child);
      } catch (error) {
        cleanupProved = false;
        save("cleanup-unproved");
        throw error;
      }
    }
    if (!cleanupProved) {
      save("cleanup-unproved");
      throw new CleanupUnproved(`Cleanup unproved; retain ${lockFile} and inspect ${report}`);
    }
    try {
      unlock();
    } catch (error) {
      try {
        save("lock-release-failed");
      } catch {
        /* Keep the ownership error even when the report is unwritable. */
      }
      throw error;
    }
    lockReleased = true;
    save("cleanup-complete");
  };
  try {
    mkdirSync(directory, { recursive: true });
    const started = performance.now();
    for (const headed of [false, true]) {
      if (headed) {
        if (process.platform !== "linux" || findOnPath(["Xvfb"], env, existsSync) === undefined)
          break;
        if (performance.now() - started > 170_000) break;
        try {
          display = await startDisplay(signal);
        } catch (error) {
          attempts.push({ stage: "virtual-display", error: String(error) });
          save("discovering");
          if (error instanceof CleanupUnproved) {
            cleanupProved = false;
            throw error;
          }
          break;
        }
      }
      for (const candidate of profiles) {
        signal.throwIfAborted();
        if (performance.now() - started > 155_000) break;
        const profile = {
          ...candidate,
          ...(display === undefined ? {} : { display: display.display }),
        };
        const attemptDirectory = join(directory, String(attempts.length + 1));
        mkdirSync(attemptDirectory);
        try {
          const result = await probe(profile, env, attemptDirectory, signal);
          const accepted = usable(result.results, profile.apis);
          if (accepted) acceptedBrowser = { server: result.server, directory: attemptDirectory };
          attempts.push({ profile, version: result.version, results: result.results });
          save("discovering");
          console.log(
            `GPU attempt ${attempts.length}: ${JSON.stringify(profile)} → ${result.results.map((row) => `${row.api}: ${row.identity ?? "unknown"}; ${row.reason ?? (row.work ? "readback passed" : "readback failed")}`).join("; ")}`,
          );
          if (accepted) {
            const note = rendererNote(env, result.results[0]?.identity ?? null);
            if (note !== undefined) console.log(note);
            selected = profile;
            writeFileSync(profileFile, writeProfile(profile));
            save("selected");
            console.log(`GPU discovery evidence: ${report}`);
            console.log(
              `Reproduce profile: pnpm browser:doctor --profile ${JSON.stringify(profileFile)}`,
            );
            return {
              profile,
              report,
              results: result.results,
              version: result.version,
              wsEndpoint: result.server.wsEndpoint(),
              close,
            };
          }
        } catch (error) {
          attempts.push({ profile, error: String(error) });
          save("discovering");
          console.log(
            `GPU attempt ${attempts.length}: ${error instanceof Error ? error.message : String(error)}`,
          );
          if (error instanceof CleanupUnproved) {
            cleanupProved = false;
            throw error;
          }
          if (acceptedBrowser !== undefined) throw error;
        }
      }
    }
    throw new Error(
      `No verified hardware profile for ${profiles[0]?.apis.join(", ") ?? "requested APIs"}. Read ${report} and engineering/agents/browser-gpu-discovery.md. A failed candidate does not establish that the machine lacks a GPU.${profiles[0]?.apis.includes("webgpu") && profiles[0].webgpuFeatureLevel !== "compatibility" ? " Core WebGPU remains required. Diagnose the separate compatibility capability with: pnpm browser:doctor --api webgpu --webgpu-feature-level compatibility. Use it for application tests only if the application explicitly supports that feature level." : ""}`,
    );
  } catch (error) {
    try {
      await close();
    } catch (cleanupError) {
      // Report I/O must not hide the original discovery error once all resources
      // are proven closed and the lock has been released.
      if (!lockReleased)
        throw new AggregateError(
          [error, cleanupError],
          `${String(error)}; cleanup failed: ${String(cleanupError)}`,
          { cause: cleanupError },
        );
    }
    throw error;
  }
}
