import { describe, expect, it } from "vitest";
import { pushPlan, pushedObjects } from "./push-rules.ts";

const head = "a".repeat(40);
const other = "b".repeat(40);
const zero = "0".repeat(40);

const branch = (commit: string, published = false) => ({
  remoteRef: "refs/heads/x",
  commit,
  published,
});
const tag = (commit: string, published: boolean) => ({
  remoteRef: "refs/tags/v1.0.0",
  commit,
  published,
});

describe("pushedObjects", () => {
  it("reads the object and the remote ref, whatever the local ref is", () => {
    expect(
      pushedObjects(
        [
          `refs/heads/x ${head} refs/heads/x ${zero}`,
          `${other} ${other} refs/heads/topic ${zero}`,
          `HEAD ${head} refs/heads/y ${zero}`,
        ].join("\n"),
      ),
    ).toEqual([
      { object: head, remoteRef: "refs/heads/x" },
      { object: other, remoteRef: "refs/heads/topic" },
      { object: head, remoteRef: "refs/heads/y" },
    ]);
  });

  it("leaves out deletions and empty lines", () => {
    expect(pushedObjects(`(delete) ${zero} refs/heads/x ${other}\n\n`)).toEqual([]);
  });
});

describe("pushPlan", () => {
  it("checks a clean tree that pushes the checked-out commit", () => {
    expect(pushPlan("", head, [branch(head)])).toEqual({ needsChecks: true, problems: [] });
  });

  it("refuses uncommitted and untracked files", () => {
    const { problems } = pushPlan(" M src/main.ts\n?? notes.txt\n", head, [branch(head)]);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("2 uncommitted or untracked file(s)");
  });

  it("refuses a branch that would get another commit, published or not", () => {
    expect(pushPlan("", head, [branch(other)]).problems[0]).toContain(
      "refs/heads/x would get bbbbbbbb",
    );
    expect(pushPlan("", head, [branch(other, true)]).problems).toHaveLength(1);
  });

  it("refuses a tag on an unpublished commit that is not checked out", () => {
    expect(pushPlan("", head, [tag(other, false)]).problems[0]).toContain(
      "refs/tags/v1.0.0 would get bbbbbbbb",
    );
  });

  it("checks a tag on the unpublished checked-out commit", () => {
    expect(pushPlan("", head, [tag(head, false)])).toEqual({ needsChecks: true, problems: [] });
  });

  it("needs nothing for tags of published commits or for deletions only", () => {
    expect(pushPlan(" M a\n", head, [tag(other, true)])).toEqual({
      needsChecks: false,
      problems: [],
    });
    expect(pushPlan(" M a\n", head, [])).toEqual({ needsChecks: false, problems: [] });
  });

  it("checks a push of a branch and a published tag on another commit", () => {
    expect(pushPlan("", head, [branch(head), tag(other, true)])).toEqual({
      needsChecks: true,
      problems: [],
    });
  });
});
