import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { initializeLocalArtifacts } from "./local-artifacts.ts";

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
  const task = join(parent, "task");
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
    expect(readme).toContain("gh-issue-0055-");
    expect(readme).toContain("gh-pr-0056-");
    expect(readme).toContain("UTC");
    expect(readme).toContain("sessions/20261018-1430_");
    mkdirSync(join(directory, "gh-issue-0055-local-artifacts", "20261018-1430_review"), {
      recursive: true,
    });
    writeFileSync(
      join(directory, "gh-issue-0055-local-artifacts", "20261018-1430_review", "notes.md"),
      "Retain me",
    );
    for (const checkout of [primary, task]) {
      expect(isIgnored(checkout, ".local/README.md")).toBe(true);
      expect(
        isIgnored(checkout, ".local/gh-issue-0055-local-artifacts/20261018-1430_review/notes.md"),
      ).toBe(true);
    }
    expect(existsSync(join(task, ".local"))).toBe(false);
    expect(readFileSync(join(primary, ".gitignore"), "utf8")).toBe(originalIgnore);
    git(primary, "worktree", "remove", task);
    expect(
      readFileSync(
        join(directory, "gh-issue-0055-local-artifacts", "20261018-1430_review", "notes.md"),
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
