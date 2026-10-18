import { execFileSync, spawnSync } from "node:child_process";
import {
  closeSync,
  ftruncateSync,
  mkdirSync,
  openSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";

const readme = `# Local artifacts

This entire directory is ignored, including this README. Keep credentials and
personal data out of artifacts. Canonical guidance: [working style](../engineering/agents/working-style.md#local-artifacts).

Use UTC timestamps, YYYYMMDD-HHMM, and lowercase hyphen-separated topic slugs.
Pad GitHub numbers to at least four digits (0055, 0123, 10000).

| Folder | Content |
| --- | --- |
| gh-issue-0055-local-artifacts/ | Task work, with dated activity subfolders when useful |
| gh-pr-0056-local-artifacts/ | PR-specific reviews; link to the issue folder instead of copying reports |
| sessions/20261018-1430_browser-check/ | One-off work without a GitHub issue or PR |
| topics/browser-testing/ | Optional continuing topic, with dated activities when useful |

Keep each artifact in one canonical location. Cross-link related folders in their
READMEs. Record completed or merged status there; keep folder names stable.
Existing folders stay valid: do not migrate or rename them automatically.

Use this primary checkout's directory for retained drafts, standalone Markdown
notes without a requested destination, logs, screenshots and reports. Explicit
destinations and maintained repository documentation take precedence. Tool-owned
build/test output and Git-common-directory handoffs keep their existing paths;
copy wanted evidence here before removing a task worktree. An index is optional.
`;

/** Initialize the primary checkout's scratch directory; never replace local notes. */
export function initializeLocalArtifacts(cwd: string, localExclude = false): string {
  // Git hooks export GIT_DIR and GIT_INDEX_FILE for their own checkout/index.
  const env = Object.fromEntries(
    Object.entries(process.env).filter(([name]) => !name.startsWith("GIT_")),
  );
  const git = (directory: string, args: readonly string[]) =>
    execFileSync("git", args, { cwd: directory, encoding: "utf8", env });
  const primary = git(cwd, ["worktree", "list", "--porcelain", "-z"])
    .split("\0")
    .find((field) => field.startsWith("worktree "))
    ?.slice("worktree ".length);
  if (!primary) throw new Error("A primary Git checkout is required for local artifacts.");
  if (git(primary, ["ls-files", "-z", "--", ".local"]).length > 0) {
    throw new Error(
      ".local contains tracked files. Review them explicitly before initialization; nothing was untracked.",
    );
  }

  const ignored = () =>
    spawnSync("git", ["check-ignore", "--quiet", "--", ".local/"], {
      cwd: primary,
      env,
    }).status === 0;
  if (!ignored()) {
    const ignoreFile = localExclude
      ? git(primary, ["rev-parse", "--path-format=absolute", "--git-path", "info/exclude"]).trim()
      : join(primary, ".gitignore");
    // Read and update the same opened file, even if its path changes meanwhile.
    const descriptor = openSync(ignoreFile, "a+");
    try {
      const existing = readFileSync(descriptor, "utf8");
      // Move only our exact rule to the end when a later exception defeated it.
      const preserved = existing
        .split(/\r?\n/u)
        .filter((line) => line !== "/.local/")
        .join("\n");
      ftruncateSync(descriptor, 0);
      writeFileSync(
        descriptor,
        `${preserved}${preserved.endsWith("\n") || !preserved ? "" : "\n"}/.local/\n`,
      );
    } finally {
      closeSync(descriptor);
    }
    if (!ignored())
      throw new Error("Could not exclude all of .local; review the Git ignore rules.");
  }

  const directory = join(primary, ".local");
  mkdirSync(directory, { recursive: true });
  const path = join(directory, "README.md");
  let descriptor: number;
  try {
    descriptor = openSync(path, "wx");
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "EEXIST") return directory;
    throw error;
  }
  try {
    writeFileSync(descriptor, readme);
  } finally {
    closeSync(descriptor);
  }
  return directory;
}
