import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  initializeLocalArtifacts,
  initializeTaskArtifacts,
  issueArtifactFolder,
  recordArtifactMerge,
} from "./local-artifacts.ts";
import { localArtifactPaths } from "../shared/local-artifact-paths.ts";
import {
  browserEvidenceFile,
  readBrowserRuns,
  withRun,
  type BrowserRun,
} from "../browser/browser-evidence.ts";

const made: string[] = [];
const env = {
  ...Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith("GIT_"))),
  GIT_CONFIG_NOSYSTEM: "1",
};
const git = (cwd: string, ...args: string[]) =>
  execFileSync("git", ["-c", "user.name=Test", "-c", "user.email=test@example.com", ...args], {
    cwd,
    env,
    encoding: "utf8",
  });
function repository(trackedIgnore = false) {
  const parent = mkdtempSync(join(tmpdir(), "local-artifacts-"));
  made.push(parent);
  const primary = join(parent, "primary");
  const task = join(parent, "primary.worktrees", "42-task");
  mkdirSync(primary);
  git(primary, "init", "-q", "-b", "main");
  if (trackedIgnore) writeFileSync(join(primary, ".gitignore"), "other-output/\n.local/\n");
  writeFileSync(join(primary, "tracked.md"), "Project\n");
  git(primary, "add", ".");
  git(primary, "-c", "core.hooksPath=", "-c", "commit.gpgsign=false", "commit", "-qm", "Start");
  git(primary, "worktree", "add", "-qb", "task", task);
  return { primary, task };
}
function isIgnored(cwd: string, path: string): boolean {
  return spawnSync("git", ["check-ignore", "--quiet", "--", path], { cwd, env }).status === 0;
}
afterEach(() => {
  for (const path of made.splice(0)) rmSync(path, { recursive: true, force: true });
});

describe("local artifacts", () => {
  it("initializes the primary checkout from a linked worktree and preserves artifacts on cleanup", () => {
    const { primary, task } = repository(true);
    const originalIgnore = readFileSync(join(primary, ".gitignore"), "utf8");
    const directory = initializeLocalArtifacts(task);
    expect(directory).toBe(join(primary, ".local"));
    const readme = readFileSync(join(directory, "README.md"), "utf8");
    expect(readme).toContain("gh-00055-issue-<title>");
    expect(readme).toContain("gh-00057-pr-<title>");
    expect(readme).toContain("UTC");
    expect(readme).toContain("20261018-1430_browser-check/");
    expect(readme).not.toContain("sessions/");
    expect(readme).not.toContain("gh-issue-");
    expect(readme).not.toContain("gh-pr-");
    mkdirSync(join(directory, "gh-00055-issue-example-task", "20261018-1430_review"), {
      recursive: true,
    });
    writeFileSync(
      join(directory, "gh-00055-issue-example-task", "20261018-1430_review", "notes.md"),
      "Retain me",
    );
    for (const checkout of [primary, task]) {
      expect(isIgnored(checkout, ".local/README.md")).toBe(true);
      expect(
        isIgnored(checkout, ".local/gh-00055-issue-example-task/20261018-1430_review/notes.md"),
      ).toBe(true);
    }
    expect(existsSync(join(task, ".local"))).toBe(false);
    expect(readFileSync(join(primary, ".gitignore"), "utf8")).toBe(originalIgnore);
    git(primary, "worktree", "remove", task);
    expect(
      readFileSync(
        join(directory, "gh-00055-issue-example-task", "20261018-1430_review", "notes.md"),
        "utf8",
      ),
    ).toBe("Retain me");
  });

  it("uses shared info/exclude without changing tracked files and preserves unrelated entries", () => {
    const { primary, task } = repository();
    const exclude = git(
      task,
      "rev-parse",
      "--path-format=absolute",
      "--git-path",
      "info/exclude",
    ).trim();
    writeFileSync(exclude, "# Personal exclusions\nother-output/\n");
    const directory = initializeLocalArtifacts(task, true);
    const initialized = readFileSync(exclude, "utf8");
    expect(initialized).toBe("# Personal exclusions\nother-output/\n/.local/\n");
    writeFileSync(join(directory, "README.md"), "My existing guidance\n");
    initializeLocalArtifacts(primary, true);
    expect(readFileSync(exclude, "utf8")).toBe(initialized);
    expect(readFileSync(join(directory, "README.md"), "utf8")).toBe("My existing guidance\n");
    expect(existsSync(join(primary, ".gitignore"))).toBe(false);
    for (const checkout of [primary, task]) {
      expect(isIgnored(checkout, ".local/README.md")).toBe(true);
      expect(isIgnored(checkout, ".local/arbitrary/nested/content.txt")).toBe(true);
      expect(isIgnored(checkout, "other-output/log.txt")).toBe(true);
      expect(git(checkout, "status", "--porcelain")).toBe("");
    }
  });

  it("adds a complete tracked rule and removes only duplicate exact rules defeated by an exception", () => {
    const { primary } = repository();
    initializeLocalArtifacts(primary);
    expect(readFileSync(join(primary, ".gitignore"), "utf8")).toBe("/.local/\n");
    writeFileSync(join(primary, ".gitignore"), "other-output/\n/.local/\n/.local/\n!.local/\n");
    initializeLocalArtifacts(primary);
    expect(readFileSync(join(primary, ".gitignore"), "utf8")).toBe(
      "other-output/\n!.local/\n/.local/\n",
    );
    expect(isIgnored(primary, ".local/README.md")).toBe(true);
    expect(isIgnored(primary, ".local/nested/report.md")).toBe(true);
    expect(isIgnored(primary, "other-output/log.txt")).toBe(true);
  });

  it("refuses tracked artifacts without untracking or creating output", () => {
    const { primary, task } = repository();
    mkdirSync(join(primary, ".local"));
    writeFileSync(join(primary, ".local", "published.md"), "Already tracked");
    git(primary, "add", ".local/published.md");
    expect(() => initializeLocalArtifacts(task, true)).toThrow(/tracked files/u);
    expect(git(primary, "ls-files", "--", ".local")).toBe(".local/published.md\n");
    expect(existsSync(join(primary, ".local", "README.md"))).toBe(false);
  });
});

