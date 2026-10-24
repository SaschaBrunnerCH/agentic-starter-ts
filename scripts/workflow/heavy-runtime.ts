// OS/process ownership for the heavy command. Pure protocol decisions live in heavy-rules.
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
  closeSync,
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  rmdirSync,
  writeFileSync,
} from "node:fs";
import { createConnection, createServer, Socket } from "node:net";
import { homedir } from "node:os";
import { isAbsolute, join } from "node:path";
import { Duplex } from "node:stream";
import * as json from "../shared/json-shape.ts";
import {
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
  type HeavyOwner,
  type ProcessIdentity,
} from "./heavy-rules.ts";

export const heavyEntry = join(import.meta.dirname, "heavy.ts");
const worker = join(import.meta.dirname, "heavy-supervisor.ts");
const groupWorker = join(import.meta.dirname, "heavy-group.ts");
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const runShape = json.object({ label: json.string, command: json.array(json.string) });
const requestShape = json.object({ kind: json.string, run: json.string, pid: json.number });
const replyShape = json.object({ ok: json.boolean, error: json.optional(json.string) });

function paths() {
  const directory =
    process.env.HEAVY_JOB_STATE_DIR ?? join(homedir(), ".local/state/agent-heavy-job");
  if (!isAbsolute(directory)) throw new Error("HEAVY_JOB_STATE_DIR must be absolute.");
  const uid = process.getuid?.();
  if (uid === undefined) throw new Error("Heavy coordination requires a Unix user identity.");
  const socketDir = socketDirectory(directory, uid);
  const socket = join(socketDir, "control.sock");
  return {
    directory,
    socketDir,
    socket,
    lock: join(directory, "lock"),
    owner: join(directory, "owner.json"),
  };
}

function privatePath(path: string, directory: boolean) {
  const stat = lstatSync(path);
  if (
    stat.isSymbolicLink() ||
    stat.uid !== process.getuid?.() ||
    (stat.mode & 0o077) !== 0 ||
    (directory ? !stat.isDirectory() : !stat.isFile())
  )
    throw new Error(
      "Heavy state must be private, owned by this user and free of symlinks: " + path,
    );
  return stat;
}

function prepare() {
  const state = paths();
  mkdirSync(state.directory, { recursive: true, mode: 0o700 });
  privatePath(state.directory, true);
  mkdirSync(state.socketDir, { recursive: true, mode: 0o700 });
  privatePath(state.socketDir, true);
  try {
    closeSync(openSync(state.lock, "wx", 0o600));
  } catch (error) {
    if (!existsSync(state.lock)) throw error;
  }
  const stat = privatePath(state.lock, false);
  return { ...state, inode: stat.dev + ":" + stat.ino };
}

function ownerAt(path: string): HeavyOwner | undefined {
  try {
    privatePath(path, false);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return undefined;
    throw error;
  }
  return parseOwner(readFileSync(path, "utf8"));
}

function save(path: string, owner: HeavyOwner) {
  const temporary = path + "." + randomUUID();
  try {
    writeFileSync(temporary, JSON.stringify(owner) + "\n", { flag: "wx", mode: 0o600 });
    renameSync(temporary, path);
  } finally {
    rmSync(temporary, { force: true });
  }
}

function checked(command: string, args: string[]): string {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    timeout: 3000,
    env: { ...process.env, LC_ALL: "C" },
  });
  if (result.error || result.status !== 0)
    throw new Error(
      "Heavy coordination requires working " +
        command +
        "; install/repair this OS prerequisite before retrying.",
    );
  return result.stdout.trim();
}

function bootIdentity(): string {
  if (process.platform === "darwin") return macBoot(checked("sysctl", ["-n", "kern.boottime"]));
  const boot = readFileSync("/proc/sys/kernel/random/boot_id", "utf8").trim();
  if (!/^[\da-f-]{36}$/u.test(boot)) throw new Error("Cannot establish Linux boot identity.");
  return "linux:" + boot;
}

function processes(): ProcessIdentity[] {
  if (process.platform === "darwin")
    return macProcesses(checked("ps", ["-axo", "pid=,ppid=,pgid=,lstart=,stat="]));
  return readdirSync("/proc")
    .filter((name) => /^\d+$/u.test(name))
    .flatMap((name) => {
      try {
        return [linuxProcess(readFileSync("/proc/" + name + "/stat", "utf8"))];
      } catch (error) {
        // A process may exit between enumeration and reading. Permission/corruption fails closed.
        if (!existsSync("/proc/" + name)) return [];
        throw error;
      }
    });
}

