import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import {
  linuxProcess,
  macProcesses,
  parseOwner,
  same,
  lockCommand,
  socketDirectory,
  type HeavyOwner,
  type ProcessIdentity,
} from "./heavy-rules.ts";

const quote = (text: string) => "'" + text.replaceAll("'", "'\\''") + "'";
const entry = resolve(import.meta.dirname, "heavy.ts");
const roots: string[] = [];
const children: ChildProcess[] = [];
const records: HeavyOwner[] = [];
const environment = () =>
  Object.fromEntries(
    Object.entries(process.env).filter(
      ([key]) => !key.startsWith("HEAVY_JOB_") && !key.startsWith("GIT_"),
    ),
  );
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "heavy-fixture-"));
  roots.push(root);
  const state = join(root, "state");
  const a = join(root, "a");
  const b = join(root, "b");
  mkdirSync(a);
  mkdirSync(b);
  return { root, state, a, b, marker: join(root, "marker"), events: join(root, "events") };
}
type Fixture = ReturnType<typeof fixture>;
const ownerOf = (f: Fixture) => {
  const owner = parseOwner(readFileSync(join(f.state, "owner.json"), "utf8"));
  records.push(owner);
  return owner;
};
async function until(check: () => boolean, timeout = 5000) {
  const deadline = Date.now() + timeout;
  while (!check()) {
    if (Date.now() > deadline)
      throw new Error("Bounded heavy fixture did not reach its expected state.");
    await new Promise((resolveWait) => setTimeout(resolveWait, 30));
  }
}
function start(
  f: Fixture,
  command: string[],
  options: {
    cwd?: string;
    timeout?: string;
    label?: string;
    input?: string;
    env?: NodeJS.ProcessEnv;
    mode?: string[];
  } = {},
) {
  const child = spawn(
    process.execPath,
    [
      entry,
      ...(options.mode ?? [
        "run",
        "--label",
        options.label ?? "fixture",
        "--timeout",
        options.timeout ?? "3",
        "--",
        ...command,
      ]),
    ],
    {
      cwd: options.cwd ?? f.a,
      env: { ...environment(), CI: "", HEAVY_JOB_STATE_DIR: f.state, ...options.env },
      stdio: ["pipe", "pipe", "pipe"],
    },
  );
  children.push(child);
  child.stdin.end(options.input ?? "");
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (data: Buffer) => {
    stdout += data.toString();
  });
  child.stderr.on("data", (data: Buffer) => {
    stderr += data.toString();
  });
  const done = new Promise<{
    code: number | null;
    signal: NodeJS.Signals | null;
    stdout: string;
    stderr: string;
  }>((resolveDone, reject) => {
    child.once("error", reject);
    child.once("close", (code, signal) => resolveDone({ code, signal, stdout, stderr }));
  });
  // exit observes frontend death immediately; close waits for inherited output
  // descriptors held by surviving supervised work and would hide the crash window.
  const exited = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>(
    (resolveExit) => {
      child.once("exit", (code, signal) => resolveExit({ code, signal }));
    },
  );
  return { child, done, exited, stderr: () => stderr };
}
const node = (source: string, ...args: string[]) => [process.execPath, "-e", source, ...args];
function current(pid: number): ProcessIdentity | undefined {
  try {
    if (process.platform === "linux")
      return linuxProcess(readFileSync("/proc/" + pid + "/stat", "utf8"));
    return macProcesses(
      spawnSync("ps", ["-p", String(pid), "-o", "pid=,ppid=,pgid=,lstart=,stat="], {
        encoding: "utf8",
        env: { ...process.env, LC_ALL: "C" },
      }).stdout,
    )[0];
  } catch {
    return undefined;
  }
}
function signalOwned(row: ProcessIdentity, group = false) {
  const actual = current(row.pid);
  if (actual && same(row, actual)) process.kill(group ? -row.pgid : row.pid, "SIGKILL");
}
afterEach(async () => {
  for (const root of roots) {
    try {
      records.push(parseOwner(readFileSync(join(root, "state/owner.json"), "utf8")));
    } catch {
      /* Invalid-state fixtures have no running job. */
    }
  }
  for (const child of children)
    if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
  for (const owner of records) {
    signalOwned(owner.owner);
    for (const group of owner.groups) signalOwned(group, true);
  }
  await new Promise((resolveWait) => setTimeout(resolveWait, 80));
  for (const root of roots.splice(0)) {
    const uid = process.getuid?.();
    if (uid !== undefined)
      rmSync(socketDirectory(join(root, "state"), uid), { recursive: true, force: true });
    rmSync(root, { recursive: true, force: true });
  }
  children.length = 0;
  records.length = 0;
});

