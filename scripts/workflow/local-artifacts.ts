import { localArtifactPaths } from "../shared/local-artifact-paths.ts";
import { slug } from "./task-rules.ts";
import { execFileSync, spawnSync } from "node:child_process";
import {
  appendFileSync,
  existsSync,
  closeSync,
  ftruncateSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { basename, join } from "node:path";

const readme = `# Local artifacts

This entire directory is ignored, including this README. Keep credentials and
personal data out of artifacts. Canonical guidance: [working style](../engineering/agents/working-style.md#local-artifacts).

Use UTC timestamps, YYYYMMDD-HHMM, and lowercase hyphen-separated topic slugs.
Pad GitHub numbers to five digits (00055, 00123, 10000), before issue/pr.
Never truncate larger IDs. Issues and PRs share GitHub’s number sequence; these
folders sort in creation order through 99,999.
For \`<title>\`, use the actual GitHub issue or PR title converted to a portable
lowercase hyphen-separated slug.

| Folder | Content |
| --- | --- |
| \`gh-00055-issue-<title>/\` | Task work, with dated activity subfolders when useful |
| \`gh-00057-pr-<title>/\` | PR-specific reviews; link to the issue folder instead of copying reports |
| \`20261018-1430_browser-check/\` | One-off work without a GitHub issue or PR |
| \`topics/browser-testing/\` | Optional continuing topic, with dated activities when useful |

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
  createArtifactReadme(join(directory, "README.md"), readme);
  return directory;
}

/** Open exclusively so an existing note (or a replaced pathname) is never overwritten. */
function createArtifactReadme(path: string, contents: string): void {
  let descriptor: number;
  try {
    descriptor = openSync(path, "wx");
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "EEXIST") return;
    throw error;
  }
  try {
    writeFileSync(descriptor, contents);
  } finally {
    closeSync(descriptor);
  }
}

/** A portable, stable issue folder; GitHub IDs larger than five digits stay intact. */
export function issueArtifactFolder(issue: number, title: string): string {
  if (!Number.isSafeInteger(issue) || issue <= 0) throw new Error("Invalid issue number.");
  return `gh-${String(issue).padStart(5, "0")}-issue-${slug(title, 200)}`;
}

/** Reuse a retained issue folder even after its title changes; never guess between duplicates. */
export function issueArtifactDirectory(local: string, issue: number, title: string): string {
  const name = issueArtifactFolder(issue, title);
  const prefix = `gh-${String(issue).padStart(5, "0")}-issue-`;
  const matches = existsSync(local)
    ? readdirSync(local, { withFileTypes: true })
        .filter((entry) => entry.isDirectory() && entry.name.startsWith(prefix))
        .map((entry) => entry.name)
    : [];
  if (matches.length > 1)
    throw new Error(
      `Multiple artifact folders for issue #${issue}; inspect ${local} before continuing.`,
    );
  return join(local, matches[0] ?? name);
}

/** Initialize task retention and remember its folder in this worktree's Git metadata. */
export function initializeTaskArtifacts(
  cwd: string,
  issue: number,
  title: string,
  url: string,
  branch: string,
): string {
  const local = initializeLocalArtifacts(cwd, true);
  const paths = localArtifactPaths(cwd);
  if (paths.taskFile === undefined) throw new Error("Task artifacts need a Git checkout.");
  const directory =
    paths.directory === local ? issueArtifactDirectory(local, issue, title) : paths.directory;
  if (!basename(directory).startsWith(`gh-${String(issue).padStart(5, "0")}-issue-`)) {
    throw new Error("Task artifact reference names another issue; inspect its Git metadata.");
  }
  mkdirSync(directory, { recursive: true });
  createArtifactReadme(
    join(directory, "README.md"),
    `# Task artifacts\n\nIssue: ${url}\nBranch: ${branch}\n\nStatus: in progress\n`,
  );
  writeFileSync(paths.taskFile, `${basename(directory)}\n`);
  return directory;
}

/** Append an idempotent completion event without replacing contributors' local notes. */
export function recordArtifactMerge(directory: string, pr: number, head: string): void {
  mkdirSync(directory, { recursive: true });
  const path = join(directory, "README.md");
  const event = `Status: merged by PR #${pr} at ${head}`;
  // Read and append through the same open file, even if the pathname changes.
  const descriptor = openSync(path, "a+");
  try {
    const previous = readFileSync(descriptor, "utf8");
    if (!previous.split("\n").includes(event)) appendFileSync(descriptor, `\n${event}\n`);
  } finally {
    closeSync(descriptor);
  }
}
