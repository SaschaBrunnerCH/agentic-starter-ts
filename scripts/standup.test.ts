import { describe, expect, it } from "vitest";
import { standupReport } from "./standup.ts";

describe("standupReport", () => {
  it("lists work in progress, in review, blocked and next, from fixed data", () => {
    const report = standupReport({
      limit: 4,
      inProgress: [
        { reference: "#26", title: "Standup", worktree: "../repo-26-standup", blockers: [] },
        { reference: "#30", title: "Elsewhere", blockers: [] },
      ],
      inReview: [
        {
          reference: "#19",
          title: "GPU report",
          blockers: [],
          pullRequests: [{ number: 24, build: "success", base: "main", behindBy: 2, draft: false }],
        },
        { reference: "#21", title: "No PR yet", blockers: [], pullRequests: [] },
      ],
      blocked: [
        { reference: "#20", title: "WebGPU", blockers: ["#10"] },
        { reference: "#32", title: "Waits for hardware", blockers: [] },
      ],
      ready: [
        { reference: "#27", title: "Planning skill", priority: "P2", blockers: [] },
        { reference: "#31", title: "Waits", priority: "P1", blockers: ["#26"] },
      ],
    });
    expect(report).toEqual([
      "In progress: 2 of 4",
      "- #26 Standup · ../repo-26-standup",
      "- #30 Elsewhere · no worktree here",
      "",
      "In review: 2",
      "- #19 GPU report · #24 (build success, 2 behind main)",
      "- #21 No PR yet · no open pull request",
      "",
      "Blocked: 2",
      "- #20 WebGPU · by #10",
      "- #32 Waits for hardware · Status Blocked, no blocker issue",
      "",
      "Next Ready: 1 of 2",
      "- P2 #27 Planning skill",
    ]);
  });

  it("shows empty sections with their count", () => {
    expect(
      standupReport({ limit: 4, inProgress: [], inReview: [], blocked: [], ready: [] }),
    ).toEqual([
      "In progress: 0 of 4",
      "",
      "In review: 0",
      "",
      "Blocked: 0",
      "",
      "Next Ready: 0 of 0",
    ]);
  });

  it("marks a draft and a failed build", () => {
    const [, , , line] = standupReport({
      limit: 4,
      inProgress: [],
      inReview: [
        {
          reference: "#9",
          title: "X",
          blockers: [],
          pullRequests: [{ number: 14, build: "failure", base: "main", behindBy: 0, draft: true }],
        },
      ],
      blocked: [],
      ready: [],
    });
    expect(line).toBe("- #9 X · #14 (build failure, draft)");
  });
});

describe("pull request lines", () => {
  it("names the base the distance is counted against", () => {
    const lines = standupReport({
      limit: 4,
      inProgress: [],
      inReview: [
        {
          reference: "#20",
          title: "WebGPU",
          blockers: [],
          pullRequests: [
            { number: 28, build: "success", base: "feat/10-evidence", behindBy: 1, draft: false },
          ],
        },
      ],
      blocked: [],
      ready: [],
    });
    expect(lines).toContain("- #20 WebGPU · #28 (build success, 1 behind feat/10-evidence)");
  });
});
