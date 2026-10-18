import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { GATE_HOOKS, hookProblems } from "./git-hooks.ts";

const made: string[] = [];
function directory(): string {
  const path = mkdtempSync(join(tmpdir(), "git-hooks-"));
  made.push(path);
  return path;
}

afterEach(() => {
  for (const path of made.splice(0)) rmSync(path, { recursive: true, force: true });
});

function writeHook(hooks: string, name: string, body: string, executable = true): void {
  writeFileSync(join(hooks, name), `#!/bin/sh\n${body}\n`);
  chmodSync(join(hooks, name), executable ? 0o755 : 0o644);
}

describe("hookProblems", () => {
  it("finds nothing when every gate hook is there and executable", () => {
    const hooks = directory();
    for (const hook of GATE_HOOKS) writeHook(hooks, hook, "exit 0");
    expect(hookProblems(hooks)).toEqual([]);
  });

  it("names a missing hook and one that cannot be executed", () => {
    const hooks = directory();
    writeHook(hooks, "pre-commit", "exit 0");
    writeHook(hooks, "commit-msg", "exit 0", false);
    expect(hookProblems(hooks)).toEqual([
      expect.stringMatching(/^commit-msg is missing or not executable/u),
      expect.stringMatching(/^pre-push is missing or not executable/u),
    ]);
  });
});

// Inside a Git hook, as when the pre-push hook runs the gate, Git sets GIT_DIR and related
// variables. Passed on, they would point every command below at this repository instead of
// the scratch one: they are left out. The global and system configuration are left out too,
// so a contributor's commit signing or own hooks path cannot change the result.
const scratchEnvironment = {
  ...Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith("GIT_"))),
  GIT_CONFIG_GLOBAL: "/dev/null",
  GIT_CONFIG_NOSYSTEM: "1",
};
const git = (cwd: string, ...args: string[]) =>
  spawnSync("git", ["-c", "user.name=Test", "-c", "user.email=test@example.com", ...args], {
    cwd,
    encoding: "utf8",
    env: scratchEnvironment,
  });

// The design this repository relies on: the relative hook path is set once, in the shared
// configuration, and a task worktree then runs the hooks tracked in its own checkout.
describe("hooks in a task worktree", () => {
  it("runs the tracked hooks when committing from a worktree", () => {
    const root = directory();
    const main = join(root, "main");
    mkdirSync(join(main, ".githooks"), { recursive: true });
    expect(git(main, "init", "-q", "-b", "main").status).toBe(0);
    writeHook(join(main, ".githooks"), "commit-msg", 'grep -q "^Refused" "$1" && exit 1\nexit 0');
    expect(git(main, "add", ".").status).toBe(0);
    expect(git(main, "commit", "-q", "-m", "Add hooks", "--no-verify").status).toBe(0);
    expect(git(main, "config", "core.hooksPath", ".githooks").status).toBe(0);

    const task = join(root, "task");
    expect(git(main, "worktree", "add", "-q", "-b", "task", task).status).toBe(0);
    expect(git(task, "rev-parse", "--git-path", "hooks").stdout.trim()).toBe(".githooks");
    expect(hookProblems(join(task, ".githooks"))).toHaveLength(2);

    // The hook refuses this message in the worktree, so it ran there; without hooks it passes.
    const refused = git(task, "commit", "-q", "--allow-empty", "-m", "Refused message");
    expect(refused.status).not.toBe(0);
    const control = git(task, "commit", "-q", "--allow-empty", "-m", "Refused", "--no-verify");
    expect(control.status).toBe(0);
  });
});