describe.skipIf(process.platform !== "linux" && process.platform !== "darwin")(
  "real heavy-job boundaries",
  () => {
    it(
      "serializes different directories and names the owner while waiting",
      { timeout: 15000 },
      async () => {
        const f = fixture();
        const first = start(
          f,
          node(
            "const fs=require('node:fs');fs.writeFileSync(process.argv[1],'busy');setTimeout(()=>fs.unlinkSync(process.argv[1]),600)",
            f.marker,
          ),
          { label: "first suite" },
        );
        await until(() => existsSync(f.marker));
        const inode = statSync(join(f.state, "lock")).ino;
        ownerOf(f);
        const second = start(
          f,
          node("process.exitCode=require('node:fs').existsSync(process.argv[1])?99:0", f.marker),
          { cwd: f.b },
        );
        expect((await first.done).code).toBe(0);
        const result = await second.done;
        expect(result.code, result.stderr).toBe(0);
        expect(result.stderr).toContain("first suite");
        expect(result.stderr).toContain(f.a);
        expect(statSync(join(f.state, "lock")).ino).toBe(inode);
        expect(ownerOf(f).status).toBe("finished");
        expect(statSync(f.state).mode & 0o077).toBe(0);
        expect(statSync(join(f.state, "owner.json")).mode & 0o077).toBe(0);
      },
    );

    it("preserves stdin, arguments, cwd and exit 75 exactly once", { timeout: 10000 }, async () => {
      const f = fixture();
      const program =
        "const fs=require('node:fs');fs.appendFileSync(process.argv[1],'once');let data='';process.stdin.on('data',x=>data+=x);process.stdin.on('end',()=>{console.log(JSON.stringify({args:process.argv.slice(2),cwd:process.cwd(),data}));process.exitCode=75})";
      const result = await start(f, node(program, f.marker, "", "a b", "$(ignored); *"), {
        input: "input text",
      }).done;
      expect(result.code, result.stderr).toBe(75);
      expect(JSON.parse(result.stdout)).toEqual({
        args: ["", "a b", "$(ignored); *"],
        cwd: f.a,
        data: "input text",
      });
      expect(readFileSync(f.marker, "utf8")).toBe("once");
      expect(readFileSync(join(f.state, "owner.json"), "utf8")).not.toContain("$(ignored)");
    });

    it(
      "times out or cancels a waiter without starting it or stopping its owner",
      { timeout: 15000 },
      async () => {
        const f = fixture();
        const first = start(
          f,
          node(
            "require('node:fs').writeFileSync(process.argv[1],'ready');setTimeout(()=>{},5000)",
            f.marker,
          ),
        );
        await until(() => existsSync(f.marker));
        const held = ownerOf(f);
        const never = join(f.root, "never");
        const command = node("require('node:fs').writeFileSync(process.argv[1],'wrong')", never);
        expect((await start(f, command, { timeout: "0" }).done).code).toBe(75);
        const waiter = start(f, command);
        await until(() => waiter.stderr().includes("Waiting for heavy slot:"));
        waiter.child.kill("SIGTERM");
        expect((await waiter.done).code).toBe(143);
        expect(existsSync(never)).toBe(false);
        expect(ownerOf(f).run).toBe(held.run);
        expect(first.child.exitCode).toBe(null);
        first.child.kill("SIGTERM");
        expect((await first.done).code).toBe(143);
      },
    );

    it(
      "holds one reservation across a real pnpm gate/test/build nesting",
      { timeout: 20000 },
      async () => {
        const f = fixture();
        const launch = quote(process.execPath) + " " + quote(entry) + " run --label nested -- ";
        const stage = join(f.a, "stage.mjs");
        writeFileSync(
          stage,
          "import fs from 'node:fs';const [file,label]=process.argv.slice(2);fs.appendFileSync(file,label+'\\n');setTimeout(()=>fs.appendFileSync(file,label+'-end\\n'),250);",
        );
        const gate = join(f.a, "gate.mjs");
        writeFileSync(
          gate,
          "import {spawnSync} from 'node:child_process';for(const name of ['test','build']){const r=spawnSync('pnpm',[name],{stdio:'inherit'});if(r.status!==0)process.exit(r.status??1)}",
        );
        writeFileSync(
          join(f.a, "package.json"),
          JSON.stringify({
            scripts: {
              "check:push": launch + quote(process.execPath) + " " + quote(gate),
              test:
                launch +
                quote(process.execPath) +
                " " +
                quote(stage) +
                " " +
                quote(f.events) +
                " test",
              build:
                launch +
                quote(process.execPath) +
                " " +
                quote(stage) +
                " " +
                quote(f.events) +
                " build",
            },
          }),
        );
        const first = start(f, ["pnpm", "check:push"]);
        await until(() => existsSync(f.events));
        expect(ownerOf(f).groups.length).toBeGreaterThanOrEqual(3);
        const second = start(
          f,
          node("require('node:fs').appendFileSync(process.argv[1],'other\\n')", f.events),
        );
        const result = await first.done;
        expect(result.code, result.stderr).toBe(0);
        expect((await second.done).code).toBe(0);
        expect(readFileSync(f.events, "utf8").trim().split("\n")).toEqual([
          "test",
          "test-end",
          "build",
          "build-end",
          "other",
        ]);
      },
    );

    it(
      "retains live foreground children after their initial command exits",
      { timeout: 10000 },
      async () => {
        const f = fixture();
        const first = start(
          f,
          node(
            "const {spawn}=require('node:child_process');spawn(process.execPath,['-e','setTimeout(()=>require(\"node:fs\").writeFileSync(process.argv[1],\"done\"),650)',process.argv[1]],{stdio:'ignore'}).unref()",
            f.marker,
          ),
        );
        await until(() => existsSync(join(f.state, "owner.json")));
        await until(() => ownerOf(f).groups.length === 1);
        const second = start(
          f,
          node("process.exitCode=require('node:fs').existsSync(process.argv[1])?0:99", f.marker),
        );
        expect((await first.done).code).toBe(0);
        expect((await second.done).code).toBe(0);
      },
    );

    it(
      "keeps the slot after frontend SIGKILL and preserves command SIGKILL results",
      { timeout: 15000 },
      async () => {
        const f = fixture();
        const first = start(
          f,
          node(
            "require('node:fs').writeFileSync(process.argv[1],'ready');setTimeout(()=>{},900)",
            f.marker,
          ),
        );
        await until(() => existsSync(f.marker));
        ownerOf(f);
        first.child.kill("SIGKILL");
        expect((await first.exited).signal).toBe("SIGKILL");
        const blocked = await start(f, node("process.exitCode=99"), { timeout: "0" }).done;
        expect(blocked.code).toBe(75);
        await until(() => ownerOf(f).status === "finished");
        const killed = await start(f, node("process.kill(process.pid,'SIGKILL')")).done;
        expect(killed.code, killed.stderr).toBe(137);
        expect((await start(f, node("process.exitCode=0")).done).code).toBe(0);
      },
    );

    it(
      "blocks survivors after supervisor SIGKILL and recovers without replacing the lock",
      { timeout: 15000 },
      async () => {
        const f = fixture();
        const first = start(
          f,
          node(
            "require('node:fs').writeFileSync(process.argv[1],'ready');setTimeout(()=>{},900)",
            f.marker,
          ),
        );
        await until(() => existsSync(f.marker));
        const held = ownerOf(f);
        const inode = statSync(join(f.state, "lock")).ino;
        signalOwned(held.owner);
        expect((await first.exited).code).toBe(137);
        const blocked = await start(f, node("process.exitCode=99")).done;
        expect(blocked.code).toBe(1);
        expect(blocked.stderr).toContain("recovery blocked");
        await until(() =>
          held.groups.every((group) => !current(group.pid) || current(group.pid)?.state === "Z"),
        );
        expect((await start(f, node("process.exitCode=0")).done).code).toBe(0);
        expect(statSync(join(f.state, "lock")).ino).toBe(inode);
      },
    );

    it(
      "escalates cancellation for a command ignoring graceful termination",
      { timeout: 15000 },
      async () => {
        const f = fixture();
        const first = start(
          f,
          node(
            "process.on('SIGTERM',()=>{});require('node:fs').writeFileSync(process.argv[1],'ready');setTimeout(()=>{},8000)",
            f.marker,
          ),
        );
        await until(() => existsSync(f.marker));
        ownerOf(f);
        const began = Date.now();
        first.child.kill("SIGTERM");
        const result = await first.done;
        expect(result.code, result.stderr).toBe(143);
        expect(Date.now() - began).toBeLessThan(6500);
        expect(ownerOf(f).groups).toEqual([]);
        expect((await start(f, node("process.exitCode=0")).done).code).toBe(0);
      },
    );

    it(
      "rejects corrupt metadata and unrelated inherited flags, while status stays read-only",
      { timeout: 10000 },
      async () => {
        const f = fixture();
        const status = await start(f, [], { mode: ["status"] }).done;
        expect(status.code).toBe(0);
        expect(existsSync(f.state)).toBe(false);
        expect(
          (
            await start(f, node("process.exitCode=99"), { env: { HEAVY_JOB_RUN: "unrelated" } })
              .done
          ).code,
        ).toBe(1);
        writeFileSync(join(f.state, "owner.json"), "invalid-do-not-echo", { mode: 0o600 });
        const result = await start(f, node("process.exitCode=99")).done;
        expect(result.code).toBe(1);
        expect(result.stderr).toContain("Invalid heavy-job ownership");
        expect(result.stderr).not.toContain("invalid-do-not-echo");
      },
    );

    it(
      "does not signal reused identities and distinguishes a prior boot",
      { timeout: 15000 },
      async () => {
        const f = fixture();
        expect((await start(f, node("process.exitCode=0")).done).code).toBe(0);
        const completed = ownerOf(f);
        const unrelated = spawn(process.execPath, ["-e", "setTimeout(()=>{},7000)"], {
          detached: true,
          stdio: "ignore",
        });
        children.push(unrelated);
        await until(() => unrelated.pid !== undefined && current(unrelated.pid) !== undefined);
        if (unrelated.pid === undefined) throw new Error("Fixture has no pid.");
        const row = current(unrelated.pid);
        if (!row) throw new Error("Fixture identity disappeared.");
        const stale = {
          ...completed,
          status: "running",
          code: null,
          groups: [
            {
              ...row,
              birth: process.platform === "linux" ? "linux:0" : "darwin:Mon Jan 1 00:00:00 2001",
            },
          ],
        };
        writeFileSync(join(f.state, "owner.json"), JSON.stringify(stale));
        const blocked = await start(f, node("process.exitCode=99")).done;
        expect(blocked.code).toBe(1);
        expect(blocked.stderr).toContain("recovery blocked");
        expect(unrelated.exitCode).toBe(null);
        writeFileSync(
          join(f.state, "owner.json"),
          JSON.stringify({
            ...stale,
            boot:
              process.platform === "linux"
                ? "linux:00000000-0000-0000-0000-000000000000"
                : "darwin:0:0",
          }),
        );
        expect((await start(f, node("process.exitCode=0")).done).code).toBe(0);
        expect(unrelated.exitCode).toBe(null);
      },
    );

    it(
      "cancels participating nested pnpm groups with bounded escalation",
      { timeout: 15000 },
      async () => {
        const f = fixture();
        const inner = join(f.a, "inner.mjs");
        writeFileSync(
          inner,
          "import fs from 'node:fs';process.on('SIGTERM',()=>{});fs.writeFileSync(" +
            JSON.stringify(f.marker) +
            ",'ready');setTimeout(()=>{},8000);",
        );
        writeFileSync(
          join(f.a, "package.json"),
          JSON.stringify({
            scripts: {
              inner:
                quote(process.execPath) +
                " " +
                quote(entry) +
                " run --label nested -- " +
                quote(process.execPath) +
                " " +
                quote(inner),
            },
          }),
        );
        const first = start(f, ["pnpm", "inner"]);
        await until(() => existsSync(f.marker));
        const held = ownerOf(f);
        expect(held.groups.length).toBeGreaterThanOrEqual(2);
        first.child.kill("SIGTERM");
        const result = await first.done;
        expect(result.code, result.stderr).toBe(143);
        expect(ownerOf(f).groups).toEqual([]);
        for (const row of held.groups) expect(current(row.pid)?.state ?? "Z").toMatch(/^Z/u);
      },
    );

    it(
      "exercises the macOS Perl lock driver without relying on Linux flock",
      { timeout: 10000 },
      async () => {
        const f = fixture();
        mkdirSync(f.state, { mode: 0o700 });
        const lock = join(f.state, "lock");
        writeFileSync(lock, "", { mode: 0o600 });
        const program = join(f.a, "perl-worker.mjs");
        writeFileSync(
          program,
          "import fs from 'node:fs';fs.appendFileSync(" +
            JSON.stringify(f.marker) +
            ",'once');setTimeout(()=>{process.exitCode=75},550);",
        );
        const launch = (timeout: number) => {
          const driver = lockCommand("darwin", lock, timeout, program);
          const child = spawn(driver.command, driver.args, { stdio: "ignore" });
          children.push(child);
          const done = new Promise((resolveDone, reject) => {
            child.once("error", reject);
            child.once("exit", resolveDone);
          });
          return { child, done };
        };
        const held = launch(1);
        await until(() => existsSync(f.marker));
        expect(await launch(0).done).toBe(75);
        expect(await held.done).toBe(75);
        expect(readFileSync(f.marker, "utf8")).toBe("once");
      },
    );

    it("bypasses CI without touching coordination state", { timeout: 10000 }, async () => {
      const f = fixture();
      const result = await start(f, node("console.log('ci-bypass');process.exitCode=75"), {
        env: { CI: "true" },
      }).done;
      expect(result.code).toBe(75);
      expect(result.stdout).toContain("ci-bypass");
      expect(existsSync(f.state)).toBe(false);
    });

    it(
      "preserves ordinary native-Windows execution without creating shared state",
      { timeout: 10000 },
      async () => {
        const f = fixture();
        const args = [
          "run",
          "--",
          process.execPath,
          "-e",
          "console.log('windows-bypass');process.exitCode=75",
        ];
        const child = spawn(
          process.execPath,
          [
            "--input-type=module",
            "--eval",
            "Object.defineProperty(process,'platform',{value:'win32'});process.argv=[process.execPath," +
              JSON.stringify(entry) +
              ",..." +
              JSON.stringify(args) +
              "];await import(" +
              JSON.stringify(pathToFileURL(entry).href) +
              ");",
          ],
          {
            cwd: f.a,
            env: { ...environment(), CI: "", HEAVY_JOB_STATE_DIR: f.state },
            stdio: ["ignore", "pipe", "pipe"],
          },
        );
        children.push(child);
        let output = "";
        child.stdout.on("data", (data: Buffer) => {
          output += data.toString();
        });
        const code = await new Promise((resolveDone, reject) => {
          child.once("error", reject);
          child.once("close", resolveDone);
        });
        expect(code).toBe(75);
        expect(output).toContain("windows-bypass");
        expect(existsSync(f.state)).toBe(false);
      },
    );
  },
);
