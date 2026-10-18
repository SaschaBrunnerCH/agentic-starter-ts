import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, expect, it } from "vitest";
import {
  browserInstallLocations,
  missingBrowserMessage,
  playwrightBrowsersPath,
} from "./playwright-browsers-path.ts";

const env = Object.fromEntries(
  Object.entries(process.env).filter(
    ([key]) => !key.startsWith("GIT_") && key !== "PLAYWRIGHT_BROWSERS_PATH",
  ),
);
const made: string[] = [];
afterEach(() => {
  for (const path of made.splice(0)) rmSync(path, { recursive: true, force: true });
});
function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd, env, encoding: "utf8", stdio: "pipe" }).trim();
}
function repository(): string {
  const root = mkdtempSync(join(tmpdir(), "browser cache "));
  made.push(root);
  git(root, "init", "--quiet");
  git(
    root,
    "-c",
    "user.name=Fixture",
    "-c",
    "user.email=fixture@example.test",
    "commit",
    "--quiet",
    "--allow-empty",
    "-m",
    "Fixture",
  );
  return root;
}

it("shares a cache across worktrees, survives worktree removal and isolates repositories", () => {
  const root = repository();
  const worktree = join(root, "linked checkout");
  git(root, "worktree", "add", "--quiet", "-b", "linked", worktree);
  const cache = playwrightBrowsersPath(env, root);
  expect(playwrightBrowsersPath(env, worktree)).toBe(cache);
  expect(cache).toBe(
    resolve(root, ".git/playwright-browsers", `${process.platform}-${process.arch}`),
  );
  mkdirSync(cache, { recursive: true });
  git(root, "worktree", "remove", worktree);
  expect(playwrightBrowsersPath(env, root)).toBe(cache);
  expect(playwrightBrowsersPath(env, repository())).not.toBe(cache);
});

it("separates Windows, WSL/Linux and architecture within a shared Git directory", () => {
  const root = repository();
  const windows = playwrightBrowsersPath(env, root, "win32", "x64");
  const linux = playwrightBrowsersPath(env, root, "linux", "x64");
  const arm = playwrightBrowsersPath(env, root, "linux", "arm64");
  expect(new Set([windows, linux, arm]).size).toBe(3);
});

it.each(["0", "./custom browsers", "/explicit/cache"])(
  "preserves explicit override %s without needing Git",
  (path) => {
    expect(playwrightBrowsersPath({ PLAYWRIGHT_BROWSERS_PATH: path }, "/no-checkout")).toBe(path);
  },
);

it("does not use hook Git variables to resolve another repository", () => {
  const root = repository();
  expect(playwrightBrowsersPath({ ...env, GIT_DIR: "/wrong/repository" }, root)).toBe(
    playwrightBrowsersPath(env, root),
  );
});

it("reads all install locations from the installed CLI's plan, including spaces", () => {
  expect(
    browserInstallLocations(
      "Browser\n  Install location: /cache with spaces/chromium-123\nOther\n  Install location: C:\\cache\\ffmpeg-456\n",
    ),
  ).toEqual(["/cache with spaces/chromium-123", "C:\\cache\\ffmpeg-456"]);
  expect(() => browserInstallLocations("unexpected output")).toThrow("install locations");
  expect(() => browserInstallLocations("Install location:   \n")).toThrow("install locations");
});

it("names the inspected cache, both missing-build causes and the setup command", () => {
  const message = missingBrowserMessage("/project/cache", ["/project/cache/chromium-123"]);
  expect(message).toContain("cache checked: /project/cache");
  expect(message).toContain("Missing browser builds: /project/cache/chromium-123");
  expect(message).toContain("Playwright update");
  expect(message).toContain("another install may have removed them from a shared cache");
  expect(message).toContain("pnpm test:browser:install");
});
