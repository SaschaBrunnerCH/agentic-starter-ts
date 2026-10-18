import { describe, expect, it } from "vitest";
import { scriptArguments } from "./script-arguments.ts";

describe("scriptArguments", () => {
  it("drops a leading -- and keeps one later", () => {
    expect(scriptArguments(["node", "task.ts", "--", "start", "12"])).toEqual(["start", "12"]);
    expect(scriptArguments(["node", "task.ts", "start", "12"])).toEqual(["start", "12"]);
    expect(scriptArguments(["node", "task.ts", "merge", "--", "x"])).toEqual(["merge", "--", "x"]);
  });
});
