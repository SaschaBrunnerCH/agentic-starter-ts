import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { evidenceMarkdown, type BrowserRun } from "../browser/browser-evidence.ts";

const fixture = vi.hoisted(() => ({
  head: "a".repeat(40),
  evidence: "",
  comments: "",
  posted: vi.fn(),
  merged: vi.fn(),
  args: ["ready", "123"] as string[],
  files: ["src/App.tsx"] as string[],
  status: "",
  state: "OPEN",
  diffFailed: false,
  commands: [] as string[][],
}));
vi.mock("../shared/local-artifact-paths.ts", () => ({
  localArtifactPaths: () => ({
    directory: "/fixture/.local/gh-00059-issue-fixture",
    primaryLocal: "/fixture/.local",
  }),
}));
vi.mock("../shared/script-arguments.ts", () => ({ scriptArguments: () => fixture.args }));
vi.mock("node:child_process", () => ({
  spawnSync: (_command: string, args: string[]) => {
    fixture.commands.push(args);
    return {
      status: args[0] === "diff" && fixture.diffFailed ? 1 : 0,
      stdout: args.includes("--git-common-dir")
        ? "/fixture/.git"
        : args[0] === "rev-parse"
          ? fixture.head
          : args[0] === "diff"
            ? fixture.files.join("\0") + "\0"
            : args[0] === "status"
              ? fixture.status
              : "",
      stderr: "",
    };
  },
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
    if (args.includes("comments")) return { comments: [] };
    return {
      number: 123,
      url: "https://example.com/pr/123",
      title: "Correct browser evidence",
      body: "Closes #59",
      state: fixture.state,
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
    if (args[0] === "pr" && args[1] === "merge") fixture.merged(args);
    if (args.includes(".state")) return "MERGED";
    if (args[1] === "view") return fixture.comments;
    if (args[1] === "comment") fixture.posted(args);
    return "";
  },
}));

const originalExitCode = process.exitCode;
beforeEach(() => {
  fixture.head = "a".repeat(40);
  fixture.args = ["ready", "123"];
  fixture.files = ["src/App.tsx"];
  fixture.status = "";
  fixture.state = "OPEN";
  fixture.diffFailed = false;
  fixture.commands = [];
  fixture.merged.mockClear();
  process.exitCode = originalExitCode;
});
afterEach(() => {
  process.exitCode = originalExitCode;
  vi.restoreAllMocks();
});

function run(overrides: Partial<BrowserRun> = {}): BrowserRun {
  return {
    commit: fixture.head,
    dirty: false,
    sourceStable: true,
    buildCommit: fixture.head,
    complete: true,
    finishedAt: "2026-10-18T12:00:00Z",
    status: "passed",
    gpu: "required",
    renderer: "NVIDIA GPU",
    rendererKind: "hardware",
    display: "headless",
    remote: false,
    platform: "linux x64",
    projects: { chromium: { passed: 3, failed: 0, skipped: 0, flaky: 0 } },
    ...overrides,
  };
}

