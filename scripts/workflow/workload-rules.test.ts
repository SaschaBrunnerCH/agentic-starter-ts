import { describe, expect, it } from "vitest";
import {
  cleanupProgress,
  descendant,
  enabled,
  exitCode,
  linuxProcess,
  live,
  lockCommand,
  macBoot,
  macProcesses,
  parseOwner,
  parseRun,
  same,
  survivors,
  socketDirectory,
  type WorkloadOwner,
  type ProcessIdentity,
} from "./workload-rules.ts";

const row: ProcessIdentity = { pid: 100, ppid: 50, pgid: 100, birth: "linux:10", state: "S" };
const owner: WorkloadOwner = {
  protocol: 1,
  run: "run",
  label: "gate",
  cwd: "/checkout",
  boot: "linux:00000000-0000-0000-0000-000000000001",
  started: 1,
  status: "running",
  owner: { ...row, pid: 50, pgid: 40 },
  groups: [row],
  code: null,
};

it("finishes cleanup once the last live group is gone despite earlier uncertainty or deadline", () => {
  for (const unproved of [false, true]) {
    for (const expired of [false, true]) {
      expect(cleanupProgress([row], [], unproved, expired)).toEqual({ groups: [], blocked: false });
      expect(cleanupProgress([row], [{ ...row, state: "Z" }], unproved, expired)).toEqual({
        groups: [],
        blocked: false,
      });
      expect(cleanupProgress([row], [row], unproved, expired)).toEqual({
        groups: [row],
        blocked: unproved || expired,
      });
    }
  }
  expect(cleanupProgress([row], [{ ...row, birth: "linux:999" }], true, false).blocked).toBe(true);
});

it("coordinates only local Unix development, with explicit CI detection", () => {
  for (const os of ["linux", "darwin"]) {
    for (const ci of [undefined, "", "false", "0", "yes"]) expect(enabled(os, ci)).toBe(true);
    for (const ci of ["true", "1"]) expect(enabled(os, ci)).toBe(false);
  }
  for (const os of ["win32", "freebsd"]) expect(enabled(os, undefined)).toBe(false);
});

it("preserves arguments and bounds waits without shell parsing", () => {
  expect(
    parseRun([
      "--label",
      "unit tests",
      "--timeout",
      "0.25",
      "--",
      "/bin/tool",
      "",
      "a b",
      "$(ignored)",
      "--",
    ]),
  ).toEqual({
    label: "unit tests",
    timeout: 0.25,
    command: ["/bin/tool", "", "a b", "$(ignored)", "--"],
  });
  expect(parseRun(["--", "/bin/tool"])).toEqual({
    label: "tool",
    timeout: 300,
    command: ["/bin/tool"],
  });
  expect(parseRun(["--timeout", "0", "--", "tool"]).timeout).toBe(0);
  for (const args of [
    [],
    ["tool"],
    ["--"],
    ["--", ""],
    ["--", "tool", "\0"],
    ["--label", "", "--", "x"],
    ["--label", "a\nb", "--", "x"],
    ["--label", "x".repeat(121), "--", "x"],
    ["--timeout", "-1", "--", "x"],
    ["--timeout", "Infinity", "--", "x"],
    ["--timeout", "9".repeat(400), "--", "x"],
    ["--unknown", "x"],
    ["--label"],
  ])
    expect(() => parseRun(args)).toThrow();
});

describe("private ownership protocol", () => {
  it("accepts active and finished records", () => {
    expect(parseOwner(JSON.stringify(owner))).toEqual(owner);
    expect(
      parseOwner(JSON.stringify({ ...owner, status: "finished", groups: [], code: 75 })).code,
    ).toBe(75);
  });
  it("fails closed without echoing invalid input", () => {
    const variants = [
      { ...owner, protocol: 2 },
      { ...owner, run: "" },
      { ...owner, label: "" },
      { ...owner, label: " " },
      { ...owner, label: "bad\nlabel" },
      { ...owner, label: "x".repeat(121) },
      { ...owner, cwd: "relative" },
      { ...owner, boot: "corrupt" },
      { ...owner, owner: { ...owner.owner, argument: "do-not-echo" } },
      { ...owner, groups: [{ ...row, argument: "do-not-echo" }] },
      { ...owner, groups: [{ ...row, birth: "corrupt" }] },
      { ...owner, cwd: "" },
      { ...owner, boot: "" },
      { ...owner, started: null },
      { ...owner, status: "unknown" },
      { ...owner, code: -1 },
      { ...owner, code: 256 },
      { ...owner, code: 0.5 },
      { ...owner, code: 0 },
      { ...owner, status: "finished" },
      { ...owner, status: "finished", groups: [], code: null },
      { ...owner, groups: [{ ...row, pid: 1 }] },
      { ...owner, groups: [{ ...row, pid: 1.1 }] },
      { ...owner, groups: [{ ...row, ppid: -1 }] },
      { ...owner, groups: [{ ...row, ppid: 1.1 }] },
      { ...owner, groups: [{ ...row, pgid: 1 }] },
      { ...owner, groups: [{ ...row, pgid: 2.1 }] },
      { ...owner, groups: [{ ...row, birth: "" }] },
      { ...owner, groups: [{ ...row, state: "" }] },
      { ...owner, groups: [{ ...row, pgid: 101 }] },
      { ...owner, groups: [row, row] },
      { ...owner, secret: "do-not-echo" },
      {},
    ];
    for (const value of ["do-not-echo", ...variants.map((variant) => JSON.stringify(variant))]) {
      expect(() => parseOwner(value)).toThrow("Invalid workload ownership metadata");
      try {
        parseOwner(value);
      } catch (error) {
        expect(String(error)).not.toContain("do-not-echo");
      }
    }
  });
});

