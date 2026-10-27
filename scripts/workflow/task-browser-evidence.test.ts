import { afterEach, describe, expect, it, vi } from "vitest";
import { evidenceMarkdown, type BrowserRun } from "../browser/browser-evidence.ts";

const fixture = vi.hoisted(() => ({
  head: "a".repeat(40),
  evidence: "",
  comments: "",
  posted: vi.fn(),
}));
vi.mock("../shared/script-arguments.ts", () => ({ scriptArguments: () => ["ready", "123"] }));
vi.mock("node:child_process", () => ({
  spawnSync: () => ({ status: 0, stdout: "/fixture/.git", stderr: "" }),
}));
vi.mock("node:fs", async (original) => ({
  ...(await original<typeof import("node:fs")>()),
  existsSync: () => true,
  readFileSync: () => fixture.evidence,
}));
vi.mock("../shared/github.ts", () => ({
  root: "/fixture",
  prBuild: () => "success",
  ghJson: (args: string[]) => {
    if (args[0] === "repo") {
      return { nameWithOwner: "example/starter", defaultBranchRef: { name: "main" } };
    }
    if (args[0] === "issue") return { labels: [{ name: "documentation" }] };
    return {
      number: 123,
      url: "https://example.com/pr/123",
      title: "Correct browser evidence",
      body: "Closes #59",
      state: "OPEN",
      isDraft: false,
      author: { login: "owner" },
      headRefOid: fixture.head,
      headRefName: "fix/59",
      baseRefName: "main",
      isCrossRepository: false,
      closingIssuesReferences: [{ number: 59 }],
      commits: [],
    };
  },
  gh: (args: string[]) => {
    if (args[0] === "api") return "0";
    if (args[1] === "view") return fixture.comments;
    if (args[1] === "comment") fixture.posted(args);
    return "";
  },
}));

const originalExitCode = process.exitCode;
afterEach(() => {
  process.exitCode = originalExitCode;
  vi.restoreAllMocks();
});

function run(overrides: Partial<BrowserRun> = {}): BrowserRun {
  return {
    commit: fixture.head,
    dirty: false,
    finishedAt: "2026-10-18T12:00:00Z",
    status: "passed",
    gpu: "off",
    renderer: null,
    rendererKind: null,
    display: null,
    remote: false,
    platform: "linux x64",
    projects: { chromium: { passed: 3, failed: 0, skipped: 0, flaky: 0 } },
    ...overrides,
  };
}

async function ready(runs: BrowserRun[], comments: string) {
  vi.resetModules();
  fixture.evidence = JSON.stringify({ runs });
  fixture.comments = comments;
  fixture.posted.mockClear();
  const log = vi.spyOn(console, "log").mockImplementation(() => {});
  await import("./task.ts");
  expect(process.exitCode).toBe(0); // Browser acceptance remains review-only.
  return log;
}

describe("task ready browser evidence publication", () => {
  it("publishes the first recorded result", async () => {
    await ready([run()], "");
    expect(fixture.posted).toHaveBeenCalledExactlyOnceWith([
      "pr",
      "comment",
      "123",
      "--body",
      evidenceMarkdown(run()),
    ]);
  });

  it("does not publish the same recorded result twice", async () => {
    await ready(
      [run()],
      `${evidenceMarkdown(run())}\n\nThis result supersedes earlier browser evidence for this commit.`,
    );
    expect(fixture.posted).not.toHaveBeenCalled();
  });

  it("publishes a newer failure after a passing run on the same commit", async () => {
    const failed = run({
      finishedAt: "2026-10-18T13:00:00Z",
      status: "failed",
      projects: { firefox: { passed: 0, failed: 1, skipped: 0, flaky: 0 } },
    });
    const log = await ready([run(), failed], evidenceMarkdown(run()));
    expect(fixture.posted).toHaveBeenCalledExactlyOnceWith([
      "pr",
      "comment",
      "123",
      "--body",
      expect.stringContaining(evidenceMarkdown(failed)),
    ]);
    expect(log).toHaveBeenCalledWith(expect.stringContaining("failed"));
    expect(fixture.posted.mock.calls[0]?.[0]).toEqual([
      "pr",
      "comment",
      "123",
      "--body",
      expect.stringContaining("supersedes earlier browser evidence"),
    ]);
  });

  it("publishes changed engine coverage even with the same timestamp and status", async () => {
    const firefox = run({ projects: { firefox: { passed: 3, failed: 0, skipped: 0, flaky: 0 } } });
    await ready([run(), firefox], evidenceMarkdown(run()));
    expect(fixture.posted).toHaveBeenCalledExactlyOnceWith([
      "pr",
      "comment",
      "123",
      "--body",
      expect.stringContaining(evidenceMarkdown(firefox)),
    ]);
  });

  it("publishes when the existing comment has only the old commit marker", async () => {
    await ready([run()], `<!-- browser-evidence ${fixture.head} -->\nOlder evidence format`);
    expect(fixture.posted).toHaveBeenCalledOnce();
  });
});

it("publishes invalidated source evidence rather than retaining an older passing report", async () => {
  const failed = run({
    dirty: true,
    sourceStable: false,
    status: "failed",
    finishedAt: "2026-10-18T14:00:00Z",
  });
  await ready([run(), failed], evidenceMarkdown(run()));
  expect(fixture.posted).toHaveBeenCalledExactlyOnceWith([
    "pr",
    "comment",
    "123",
    "--body",
    expect.stringContaining("not current-commit acceptance"),
  ]);
});
