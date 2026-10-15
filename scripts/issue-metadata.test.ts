import { describe, expect, it } from "vitest";
import {
  bodyProblems,
  metadataProblems,
  startBlockers,
  type IssueFacts,
} from "./issue-metadata.ts";

const complete: IssueFacts = {
  labels: ["enhancement", "area:app", "ready-for-agent"],
  ancestors: [["epic", "area:app"]],
  status: "Ready",
  priority: "P1",
  openBlockers: 0,
};

describe("metadataProblems", () => {
  it("accepts a complete Ready issue", () => {
    expect(metadataProblems(complete)).toEqual([]);
  });

  it("requires a priority outside Backlog and Done, except for an epic", () => {
    expect(metadataProblems({ ...complete, priority: undefined })).toEqual([
      "Ready without a Priority",
    ]);
    expect(metadataProblems({ ...complete, status: "Backlog", priority: undefined })).toEqual([]);
    expect(
      metadataProblems({
        ...complete,
        labels: ["epic", "area:app"],
        ancestors: [],
        status: "In progress",
        priority: undefined,
      }),
    ).toEqual([]);
    expect(startBlockers({ ...complete, priority: undefined }, 0)).toEqual([
      "it has no Priority; set one with pnpm issue status",
    ]);
  });

  it("accepts a root epic in Backlog", () => {
    expect(
      metadataProblems({
        ...complete,
        labels: ["epic", "area:app"],
        ancestors: [],
        status: "Backlog",
      }),
    ).toEqual([]);
  });

  it("reports each missing piece", () => {
    expect(
      metadataProblems({
        labels: ["needs-triage"],
        ancestors: [],
        status: undefined,
        priority: undefined,
        openBlockers: 0,
      }),
    ).toEqual([
      "no work-type label",
      "no area:* label",
      "still carries needs-triage",
      "no parent issue",
      "not in the Project, or without a Status",
    ]);
  });

  it("rejects a parent chain that never reaches an epic", () => {
    expect(metadataProblems({ ...complete, ancestors: [["enhancement"]] })).toEqual([
      "no ancestor is labelled epic",
    ]);
  });

  it("rejects Ready without a readiness label or with an open blocker", () => {
    expect(metadataProblems({ ...complete, labels: ["bug", "area:app"], openBlockers: 1 })).toEqual(
      ["Ready without a readiness label", "Ready with an open blocker"],
    );
  });
});

describe("startBlockers", () => {
  it("lets an unblocked issue start below the limit", () => {
    expect(startBlockers(complete, 3)).toEqual([]);
  });

  it("refuses a fifth issue but not one already In progress", () => {
    expect(startBlockers(complete, 4)).toEqual(["4 issues are already In progress (limit 4)"]);
    expect(startBlockers({ ...complete, status: "In progress" }, 4)).toEqual([]);
  });

  it("refuses epics, pending decisions and open blockers", () => {
    expect(
      startBlockers(
        { ...complete, labels: ["epic", "decision-needed", "area:app"], openBlockers: 2 },
        0,
      ),
    ).toEqual([
      "it is an epic; work on one of its children",
      "it waits for the owner's decision",
      "it has 2 open blocker(s)",
    ]);
  });
});

describe("rules for epics and triage", () => {
  it("never accepts an epic as Ready or with a readiness label", () => {
    expect(
      metadataProblems({
        labels: ["epic", "area:app", "ready-for-agent"],
        ancestors: [],
        status: "Ready",
        priority: undefined,
        openBlockers: 0,
      }),
    ).toEqual(["an epic is never Ready", "an epic carries no readiness label"]);
  });

  it("does not let an untriaged issue start", () => {
    for (const label of ["needs-triage", "needs-info"]) {
      expect(startBlockers({ ...complete, labels: [...complete.labels, label] }, 0)).toContain(
        "it is not triaged",
      );
    }
  });
});

describe("bodyProblems", () => {
  const task = ["enhancement", "area:app"];

  it("accepts a Done when section with a checklist item", () => {
    const body = "## Problem\n\nX.\n\n## Done when\n\n- [ ] A test shows Y.\n";
    expect(bodyProblems(body, task)).toEqual([]);
  });

  it("accepts the bold, quoted form of the getting-started example and checked items", () => {
    const body = "> **Done when**\n>\n> - [x] `?name=Ada` shows the name.\n";
    expect(bodyProblems(body, task)).toEqual([]);
  });

  it("refuses a body without the section", () => {
    expect(bodyProblems("## Problem\n\nX.\n", task)).toEqual(['no "Done when" section']);
  });

  it("refuses a section without a checklist item", () => {
    const body = "## Done when\n\nIt works.\n";
    expect(bodyProblems(body, task)).toEqual([
      'the "Done when" section has no checklist item ("- [ ] …")',
    ]);
  });

  it("refuses the issue template's unfilled placeholder", () => {
    const body =
      "## Done when\n\n- [ ] <!-- Observable acceptance criterion, with its verification method. -->\n";
    expect(bodyProblems(body, task)).toHaveLength(1);
  });

  it("refuses a placeholder comment over several lines", () => {
    const body = "## Done when\n\n- [ ] <!--\n  Observable acceptance criterion\n-->\n";
    expect(bodyProblems(body, task)).toHaveLength(1);
  });

  it("does not count items of a later section", () => {
    const body = "## Done when\n\nSoon.\n\n## Notes\n\n- [ ] Something else.\n";
    expect(bodyProblems(body, task)).toHaveLength(1);
  });

  it("asks nothing of an epic", () => {
    expect(bodyProblems("An epic.", ["epic", "area:app"])).toEqual([]);
  });
});
