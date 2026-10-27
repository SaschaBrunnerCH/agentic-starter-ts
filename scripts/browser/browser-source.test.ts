import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { guardBrowserSource } from "./browser-source.ts";

const fixture = vi.hoisted(() => ({
  head: "a".repeat(40),
  status: "",
  files: "src/app.ts\0README.md\0",
  failed: "",
  spawnError: false,
  ignored: 0,
  watchFailure: -1,
  listeners: [] as ((event: string, name: string | null) => void)[],
  events: [] as EventEmitter[],
  closed: vi.fn(),
}));
vi.mock("node:child_process", () => ({
  spawnSync: (_command: string, args: string[]) => ({
    status: args[0] === "check-ignore" ? fixture.ignored : fixture.failed === args[0] ? 1 : 0,
    ...(fixture.spawnError ? { error: new Error("unavailable") } : {}),
    stdout:
      args[0] === "rev-parse"
        ? fixture.head
        : args[0] === "status"
          ? fixture.status
          : fixture.files,
  }),
}));
vi.mock("node:fs", () => ({
  readdirSync: () => [],
  lstatSync: () => undefined,
  watch: (
    _path: string,
    _options: unknown,
    listener: (event: string, name: string | null) => void,
  ) => {
    if (fixture.listeners.length === fixture.watchFailure) throw new Error("watch unavailable");
    fixture.listeners.push(listener);
    const event = Object.assign(new EventEmitter(), { close: fixture.closed });
    fixture.events.push(event);
    return event;
  },
}));
beforeEach(() => {
  Object.assign(fixture, {
    head: "a".repeat(40),
    status: "",
    failed: "",
    spawnError: false,
    ignored: 0,
    watchFailure: -1,
    listeners: [],
    events: [],
  });
  fixture.closed.mockClear();
});
afterEach(() => vi.restoreAllMocks());

describe("browser source identity", () => {
  it("retains initial cleanliness, checks both boundaries and closes every watcher", () => {
    const guard = guardBrowserSource("/fixture");
    expect(guard.commit).toBe("a".repeat(40));
    expect(guard.dirty).toBe(false);
    guard.assertStable();
    guard.close();
    guard.close();
    expect(fixture.closed).toHaveBeenCalledTimes(2);
  });
  it("keeps dirty diagnostic sources distinct from clean acceptance", () => {
    fixture.status = " M src/app.ts";
    const guard = guardBrowserSource("/fixture");
    expect(guard.dirty).toBe(true);
    guard.assertStable();
    guard.close();
  });
  it.each(["rev-parse", "status", "ls-files"])("rejects failed git %s", (command) => {
    fixture.failed = command;
    expect(() => guardBrowserSource("/fixture")).toThrow("identity unavailable");
  });
  it("rejects unavailable executables and malformed commits", () => {
    fixture.spawnError = true;
    expect(() => guardBrowserSource("/fixture")).toThrow("identity unavailable");
    fixture.spawnError = false;
    fixture.head = "";
    expect(() => guardBrowserSource("/fixture")).toThrow("commit is unavailable");
  });
  it.each(["head", "status", "failure"])("rejects a final %s change", (change) => {
    const guard = guardBrowserSource("/fixture");
    if (change === "head") fixture.head = "b".repeat(40);
    else if (change === "status") fixture.status = "?? added.ts";
    else fixture.failed = "status";
    expect(() => guard.assertStable()).toThrow();
    guard.close();
  });
  it("retains an observed source change even after Git state is restored", () => {
    const guard = guardBrowserSource("/fixture");
    fixture.listeners[1]?.("change", "app.ts");
    expect(() => guard.assertStable()).toThrow("Source changed");
    guard.close();
  });
  it.each(["ignored", "git"])("allows %s bookkeeping without accepting source edits", (kind) => {
    const guard = guardBrowserSource("/fixture");
    fixture.listeners[0]?.("rename", kind === "git" ? ".git" : "dist");
    guard.assertStable();
    guard.close();
  });
  it.each([1, 2])("rejects an untracked source or unknown ignore status %i", (status) => {
    const guard = guardBrowserSource("/fixture");
    fixture.ignored = status;
    fixture.listeners[0]?.("rename", "new.ts");
    expect(() => guard.assertStable()).toThrow("Source changed");
    guard.close();
  });
  it("rejects failed ignore inspection", () => {
    const guard = guardBrowserSource("/fixture");
    fixture.spawnError = true;
    fixture.listeners[0]?.("rename", "new.ts");
    fixture.spawnError = false;
    expect(() => guard.assertStable()).toThrow("Source changed");
    guard.close();
  });
  it("fails closed on unavailable event names or watcher errors", () => {
    const first = guardBrowserSource("/fixture");
    fixture.listeners[0]?.("change", null);
    expect(() => first.assertStable()).toThrow("Source changed");
    first.close();
    const second = guardBrowserSource("/fixture");
    fixture.events.at(-1)?.emit("error", new Error("watch failed"));
    expect(() => second.assertStable()).toThrow("Source changed");
    second.close();
  });
  it("closes already-created watchers when setup fails", () => {
    fixture.watchFailure = 1;
    expect(() => guardBrowserSource("/fixture")).toThrow("watch unavailable");
    expect(fixture.closed).toHaveBeenCalledOnce();
  });
});
