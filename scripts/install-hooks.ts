import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { hookProblems } from "./git-hooks.ts";

// The hooks are tracked files under .githooks. Git's hook path is stored once
// in the repository's shared configuration, so every worktree uses them
// without a per-worktree install step.
const hooksPath = ".githooks";
const root = resolve(import.meta.dirname, "..");
const check = process.argv[2] === "--check";

function git(args: readonly string[]) {
  return spawnSync("git", args, { cwd: root, encoding: "utf8" });
}

if (git(["rev-parse", "--is-inside-work-tree"]).status !== 0) {
  console.log("SKIP · not a Git work tree; hooks are not installed");
} else if (check) {
  // CI checks out a fresh clone and runs the gate directly; hooks play no part there.
  const configured = git(["config", "--get", "core.hooksPath"]).stdout.trim();
  if (process.env.CI !== "true" && configured !== hooksPath) {
    console.error(
      `Git hooks are not active (core.hooksPath is "${configured}"). Run \`pnpm install --frozen-lockfile\` or \`pnpm prepare\`.`,
    );
    process.exitCode = 1;
  } else if (process.env.CI === "true") {
    console.log("PASS · Git hooks not required in CI");
  } else {
    // The hooks as Git finds them from this worktree: a task worktree runs the ones tracked
    // in its own checkout.
    const directory = resolve(root, git(["rev-parse", "--git-path", "hooks"]).stdout.trim());
    const problems = hookProblems(directory);
    if (problems.length > 0) {
      console.error(`Git hooks would not run: ${problems.join("; ")}.`);
      process.exitCode = 1;
    } else {
      console.log(`PASS · Git hooks active in ${directory}`);
    }
  }
} else {
  const result = git(["config", "core.hooksPath", hooksPath]);
  if (result.status !== 0) {
    console.error(`Could not set core.hooksPath:\n${result.stderr}`);
    process.exitCode = 1;
  }
}
