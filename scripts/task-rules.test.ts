import { describe, expect, it } from "vitest";
import {
  authorizationComment,
  branchType,
  cleanupDecision,
  type CleanupFacts,
  irreplaceableIgnored,
  isApprovedHead,
  linkedIssues,
  readinessProblems,
  slug,
  taskNames,
  uncommitted,
  worktreeOfBranch,
  type PullRequestFacts,
} from "./task-rules.ts";

const ready: PullRequestFacts = {
  state: "OPEN",
  isDraft: false,
  title: "Show the route length",
  body: "## Summary\n\nIssue: Closes #12\n",
  author: "octocat",
  baseRefName: "main",
  defaultBranch: "main",
  behindBy: 0,
  build: "success",
  closingIssues: [12],
  commitMessages: ["Show the route length\n\nDetails."],
};

describe("slug", () => {
  it("keeps letters and digits and joins them with hyphens", () => {
    expect(slug("Show the route's length (km)!")).toBe("show-the-route-s-length-km");
  });

  it("drops the epic prefix, shortens without a trailing hyphen and never returns nothing", () => {
    expect(slug("Epic: First outcome")).toBe("first-outcome");
    expect(slug("abcd efgh ijkl", 9)).toBe("abcd-efgh");
    expect(slug("???")).toBe("task");
    expect(slug("Fix Zürich café ÄÖÜ")).toBe("fix-zurich-cafe-aou");
  });
});

describe("taskNames", () => {
  it("builds the branch and the sibling directory", () => {
    expect(taskNames("my-app", 42, "Fix the date parser", branchType(["bug", "area:app"]))).toEqual(
      { branch: "fix/42-fix-the-date-parser", directory: "my-app-42-fix-the-date-parser" },
    );
  });

  it("derives docs and feat from labels", () => {
    expect(branchType(["documentation"])).toBe("docs");
    expect(branchType(["enhancement"])).toBe("feat");
  });
});