it("pads issue IDs without truncating and creates portable title slugs", () => {
  expect(issueArtifactFolder(4, "Scaffold: Über cool / browser!")).toBe(
    "gh-00004-issue-scaffold-uber-cool-browser",
  );
  expect(issueArtifactFolder(123456, "Unicode 中文")).toBe("gh-123456-issue-unicode");
  expect(issueArtifactFolder(5, "中文")).toBe("gh-00005-issue-task");
  expect(() => issueArtifactFolder(-1, "Wrong")).toThrow("Invalid issue");
});

it("routes task evidence through Git metadata, preserves notes and survives worktree removal", () => {
  const { primary, task } = repository(true);
  expect(localArtifactPaths(task).directory).toBe(join(primary, ".local"));
  const directory = initializeTaskArtifacts(
    task,
    4,
    "Über browser",
    "https://example.test/issues/4",
    "feat/4-browser",
  );
  expect(directory).toBe(join(primary, ".local/gh-00004-issue-uber-browser"));
  expect(localArtifactPaths(task).directory).toBe(directory);
  expect(() => initializeTaskArtifacts(task, 5, "Other", "url", "branch")).toThrow("another issue");
  const path = join(directory, "README.md");
  const initial = readFileSync(path, "utf8");
  expect(initial).toContain("Status: in progress");
  writeFileSync(path, `${initial}\nMy wanted notes\n`);
  expect(initializeTaskArtifacts(task, 4, "Changed title", "url", "branch")).toBe(directory);
  const beforeMerge = readFileSync(path, "utf8");
  recordArtifactMerge(directory, 8, "a".repeat(40));
  recordArtifactMerge(directory, 8, "a".repeat(40));
  expect(readFileSync(path, "utf8")).toBe(
    `${beforeMerge}\nStatus: merged by PR #8 at ${"a".repeat(40)}\n`,
  );
  expect(browserEvidenceFile(task)).toBe(join(directory, "browser-evidence.json"));
  git(primary, "worktree", "remove", task);
  expect(readFileSync(path, "utf8")).toContain("My wanted notes");
  expect(localArtifactPaths(primary).directory).toBe(join(primary, ".local"));
});

it("rejects invalid task pointers and falls back to cwd only outside Git", () => {
  const { primary, task } = repository(true);
  const paths = localArtifactPaths(task);
  if (paths.taskFile === undefined) throw new Error("Missing metadata path");
  writeFileSync(paths.taskFile, "../../elsewhere");
  expect(() => localArtifactPaths(task)).toThrow("Invalid task artifact folder");
  const outside = join(primary, "..");
  expect(localArtifactPaths(outside).directory).toBe(join(outside, ".local"));
});

it("reads legacy and canonical evidence in time order without duplicating copied records", () => {
  const { primary, task } = repository(true);
  const directory = initializeTaskArtifacts(task, 9, "Browser", "url", "branch");
  const run: BrowserRun = {
    commit: "a".repeat(40),
    dirty: false,
    finishedAt: "2026-10-29T10:00:00Z",
    status: "passed",
    gpu: "off",
    renderer: null,
    rendererKind: null,
    display: null,
    remote: false,
    platform: "linux x64",
    projects: {},
  };
  mkdirSync(join(task, ".local"));
  writeFileSync(join(task, ".local/browser-evidence.json"), withRun([], run));
  const next = { ...run, finishedAt: "2026-10-29T11:00:00Z", status: "failed" };
  writeFileSync(join(directory, "browser-evidence.json"), withRun([run], next));
  expect(readBrowserRuns(task)).toEqual([run, next]);
  expect(existsSync(join(primary, ".local/browser-evidence.json"))).toBe(false);
});

it("reuses retained issue folders after metadata removal and refuses ambiguous folders", () => {
  const { primary, task } = repository(true);
  const original = initializeTaskArtifacts(task, 4, "Original", "url", "branch");
  const { taskFile } = localArtifactPaths(task);
  if (taskFile === undefined) throw new Error("Missing metadata path");
  rmSync(taskFile);
  expect(initializeTaskArtifacts(task, 4, "Renamed", "url", "branch")).toBe(original);
  rmSync(taskFile);
  mkdirSync(join(primary, ".local/gh-00004-issue-duplicate"));
  expect(() => initializeTaskArtifacts(task, 4, "Renamed", "url", "branch")).toThrow(
    "Multiple artifact folders",
  );
});
