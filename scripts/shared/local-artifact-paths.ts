import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

/** Resolve retained evidence without creating files or depending on task orchestration. */
export function localArtifactPaths(cwd = process.cwd()): {
  directory: string;
  primaryLocal: string;
  taskFile?: string;
} {
  const env = Object.fromEntries(
    Object.entries(process.env).filter(([name]) => !name.startsWith("GIT_")),
  );
  const git = (args: string[]) => spawnSync("git", args, { cwd, env, encoding: "utf8" });
  const worktrees = git(["worktree", "list", "--porcelain", "-z"]);
  // Standalone diagnostics may run outside a Git checkout.
  if (worktrees.status !== 0) {
    const directory = resolve(cwd, ".local");
    return { directory, primaryLocal: directory };
  }
  const primary = worktrees.stdout.split("\0").find((field) => field.startsWith("worktree "));
  const metadata = git(["rev-parse", "--path-format=absolute", "--git-path", "task-artifacts"]);
  if (!primary || metadata.status !== 0) throw new Error("Cannot resolve local artifact paths.");
  const primaryLocal = join(primary.slice("worktree ".length), ".local");
  const taskFile = metadata.stdout.trim();
  const folder = existsSync(taskFile) ? readFileSync(taskFile, "utf8").trim() : undefined;
  if (folder !== undefined && !/^gh-\d{5,}-issue-[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(folder)) {
    throw new Error(`Invalid task artifact folder in ${taskFile}; inspect it before continuing.`);
  }
  return {
    directory: folder === undefined ? primaryLocal : join(primaryLocal, folder),
    primaryLocal,
    taskFile,
  };
}