function identity(pid: number, rows = processes()): ProcessIdentity {
  const row = rows.find((candidate) => candidate.pid === pid && live(candidate));
  if (!row) throw new Error("Cannot establish live heavy process identity: " + pid);
  return row;
}

function describe(owner: HeavyOwner | undefined): string {
  return owner
    ? owner.label +
        " in " +
        owner.cwd +
        " (supervisor " +
        owner.owner.pid +
        ", " +
        owner.status +
        ")"
    : "ownership not yet published";
}

function packet(stream: Duplex): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let data = "";
    stream.on("error", reject);
    stream.on("data", (chunk: Buffer) => {
      data += chunk.toString();
      if (data.length > 256 * 1024) {
        reject(new Error("Heavy control message exceeds its bound."));
        stream.destroy();
      } else if (data.includes("\n")) {
        try {
          const parsed: unknown = JSON.parse(data.slice(0, data.indexOf("\n")));
          resolve(parsed);
        } catch {
          reject(new Error("Invalid heavy control message."));
        }
      }
    });
    stream.on("end", () => {
      if (!data.includes("\n"))
        reject(new Error("Heavy control channel closed before acknowledgement."));
    });
  });
}

async function request(kind: string, pid = process.pid) {
  const state = paths();
  const socket = createConnection(state.socket);
  socket.setTimeout(3000, () =>
    socket.destroy(new Error("Heavy supervisor did not acknowledge ownership.")),
  );
  const response = packet(socket);
  socket.on("connect", () =>
    socket.write(JSON.stringify({ kind, run: process.env.HEAVY_JOB_RUN, pid }) + "\n"),
  );
  try {
    const value = await response;
    const reply = json.parseJson(JSON.stringify(value), replyShape, "heavy acknowledgement");
    if (!reply.ok) throw new Error(reply.error ?? "Heavy ownership was refused.");
  } finally {
    socket.destroy();
  }
}

function waitChild(child: ChildProcess): Promise<number> {
  return new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => resolve(exitCode(code, signal)));
  });
}

async function ordinary(command: string[]) {
  const child = spawn(command[0] ?? "", command.slice(1), { stdio: "inherit" });
  const cancel = () => child.kill("SIGTERM");
  process.on("SIGINT", cancel);
  process.on("SIGTERM", cancel);
  try {
    return await waitChild(child);
  } finally {
    process.off("SIGINT", cancel);
    process.off("SIGTERM", cancel);
  }
}

export async function cli(args: string[]): Promise<number> {
  const [mode, ...rest] = args;
  if (mode === undefined || mode === "help" || mode === "--help") {
    console.log(
      "Usage: pnpm heavy run [--label purpose] [--timeout seconds] -- command [arguments]\n       pnpm heavy status\nLocal WSL2/macOS/Linux coordination; CI=true/1 and other OSes run normally.",
    );
    return 0;
  }
  if (mode === "status") {
    if (rest.length) throw new Error("heavy status takes no arguments.");
    if (!enabled(process.platform, process.env.CI)) {
      console.log("Heavy coordination is bypassed in this environment.");
      return 0;
    }
    const state = paths();
    if (existsSync(state.directory)) privatePath(state.directory, true);
    const owner = ownerAt(state.owner);
    console.log(describe(owner));
    if (owner)
      console.log(
        "Recorded surviving group members: " +
          survivors(owner, bootIdentity(), processes()).length +
          ". Advisory only; this is not a machine-load report.",
      );
    return 0;
  }
  if (mode !== "run") throw new Error("Use heavy run, heavy status or heavy help.");
  const options = parseRun(rest);
  if (!enabled(process.platform, process.env.CI)) return ordinary(options.command);
  const state = prepare();
  const previous = ownerAt(state.owner);
  if (process.env.HEAVY_JOB_RUN !== undefined) {
    const rows = processes();
    if (
      !previous ||
      previous.status !== "running" ||
      previous.run !== process.env.HEAVY_JOB_RUN ||
      previous.boot !== bootIdentity() ||
      !same(previous.owner, identity(previous.owner.pid, rows)) ||
      !descendant(process.pid, previous.owner.pid, rows)
    )
      throw new Error(
        "Inherited heavy reservation is stale or unrelated; refusing to bypass ownership.",
      );
    return runGroup(options.command);
  }
  if (process.platform === "darwin")
    checked("perl", [
      "-MFcntl",
      "-MTime::HiRes=clock_gettime,CLOCK_MONOTONIC",
      "-e",
      "clock_gettime(CLOCK_MONOTONIC); exit 0",
    ]);
  else checked("flock", ["--version"]);
  if (previous?.status === "running")
    console.error("Waiting for heavy slot: " + describe(previous));
  const launcher = lockCommand(process.platform, state.lock, options.timeout, worker);
  const child = spawn(launcher.command, launcher.args, {
    stdio: ["inherit", "inherit", "inherit", "pipe"],
    env: { ...process.env, HEAVY_JOB_STATE_DIR: state.directory },
  });
  const channel = child.stdio[3];
  if (!(channel instanceof Duplex)) throw new Error("Cannot establish heavy supervisor channel.");
  let acquired = false;
  let cancelled = false;
  channel.on("data", () => {
    acquired = true;
  });
  channel.on("error", () => {
    /* Exit status below reports a closed waiter/worker. */
  });
  channel.write(JSON.stringify({ label: options.label, command: options.command }) + "\n");
  const notice = setInterval(() => {
    if (acquired) return;
    try {
      console.error("Waiting for heavy slot: " + describe(ownerAt(state.owner)));
    } catch (error) {
      console.error(error instanceof Error ? error.message : "Invalid heavy state.");
      child.kill("SIGTERM");
    }
  }, 10000);
  const cancel = () => {
    cancelled = true;
    child.kill("SIGTERM");
  };
  process.on("SIGINT", cancel);
  process.on("SIGTERM", cancel);
  try {
    const code = await waitChild(child);
    if (!acquired && code === 75)
      console.error(
        "Timed out waiting for heavy slot: " +
          describe(ownerAt(state.owner)) +
          "; no command started.",
      );
    return cancelled ? 143 : code;
  } finally {
    clearInterval(notice);
    process.off("SIGINT", cancel);
    process.off("SIGTERM", cancel);
    channel.destroy();
  }
}

