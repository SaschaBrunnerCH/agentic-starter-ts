// The decisions of `pnpm release`, kept apart from git and gh so they can be tested.

/** A version as in semantic versioning, without build metadata. */
export type Version = Readonly<{
  major: number;
  minor: number;
  patch: number;
  prerelease: readonly string[];
}>;

const pattern =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[A-Za-z-][\dA-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][\dA-Za-z-]*))*))?$/u;

/** The version of `1.2.3` or `1.2.3-rc.1`, a leading `v` allowed; undefined otherwise. */
export function parseVersion(text: string): Version | undefined {
  const match = pattern.exec(text.replace(/^v/u, ""));
  if (match === null) return undefined;
  const [, major = "", minor = "", patch = "", prerelease] = match;
  return {
    major: Number(major),
    minor: Number(minor),
    patch: Number(patch),
    prerelease: prerelease === undefined ? [] : prerelease.split("."),
  };
}

function compareIdentifiers(a: string, b: string): number {
  const numeric = /^\d+$/u;
  if (numeric.test(a) && numeric.test(b)) return Number(a) - Number(b);
  if (numeric.test(a)) return -1;
  if (numeric.test(b)) return 1;
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Negative when `a` precedes `b`, by the precedence rules of semantic versioning. */
export function compareVersions(a: Version, b: Version): number {
  const core = a.major - b.major || a.minor - b.minor || a.patch - b.patch;
  if (core !== 0) return core;
  if (a.prerelease.length === 0 || b.prerelease.length === 0) {
    return b.prerelease.length - a.prerelease.length;
  }
  for (let index = 0; index < Math.max(a.prerelease.length, b.prerelease.length); index += 1) {
    const left = a.prerelease[index];
    const right = b.prerelease[index];
    if (left === undefined) return -1;
    if (right === undefined) return 1;
    const order = compareIdentifiers(left, right);
    if (order !== 0) return order;
  }
  return 0;
}

export type ReleaseFacts = Readonly<{
  /** The version asked for, as typed. */
  requested: string;
  /** Existing tags that start with `v`. */
  tags: readonly string[];
  /** Uncommitted or untracked changes in the working tree. */
  uncommitted: boolean;
  /** Whether the checked-out commit is the head of origin/main. */
  atMainHead: boolean;
  /** The PR build of the pull request that produced the commit. */
  build: "success" | "failure" | "pending" | "missing";
}>;

/** Why the release may not be made; empty when it may. */
export function releaseProblems(facts: ReleaseFacts): string[] {
  const problems: string[] = [];
  const version = parseVersion(facts.requested);
  if (version === undefined) {
    problems.push(`"${facts.requested}" is not a version such as 1.2.0 or 1.2.0-rc.1`);
  } else {
    const latest = facts.tags
      .map(parseVersion)
      .filter((parsed) => parsed !== undefined)
      .toSorted(compareVersions)
      .at(-1);
    if (latest !== undefined && compareVersions(version, latest) <= 0) {
      problems.push(`the version must be above the latest release, ${format(latest)}`);
    }
  }
  if (facts.uncommitted) problems.push("the working tree has uncommitted changes");
  if (!facts.atMainHead) problems.push("the checked-out commit is not the head of origin/main");
  if (facts.build !== "success") {
    problems.push(`the PR build of the pull request that made this commit is ${facts.build}`);
  }
  return problems;
}

export function format(version: Version): string {
  const core = `${version.major}.${version.minor}.${version.patch}`;
  return version.prerelease.length === 0 ? core : `${core}-${version.prerelease.join(".")}`;
}
