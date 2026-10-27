import { spawnSync } from "node:child_process";
import { lstatSync, readdirSync, watch, type FSWatcher } from "node:fs";
import { dirname, join } from "node:path";

/** A source guard, not build provenance or independent attestation. */
export function guardBrowserSource(root: string) {
  const git = (args: string[]) => {
    const result = spawnSync("git", args, { cwd: root, encoding: "utf8" });
    if (result.error !== undefined || result.status !== 0)
      throw new Error(`Browser source identity unavailable: git ${args[0]} failed.`);
    return result.stdout;
  };
  const snapshot = () => {
    const commit = git(["rev-parse", "HEAD"]).trim();
    if (!/^[a-f\d]{40}$/u.test(commit)) throw new Error("Browser source commit is unavailable.");
    return { commit, status: git(["status", "--porcelain", "--untracked-files=all"]) };
  };
  const initial = snapshot();
  const files = new Set(
    git(["ls-files", "--cached", "--others", "--exclude-standard", "-z"])
      .split("\0")
      .filter(Boolean),
  );
  const watchers: FSWatcher[] = [];
  const directories = new Set<string>();
  let changed = false;
  const close = () => watchers.splice(0).forEach((watcher) => watcher.close());
  try {
    for (const directory of new Set([".", ...[...files].map(dirname)])) {
      // Directory-only ignore patterns stop matching bare paths while absent.
      // Remember observed directory identity, including ignored generated output.
      for (const entry of readdirSync(join(root, directory), { withFileTypes: true }))
        if (entry.isDirectory()) directories.add(join(directory, entry.name).replaceAll("\\", "/"));
      const watcher = watch(join(root, directory), { persistent: false }, (_event, filename) => {
        if (filename === null) {
          changed = true;
          return;
        }
        const path = join(directory, filename).replaceAll("\\", "/");
        if (path === ".git" || path.startsWith(".git/")) return;
        if (files.has(path)) changed = true;
        else {
          try {
            const entry = lstatSync(join(root, path), { throwIfNoEntry: false });
            if (entry?.isDirectory()) directories.add(path);
            else if (entry !== undefined) directories.delete(path);
            const candidate = directories.has(path) ? `${path}/` : path;
            const ignored = spawnSync("git", ["check-ignore", "-q", "--", candidate], {
              cwd: root,
            });
            if (ignored.error !== undefined || ignored.status !== 0) changed = true;
          } catch {
            changed = true;
          }
        }
      });
      watcher.on("error", () => {
        changed = true;
      });
      watchers.push(watcher);
    }
  } catch (error) {
    close();
    throw error;
  }
  return {
    commit: initial.commit,
    dirty: initial.status !== "",
    assertStable() {
      const current = snapshot();
      if (changed || current.commit !== initial.commit || current.status !== initial.status)
        throw new Error(
          "Source changed during browser verification; evidence is invalid. Rerun on stable sources.",
        );
    },
    close,
  };
}