it("parses Linux process identity with spaces and parentheses in comm", () => {
  const fields = ["S", "50", "100", ...Array.from({ length: 16 }, () => "0"), "12345"];
  expect(linuxProcess("100 (a (strange) name) " + fields.join(" "))).toEqual({
    ...row,
    birth: "linux:12345",
  });
  for (const text of [
    "garbage",
    "100 no closing bracket",
    "0 (x) " + fields.join(" "),
    "100 (x) S nonsense",
    "100 (x) " + [...fields.slice(0, 19), "bad"].join(" "),
  ])
    expect(() => linuxProcess(text)).toThrow();
});

it("parses macOS process and boot snapshots without command arguments", () => {
  expect(macProcesses(" 100 50 100 Sat Oct 24 09:01:02 2026 S+\n")).toEqual([
    { ...row, state: "S+", birth: "darwin:Sat Oct 24 09:01:02 2026" },
  ]);
  expect(macProcesses("")).toEqual([]);
  expect(() => macProcesses("100 bad fields")).toThrow();
  expect(macBoot("{ sec = 123, usec = 456 } Sat")).toBe("darwin:123:456");
  expect(() => macBoot("bad")).toThrow();
});

it("checks ancestry, zombies and identity reuse conservatively", () => {
  const rows = [{ ...row, pid: 50, ppid: 1 }, row, { ...row, pid: 101, ppid: 100 }];
  expect(descendant(101, 50, rows)).toBe(true);
  expect(descendant(50, 50, rows)).toBe(true);
  expect(descendant(999, 50, rows)).toBe(false);
  expect(descendant(101, 999, rows)).toBe(false);
  expect(descendant(101, 50, [{ ...row, pid: 101, ppid: 101 }])).toBe(false);
  expect(descendant(100, 50, [{ ...row, state: "Z" }])).toBe(false);
  expect(live({ ...row, state: "X" })).toBe(false);
  expect(same(row, row)).toBe(true);
  expect(same(row, { ...row, birth: "reused" })).toBe(false);
  expect(same(row, { ...row, pid: 101 })).toBe(false);
  expect(same(row, { ...row, pgid: 101 })).toBe(false);
  expect(same(row, { ...row, state: "Z" })).toBe(false);
  expect(
    survivors(owner, owner.boot, [row, { ...row, birth: "reused" }, { ...row, state: "Z" }]),
  ).toHaveLength(2);
  expect(survivors(owner, owner.boot, [owner.owner])).toEqual([owner.owner]);
  expect(survivors(owner, "new-boot", [row])).toEqual([]);
  expect(survivors({ ...owner, status: "finished" }, owner.boot, [row])).toEqual([]);
});

it("preserves command status and selects OS lock drivers", () => {
  expect(exitCode(75, null)).toBe(75);
  expect(exitCode(null, "SIGKILL")).toBe(137);
  expect(exitCode(null, null)).toBe(1);
  expect(lockCommand("linux", "/state/lock", 0, "/worker").args).toEqual([
    "--exclusive",
    "--no-fork",
    "--timeout",
    "0",
    "--conflict-exit-code",
    "75",
    "/state/lock",
    process.execPath,
    "/worker",
  ]);
  expect(lockCommand("darwin", "/state/lock", 0.1, "/worker").command).toBe("perl");
});

it("keeps Unix control sockets short and distinct even with long state paths", () => {
  expect(socketDirectory("/" + "x".repeat(300), 1000).length).toBeLessThan(80);
  expect(socketDirectory("/a", 1000)).not.toBe(socketDirectory("/b", 1000));
  expect(socketDirectory("/a", 1000)).not.toBe(socketDirectory("/a", 1001));
});