async function runGroup(command: string[]) {
  const child = spawn(process.execPath, [groupWorker], {
    detached: true,
    stdio: ["inherit", "inherit", "inherit", "ipc"],
  });
  child.send({ command });
  const cancel = () => child.kill("SIGTERM");
  process.on("SIGINT", cancel);
  process.on("SIGTERM", cancel);
  try {
    return await waitChild(child);
  } finally {
    process.off("SIGINT", cancel);
    process.off("SIGTERM", cancel);
  }
}

export async function groupMain(): Promise<number> {
  const message: unknown = await new Promise((resolve, reject) => {
    process.once("message", resolve);
    process.once("disconnect", () =>
      reject(new Error("Heavy frontend exited before registration.")),
    );
  });
  const command = json.parseJson(
    JSON.stringify(message),
    json.object({ command: json.array(json.string) }),
    "heavy group",
  ).command;
  await request("register");
  const child = spawn(command[0] ?? "", command.slice(1), { stdio: "inherit" });
  let cancelling = false;
  let escalation: ReturnType<typeof setTimeout> | undefined;
  const cancel = () => {
    if (cancelling) return;
    cancelling = true;
    process.kill(-process.pid, "SIGTERM");
    escalation = setTimeout(() => process.kill(-process.pid, "SIGKILL"), 2000);
  };
  process.on("SIGINT", cancel);
  process.on("SIGTERM", cancel);
  const code = await waitChild(child);
  // Keep the group leader alive until owned foreground children have gone.
  while (
    processes().some((row) => row.pgid === process.pid && row.pid !== process.pid && live(row))
  )
    await sleep(100);
  await request("done");
  if (escalation) clearTimeout(escalation);
  process.off("SIGINT", cancel);
  process.off("SIGTERM", cancel);
  if (process.connected) process.disconnect();
  return cancelling ? 143 : code;
}