describe("linkedIssues", () => {
  it("separates closing links from slices", () => {
    expect(linkedIssues("Closes #3, fixes #4. Part of #9.")).toEqual({
      closes: [3, 4],
      partOf: [9],
    });
  });

  it("accepts every closing keyword GitHub accepts", () => {
    expect(
      linkedIssues("close #1 closed #2 fix #3 fixed #4 resolve #5 resolves #6 Resolved: #7").closes,
    ).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it("does not read a keyword inside another word", () => {
    expect(linkedIssues("This prefix #8 discloses #9").closes).toEqual([]);
  });
});

describe("readinessProblems", () => {
  it("accepts a current, green, linked pull request", () => {
    expect(readinessProblems(ready)).toEqual([]);
  });

  it("rejects a branch that is a single commit behind", () => {
    expect(readinessProblems({ ...ready, behindBy: 1 })).toEqual([
      "its branch is 1 commit(s) behind the base",
    ]);
  });

  it("rejects a failed, pending or missing build", () => {
    expect(readinessProblems({ ...ready, build: "failure" })).toEqual([
      "PR build on its head commit is failure",
    ]);
    expect(readinessProblems({ ...ready, build: "pending" })).toEqual([
      "PR build on its head commit is pending",
    ]);
    expect(readinessProblems({ ...ready, build: "missing" })).toEqual([
      "its head commit has no PR build",
    ]);
  });

  it("rejects a pull request that names no issue, unless Dependabot wrote it", () => {
    const unlinked = { ...ready, body: "No link.", closingIssues: [] };
    expect(readinessProblems(unlinked)).toEqual([
      'its body names no issue ("Closes #n" or "Part of #n")',
    ]);
    expect(readinessProblems({ ...unlinked, author: "app/dependabot" })).toEqual([]);
  });

  it("accepts an issue linked through GitHub when the body uses another form", () => {
    expect(readinessProblems({ ...ready, body: "See the linked issue." })).toEqual([]);
  });

  it("rejects drafts, closed pull requests and a base that is not the default branch", () => {
    expect(
      readinessProblems({ ...ready, state: "MERGED", isDraft: true, baseRefName: "feat/1-x" }),
    ).toEqual([
      "it is merged",
      "it is a draft",
      "its base is feat/1-x, not main; retarget it first",
    ]);
  });

  it("rejects AI attribution in the body and in a commit message", () => {
    expect(readinessProblems({ ...ready, body: "Closes #1\n\nCo-authored-by: A <a@b.c>" })).toEqual(
      ['its text or a commit carries AI attribution: "Co-authored-by: A <a@b.c>"'],
    );
    expect(
      readinessProblems({ ...ready, commitMessages: ["Fix\n\nCo-Authored-By: Bot <b@c.d>"] }),
    ).toEqual(['its text or a commit carries AI attribution: "Co-Authored-By: Bot <b@c.d>"']);
  });
});

describe("authorization", () => {
  it("names the commit and the date in the record", () => {
    expect(authorizationComment("abc1234", "2026-10-13")).toBe(
      "Merged on the owner's authorization of 2026-10-13 for head commit abc1234, with PR build green on that commit and the branch current with main.",
    );
  });

  it("accepts the approved commit in full or abbreviated, and nothing else", () => {
    const head = "b0f2531ba6c2a06fb4a1b251ed75183ddd659a0d";
    expect(isApprovedHead(head, head)).toBe(true);
    expect(isApprovedHead("b0f2531", head)).toBe(true);
    expect(isApprovedHead("B0F2531", head)).toBe(true);
    expect(isApprovedHead("--admin", head)).toBe(false);
    expect(isApprovedHead("b0f253", head)).toBe(false);
    expect(isApprovedHead("0f2531ba", head)).toBe(false);
    expect(isApprovedHead("", head)).toBe(false);
  });
});

describe("worktreeOfBranch", () => {
  const porcelain = [
    "worktree /work/app\nHEAD 1111\nbranch refs/heads/main",
    "worktree /work/app-12-foo-bar\nHEAD 2222\nbranch refs/heads/feat/12-foo-bar",
    "worktree /work/app-12-foo\nHEAD 3333\nbranch refs/heads/feat/12-foo",
    "worktree /work/app-detached\nHEAD 4444\ndetached",
  ].join("\n\n");

  it("finds the worktree of exactly this branch", () => {
    expect(worktreeOfBranch(porcelain, "feat/12-foo")).toBe("/work/app-12-foo");
    expect(worktreeOfBranch(porcelain, "feat/12-foo-bar")).toBe("/work/app-12-foo-bar");
  });

  it("does not return the worktree of a branch that only starts with the name", () => {
    const withoutFoo = porcelain.replace(
      /\n\nworktree \/work\/app-12-foo\n[^]*?feat\/12-foo(?=\n\n)/u,
      "",
    );
    expect(worktreeOfBranch(withoutFoo, "feat/12-foo")).toBeUndefined();
  });
});

describe("worktree contents", () => {
  const status = [
    " M src/main.ts",
    "?? notes.txt",
    "!! node_modules/",
    "!! dist/",
    "!! .env",
    "!! evidence/run.log",
  ].join("\n");

  it("lists uncommitted and untracked files but not ignored ones", () => {
    expect(uncommitted(status)).toEqual([" M src/main.ts", "?? notes.txt"]);
  });

  it("lists ignored files that cannot be recreated", () => {
    expect(irreplaceableIgnored(status)).toEqual([".env", "evidence/run.log"]);
    expect(
      irreplaceableIgnored(
        "!! node_modules/\n!! .artifacts/tools/x\n!! coverage/\n!! test-results/\n!! playwright-report/",
      ),
    ).toEqual([]);
  });
});

describe("cleanupDecision", () => {
  const merged: CleanupFacts = {
    number: 7,
    state: "MERGED",
    isCrossRepository: false,
    baseRefName: "main",
    defaultBranch: "main",
    mergedHead: "a".repeat(40),
    branch: "feat/7-x",
    branchTip: "a".repeat(40),
    worktree: "/work/app-7-x",
    primaryCheckout: "/work/app",
    workingDirectory: "/work/app",
    worktreeStatus: "!! node_modules/\n",
    discardIgnored: false,
  };

  it("removes the worktree and branch of a merged task", () => {
    expect(cleanupDecision(merged)).toEqual({
      retained: [],
      removeWorktree: true,
      deleteBranch: true,
    });
  });

  it("removes only what exists", () => {
    expect(cleanupDecision({ ...merged, worktree: undefined, worktreeStatus: undefined })).toEqual({
      retained: [],
      removeWorktree: false,
      deleteBranch: true,
    });
    expect(
      cleanupDecision({
        ...merged,
        worktree: undefined,
        worktreeStatus: undefined,
        branchTip: undefined,
      }),
    ).toEqual({ retained: [], removeWorktree: false, deleteBranch: false });
  });

  it("refuses a pull request that is open, from a fork or merged into another base", () => {
    for (const [change, reason] of [
      [{ state: "OPEN" }, "#7 is open, not merged."],
      [{ isCrossRepository: true }, "#7 came from a fork"],
      [{ baseRefName: "feat/6-y" }, "#7 was merged into feat/6-y, not main"],
    ] as const) {
      const decision = cleanupDecision({ ...merged, ...change });
      expect(decision.refusal).toContain(reason);
      expect(decision.removeWorktree || decision.deleteBranch).toBe(false);
    }
  });

  it("keeps everything when something could be lost", () => {
    for (const [change, reason] of [
      [{ branchTip: "b".repeat(40) }, "holds commits outside the merged work"],
      [{ worktree: "/work/app" }, "it is the primary checkout"],
      [{ workingDirectory: "/work/app-7-x/src" }, "not from inside it"],
      [{ worktreeStatus: undefined }, "its status could not be read"],
      [{ worktreeStatus: " M src/main.ts\n" }, "uncommitted or untracked files"],
      [{ worktreeStatus: "?? notes.txt\n" }, "uncommitted or untracked files"],
      [{ worktreeStatus: "!! .env\n" }, "ignored files that cannot be recreated"],
    ] as const) {
      const decision = cleanupDecision({ ...merged, ...change });
      expect(decision.retained.join(), reason).toContain(reason);
      expect(decision.removeWorktree || decision.deleteBranch, reason).toBe(false);
    }
  });

  it("does not take a sibling directory with a longer name for the worktree", () => {
    expect(
      cleanupDecision({ ...merged, workingDirectory: "/work/app-7-x-other" }).removeWorktree,
    ).toBe(true);
  });

  it("discards irreplaceable ignored files only on request", () => {
    expect(
      cleanupDecision({ ...merged, worktreeStatus: "!! .env\n", discardIgnored: true }),
    ).toEqual({ retained: [], removeWorktree: true, deleteBranch: true });
  });
});
