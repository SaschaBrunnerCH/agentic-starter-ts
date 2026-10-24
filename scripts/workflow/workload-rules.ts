import { constants } from "node:os";
import { createHash } from "node:crypto";
import { basename, isAbsolute } from "node:path";
import * as json from "../shared/json-shape.ts";

const processShape = json.object({
  pid: json.number,
  ppid: json.number,
  pgid: json.number,
  birth: json.string,
  state: json.string,
});
export type ProcessIdentity = json.ShapeOf<typeof processShape>;
const ownerShape = json.object({
  protocol: json.number,
  run: json.string,
  label: json.string,
  cwd: json.string,
  boot: json.string,
  started: json.number,
  status: json.string,
  owner: processShape,
  groups: json.array(processShape),
  code: json.nullable(json.number),
});
export type WorkloadOwner = json.ShapeOf<typeof ownerShape>;

export function parseOwner(text: string): WorkloadOwner {
  try {
    const owner = json.parseJson(text, ownerShape, "workload ownership");
    const keys = [
      "protocol",
      "run",
      "label",
      "cwd",
      "boot",
      "started",
      "status",
      "owner",
      "groups",
      "code",
    ];
    if (
      Object.keys(owner).some((key) => !keys.includes(key)) ||
      owner.protocol !== 1 ||
      !owner.run ||
      !owner.label.trim() ||
      /[\r\n\0]/u.test(owner.label) ||
      owner.label.length > 120 ||
      !isAbsolute(owner.cwd) ||
      !/^linux:[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$|^darwin:\d+:\d+$/u.test(
        owner.boot,
      ) ||
      !Number.isFinite(owner.started) ||
      !["running", "finished"].includes(owner.status) ||
      (owner.code !== null &&
        (!Number.isInteger(owner.code) || owner.code < 0 || owner.code > 255)) ||
      [owner.owner, ...owner.groups].some(
        (row) =>
          Object.keys(row).some(
            (key) => !["pid", "ppid", "pgid", "birth", "state"].includes(key),
          ) ||
          !/^(?:linux:\d+|darwin:\w{3} \w{3} \d{1,2} \d{2}:\d{2}:\d{2} \d{4})$/u.test(row.birth) ||
          !Number.isInteger(row.pid) ||
          row.pid <= 1 ||
          !Number.isInteger(row.ppid) ||
          row.ppid < 0 ||
          !Number.isInteger(row.pgid) ||
          row.pgid <= 1 ||
          !row.birth ||
          !row.state,
      ) ||
      owner.groups.some((row) => row.pid !== row.pgid) ||
      new Set(owner.groups.map((row) => row.pid)).size !== owner.groups.length ||
      (owner.status === "finished" && (owner.groups.length !== 0 || owner.code === null)) ||
      (owner.status === "running" && owner.code !== null)
    )
      throw new Error("invalid");
    return owner;
  } catch {
    // Never echo invalid JSON: another writer may have put sensitive material there.
    throw new Error(
      "Invalid workload ownership metadata (possibly an incompatible protocol). Inspect its provenance and owned work; never delete the lock file.",
    );
  }
}

export function enabled(platform: string, ci: string | undefined): boolean {
  return (platform === "linux" || platform === "darwin") && ci !== "true" && ci !== "1";
}

export function parseRun(args: readonly string[]) {
  let label: string | undefined;
  let timeout = 300;
  let index = 0;
  while (index < args.length && args[index] !== "--") {
    const option = args[index++];
    const value = args[index++];
    if (option === "--label" && value?.trim() && !/[\r\n\0]/u.test(value) && value.length <= 120)
      label = value;
    else if (
      option === "--timeout" &&
      value !== undefined &&
      /^\d+(?:\.\d+)?$/u.test(value) &&
      Number.isFinite(Number(value))
    )
      timeout = Number(value);
    else
      throw new Error(
        "Use workload run [--label purpose] [--timeout seconds] -- command [arguments].",
      );
  }
  if (args[index] !== "--" || !args[index + 1]) throw new Error("A command must follow --.");
  const command = args.slice(index + 1);
  if (command.some((value) => value.includes("\0")))
    throw new Error("Command arguments cannot contain NUL bytes.");
  return { label: label ?? basename(command[0] ?? "").slice(0, 120), timeout, command };
}

export function linuxProcess(text: string): ProcessIdentity {
  const end = text.lastIndexOf(")");
  const pid = Number(text.slice(0, text.indexOf(" ")));
  const fields = text
    .slice(end + 2)
    .trim()
    .split(/\s+/u);
  const ppid = Number(fields[1]);
  const pgid = Number(fields[2]);
  const birth = fields[19];
  if (
    end < 0 ||
    !Number.isInteger(pid) ||
    pid < 1 ||
    !Number.isInteger(ppid) ||
    !Number.isInteger(pgid) ||
    !birth ||
    !/^\d+$/u.test(birth) ||
    !fields[0]
  )
    throw new Error("Cannot establish Linux process identity.");
  return { pid, ppid, pgid, birth: "linux:" + birth, state: fields[0] };
}

export function macProcesses(text: string): ProcessIdentity[] {
  return text
    .split("\n")
    .filter((line) => line.trim())
    .map((line) => {
      const match =
        /^\s*(\d+)\s+(\d+)\s+(\d+)\s+(\w{3}\s+\w{3}\s+\d{1,2}\s+\d{2}:\d{2}:\d{2}\s+\d{4})\s+(\S+)\s*$/u.exec(
          line,
        );
      if (!match) throw new Error("Cannot establish macOS process identity.");
      return {
        pid: Number(match[1]),
        ppid: Number(match[2]),
        pgid: Number(match[3]),
        birth: "darwin:" + match[4]?.replace(/\s+/gu, " "),
        state: match[5] ?? "",
      };
    });
}

export function macBoot(text: string): string {
  const match = /sec = (\d+), usec = (\d+)/u.exec(text);
  if (!match) throw new Error("Cannot establish macOS boot identity.");
  return "darwin:" + match[1] + ":" + match[2];
}

export const live = (row: ProcessIdentity) => !/^[ZX]/u.test(row.state);
export const same = (a: ProcessIdentity, b: ProcessIdentity) =>
  a.pid === b.pid && a.pgid === b.pgid && a.birth === b.birth && live(b);

export function descendant(
  pid: number,
  ancestor: number,
  rows: readonly ProcessIdentity[],
): boolean {
  const seen = new Set<number>();
  while (pid > 0 && !seen.has(pid)) {
    if (pid === ancestor) return true;
    seen.add(pid);
    const row = rows.find((entry) => entry.pid === pid && live(entry));
    if (!row) return false;
    pid = row.ppid;
  }
  return false;
}

export function survivors(owner: WorkloadOwner, boot: string, rows: readonly ProcessIdentity[]) {
  if (owner.boot !== boot || owner.status === "finished") return [];
  // A reused group id blocks conservatively too. Recovery never signals old records.
  return rows.filter(
    (row) =>
      live(row) &&
      (same(owner.owner, row) || owner.groups.some((group) => row.pgid === group.pgid)),
  );
}

export function exitCode(code: number | null, signal: NodeJS.Signals | null): number {
  return code ?? (signal ? 128 + constants.signals[signal] : 1);
}

export function cleanupProgress(
  groups: readonly ProcessIdentity[],
  rows: readonly ProcessIdentity[],
  unproved: boolean,
  expired: boolean,
) {
  const remaining = groups.filter((group) =>
    rows.some((row) => row.pgid === group.pgid && live(row)),
  );
  // An earlier uncertainty/deadline cannot retain a barrier after all live work is gone.
  return { groups: remaining, blocked: remaining.length > 0 && (unproved || expired) };
}

const perlLock =
  '$^F=1024; use Fcntl qw(:flock); use Time::HiRes qw(clock_gettime CLOCK_MONOTONIC sleep); my $path=shift; my $wait=shift; open(my $f,"+>>",$path) or die "Cannot open workload lock\\n"; my $end=clock_gettime(CLOCK_MONOTONIC)+$wait; while(!flock($f,LOCK_EX|LOCK_NB)){ exit 75 if clock_gettime(CLOCK_MONOTONIC)>=$end; sleep(0.05); } exec @ARGV; die "Cannot execute workload supervisor\\n";';

export function lockCommand(platform: string, file: string, timeout: number, worker: string) {
  const target = [process.execPath, worker];
  return platform === "darwin"
    ? { command: "perl", args: ["-e", perlLock, file, String(timeout), ...target] }
    : {
        command: "flock",
        args: [
          "--exclusive",
          "--no-fork",
          "--timeout",
          String(timeout),
          "--conflict-exit-code",
          "75",
          file,
          ...target,
        ],
      };
}

export function socketDirectory(directory: string, uid: number): string {
  return (
    "/tmp/agent-workload-" +
    uid +
    "-" +
    createHash("sha256").update(directory).digest("hex").slice(0, 32)
  );
}