export async function supervisorMain(): Promise<number> {
  const channel = new Socket({ fd: 3 });
  const incoming = json.parseJson(JSON.stringify(await packet(channel)), runShape, "heavy launch");
  const state = prepare();
  const boot = bootIdentity();
  const old = ownerAt(state.owner);
  if (old && survivors(old, boot, processes()).length)
    throw new Error(
      "Heavy recovery blocked by recorded surviving work: " +
        describe(old) +
        ". Inspect heavy status; never delete the lock file or guess which process to kill.",
    );
  let owner: HeavyOwner = {
    protocol: 1,
    run: randomUUID(),
    label: incoming.label,
    cwd: process.cwd(),
    boot,
    started: Date.now(),
    status: "running",
    owner: identity(process.pid),
    groups: [],
    code: null,
  };
  const unchangedLock = () => {
    const stat = privatePath(state.lock, false);
    if (stat.dev + ":" + stat.ino !== state.inode)
      throw new Error("Heavy lock inode changed; cleanup cannot be proved.");
  };
  let cancelling = false;
  const server = createServer((socket) => {
    socket.setTimeout(3000, () => socket.destroy());
    void packet(socket).then(
      (value) => {
        try {
          unchangedLock();
          const message = json.parseJson(JSON.stringify(value), requestShape, "heavy request");
          const rows = processes();
          const row = identity(message.pid, rows);
          if (message.run !== owner.run) throw new Error("Heavy run identity mismatch.");
          if (message.kind === "register") {
            if (cancelling) throw new Error("Heavy reservation is being cancelled.");
            if (
              row.pid !== row.pgid ||
              !descendant(row.pid, process.pid, rows) ||
              owner.groups.some((group) => group.pid === row.pid)
            )
              throw new Error("Heavy group is unrelated or already registered.");
            owner = { ...owner, groups: [...owner.groups, row] };
          } else if (message.kind === "done") {
            const registered = owner.groups.find((group) => same(group, row));
            if (
              !registered ||
              rows.some((entry) => entry.pgid === row.pgid && entry.pid !== row.pid && live(entry))
            )
              throw new Error("Heavy group cleanup is unproved.");
            owner = { ...owner, groups: owner.groups.filter((group) => group.pid !== row.pid) };
          } else throw new Error("Unknown heavy ownership request.");
          save(state.owner, owner);
          socket.end(JSON.stringify({ ok: true }) + "\n");
        } catch (error) {
          socket.end(
            JSON.stringify({
              ok: false,
              error: error instanceof Error ? error.message : "Heavy ownership refused.",
            }) + "\n",
          );
        }
      },
      () => socket.destroy(),
    );
  });
  if (existsSync(state.socket)) {
    const oldSocket = lstatSync(state.socket);
    if (!oldSocket.isSocket() || oldSocket.uid !== process.getuid?.())
      throw new Error("Unexpected heavy control file; inspect it without deleting it.");
    rmSync(state.socket);
  }
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(state.socket, resolve);
  });
  chmodSync(state.socket, 0o600);
  save(state.owner, owner);
  channel.write("ready\n");
  process.env.HEAVY_JOB_RUN = owner.run;
  process.env.HEAVY_JOB_STATE_DIR = state.directory;
  let unproved = false;
  let escalation: ReturnType<typeof setTimeout> | undefined;
  const signalGroups = (signal: NodeJS.Signals) => {
    const rows = processes();
    for (const group of owner.groups) {
      const row = rows.find(
        (entry) => same(group, entry) && descendant(entry.pid, process.pid, rows),
      );
      if (!row) {
        if (rows.some((entry) => entry.pgid === group.pgid && live(entry))) unproved = true;
        continue;
      }
      try {
        process.kill(signal === "SIGKILL" ? -group.pgid : group.pid, signal);
      } catch (error) {
        if (processes().some((entry) => same(group, entry))) throw error;
      }
    }
  };
  const cancel = () => {
    if (cancelling) return;
    cancelling = true;
    signalGroups("SIGTERM");
    escalation = setTimeout(() => signalGroups("SIGKILL"), 2500);
  };
  process.on("SIGINT", cancel);
  process.on("SIGTERM", cancel);
  try {
    const code = await runGroup(incoming.command);
    const deadline = cancelling ? performance.now() + 4000 : Infinity;
    while (owner.groups.length) {
      unchangedLock();
      const rows = processes();
      owner = {
        ...owner,
        groups: owner.groups.filter((group) =>
          rows.some((row) => row.pgid === group.pgid && live(row)),
        ),
      };
      save(state.owner, owner);
      if (performance.now() > deadline || unproved)
        throw new Error(
          "Heavy cleanup unproved; ownership barrier retained. Inspect heavy status.",
        );
      if (owner.groups.length) await sleep(100);
    }
    unchangedLock();
    owner = { ...owner, status: "finished", code: cancelling ? 143 : code };
    save(state.owner, owner);
    return owner.code ?? 1;
  } finally {
    if (escalation) clearTimeout(escalation);
    process.off("SIGINT", cancel);
    process.off("SIGTERM", cancel);
    server.close();
    rmSync(state.socket, { force: true });
    rmdirSync(state.socketDir);
    channel.end();
  }
}
