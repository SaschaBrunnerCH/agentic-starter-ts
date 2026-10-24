import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { requireDevelopmentPlatform } from "./development-platform.ts";

it.each(["linux", "darwin"])("supports %s development", (platform) => {
  expect(() => requireDevelopmentPlatform(platform)).not.toThrow();
});

it("uses the actual runtime platform by default", () => {
  if (process.platform === "linux" || process.platform === "darwin") {
    expect(() => requireDevelopmentPlatform()).not.toThrow();
  } else {
    expect(() => requireDevelopmentPlatform()).toThrow("Development workflows require");
  }
});

it.each(["win32", "freebsd"])("explains how to continue from %s", (platform) => {
  expect(() => requireDevelopmentPlatform(platform)).toThrow(`runs on ${platform}`);
  expect(() => requireDevelopmentPlatform(platform)).toThrow("open a WSL2 shell");
  expect(() => requireDevelopmentPlatform(platform)).toThrow(
    "Native Windows browser/GPU acceptance remains available",
  );
});

// Preload Vite with the host platform before simulating Windows: task.ts imports
// its native parser for regression proof. This is a policy simulation, not
// Windows binary acceptance. Execute real entrypoints; the only allowed
// subprocess is task.ts's read-only common-directory lookup during initialization.
// Any attempt to run checks, claim an issue, fetch, create a worktree or install
// dependencies fails this control before it can touch the host or GitHub.
describe("native Windows rejection before work starts", () => {
  it.each([
    ["scripts/checks/run-local-checks.ts", []],
    ["scripts/checks/check-adoption.ts", []],
    ["scripts/workflow/task.ts", ["start", "85"]],
  ])("guards %s", (entrypoint, args) => {
    const entry = pathToFileURL(resolve(import.meta.dirname, "../..", entrypoint)).href;
    const result = spawnSync(
      process.execPath,
      [
        "--input-type=module",
        "--eval",
        `
      import childProcess from "node:child_process";
      import { syncBuiltinESMExports } from "node:module";
      await import("vite");
      childProcess.spawnSync = (command, args) => {
        if (command === "git" && JSON.stringify(args) === JSON.stringify(["rev-parse", "--path-format=absolute", "--git-common-dir"])) {
          return { status: 0, stdout: "/fixture/.git", stderr: "" };
        }
        console.error("UNEXPECTED_SUBPROCESS", command);
        throw new Error("Subprocess started before platform rejection");
      };
      syncBuiltinESMExports();
      Object.defineProperty(process, "platform", { value: "win32" });
      process.argv = [process.execPath, ${JSON.stringify(entry)}, ...${JSON.stringify(args)}];
      await import(${JSON.stringify(entry)});
    `,
      ],
      { encoding: "utf8", timeout: 10_000 },
    );
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Development workflows require Linux, macOS or WSL2");
    expect(result.stderr).toContain("README.md#windows-development-with-wsl2");
    expect(result.stderr).not.toContain("UNEXPECTED_SUBPROCESS");
  });
});
