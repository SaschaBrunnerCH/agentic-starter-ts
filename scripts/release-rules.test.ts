import { describe, expect, it } from "vitest";
import {
  compareVersions,
  format,
  parseVersion,
  releaseProblems,
  type ReleaseFacts,
} from "./release-rules.ts";

const version = (text: string) => {
  const parsed = parseVersion(text);
  if (parsed === undefined) throw new Error(`not a version: ${text}`);
  return parsed;
};

describe("parseVersion", () => {
  it("reads versions with and without a v and a pre-release", () => {
    expect(format(version("v1.2.3"))).toBe("1.2.3");
    expect(format(version("1.0.0-rc.1"))).toBe("1.0.0-rc.1");
  });

  it("refuses what is not a version", () => {
    for (const text of ["1.2", "01.2.3", "1.2.3-", "1.2.3+build", "latest", "1.2.3-01"]) {
      expect(parseVersion(text)).toBeUndefined();
    }
  });
});

describe("compareVersions", () => {
  it("orders by semantic versioning precedence", () => {
    const ordered = [
      "1.0.0-alpha",
      "1.0.0-alpha.1",
      "1.0.0-alpha.beta",
      "1.0.0-beta",
      "1.0.0-beta.2",
      "1.0.0-beta.11",
      "1.0.0-rc.1",
      "1.0.0",
      "1.0.1",
      "1.1.0",
      "2.0.0",
    ];
    const shuffled = ordered.toReversed();
    expect(
      shuffled
        .map(version)
        .toSorted(compareVersions)
        .map((parsed) => format(parsed)),
    ).toEqual(ordered);
  });
});

const ok: ReleaseFacts = {
  requested: "0.2.0",
  tags: ["v0.1.0", "v0.1.1-rc.1", "not-a-version"],
  uncommitted: false,
  atMainHead: true,
  build: "success",
};

describe("releaseProblems", () => {
  it("allows a higher version of a clean, built head of main", () => {
    expect(releaseProblems(ok)).toEqual([]);
    expect(releaseProblems({ ...ok, tags: [] })).toEqual([]);
  });

  it("refuses each unmet condition", () => {
    expect(releaseProblems({ ...ok, requested: "0.1.1-rc.1" })).toEqual([
      "the version must be above the latest release, 0.1.1-rc.1",
    ]);
    expect(releaseProblems({ ...ok, requested: "next" })).toEqual([
      '"next" is not a version such as 1.2.0 or 1.2.0-rc.1',
    ]);
    expect(releaseProblems({ ...ok, uncommitted: true })).toEqual([
      "the working tree has uncommitted changes",
    ]);
    expect(releaseProblems({ ...ok, atMainHead: false })).toEqual([
      "the checked-out commit is not the head of origin/main",
    ]);
    expect(releaseProblems({ ...ok, build: "missing" })).toEqual([
      "the PR build of the pull request that made this commit is missing",
    ]);
  });
});