async function ready(runs: BrowserRun[], comments: string, expectedExit = 0) {
  vi.resetModules();
  fixture.evidence = JSON.stringify({ runs });
  fixture.comments = comments;
  fixture.posted.mockClear();
  const log = vi.spyOn(console, "log").mockImplementation(() => {});
  await import("./task.ts");
  expect(process.exitCode).toBe(expectedExit);
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
    const log = await ready([run(), failed], evidenceMarkdown(run()), 1);
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
    await ready([run(), firefox], evidenceMarkdown(run()), 1);
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

const acceptedRun = () =>
  run({
    sourceStable: true,
    buildCommit: fixture.head,
    complete: true,
    gpu: "required",
    renderer: "NVIDIA GPU",
    rendererKind: "hardware",
    display: "headless",
  });

describe("task ready and merge enforce fresh browser eligibility", () => {
  it("exempts documentation without reading or requiring browser records", async () => {
    fixture.files = ["README.md"];
    const log = await ready([], "");
    expect(log).toHaveBeenCalledWith(expect.stringContaining("exempt"));
    expect(fixture.posted).not.toHaveBeenCalled();
  });
  it("requires evidence for application changes and does not mark the issue In review", async () => {
    fixture.files = ["README.md", "src/App.tsx"];
    const log = await ready([], "", 1);
    expect(log).toHaveBeenCalledWith(expect.stringContaining("Browser acceptance required"));
    expect(fixture.commands.some((args) => args.includes("In review"))).toBe(false);
  });

  it("reads the entire diff, with deleted/renamed paths preserved", async () => {
    fixture.files = [
      ...Array.from({ length: 1000 }, (_, index) => `engineering/note-${index}.md`),
      "src/deleted.tsx",
    ];
    await ready([], "", 1);
    expect(fixture.commands).toContainEqual([
      "diff",
      "--name-only",
      "--no-renames",
      "-z",
      `origin/main...${fixture.head}`,
    ]);
  });

  it("accepts a complete passing run and posts its evidence", async () => {
    fixture.files = ["src/App.tsx"];
    await ready([acceptedRun()], "");
    expect(fixture.posted).toHaveBeenCalledOnce();
  });

  it.each(["missing", "failed", "dirty", "incomplete", "wrong target"])(
    "merge rechecks %s evidence after a successful ready call",
    async (kind) => {
      fixture.files = ["src/App.tsx"];
      const passed = acceptedRun();
      await ready([passed], "");
      fixture.args = ["merge", "123", "--authorized-by-owner", "--head", fixture.head];
      const bad =
        kind === "failed"
          ? { status: "failed" }
          : kind === "dirty"
            ? { dirty: true }
            : kind === "incomplete"
              ? { complete: false }
              : { target: "https://example.test/" };
      await ready(kind === "missing" ? [] : [passed, { ...passed, ...bad }], "", 1);
      expect(fixture.merged).not.toHaveBeenCalled();
    },
  );

  it("rechecks the approved head rather than relying on earlier readiness", async () => {
    fixture.files = ["src/App.tsx"];
    const passed = acceptedRun();
    await ready([passed], "");
    fixture.args = ["merge", "123", "--authorized-by-owner", "--head", fixture.head];
    fixture.head = "b".repeat(40);
    await ready([passed], "", 1);
    expect(fixture.merged).not.toHaveBeenCalled();
  });

  it("allows an eligible merge and does not require browser evidence for documentation", async () => {
    fixture.args = ["merge", "123", "--authorized-by-owner", "--head", fixture.head];
    fixture.files = ["src/App.tsx"];
    await ready([acceptedRun()], "");
    expect(fixture.merged).toHaveBeenCalledOnce();
    fixture.files = ["README.md"];
    fixture.merged.mockClear();
    await ready([], "");
    expect(fixture.merged).toHaveBeenCalledOnce();
  });

  it("fails closed if the full diff cannot be read", async () => {
    fixture.diffFailed = true;
    await ready([acceptedRun()], "", 1);
    expect(fixture.merged).not.toHaveBeenCalled();
  });

  it("refuses dirty checkouts even with a clean recorded run", async () => {
    fixture.files = ["src/App.tsx"];
    fixture.status = " M src/App.tsx";
    await ready([acceptedRun()], "", 1);
  });
});

it("publishes invalidated source evidence rather than retaining an older passing report", async () => {
  const failed = run({
    dirty: true,
    sourceStable: false,
    status: "failed",
    finishedAt: "2026-10-18T14:00:00Z",
  });
  await ready([run(), failed], evidenceMarkdown(run()), 1);
  expect(fixture.posted).toHaveBeenCalledExactlyOnceWith([
    "pr",
    "comment",
    "123",
    "--body",
    expect.stringContaining("not current-commit acceptance"),
  ]);
});
