import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import * as json from "./json-shape.ts";
import { rulesetShape, workflowPermissionsShape } from "./ruleset-drift.ts";

const pullRequest = json.object({
  number: json.number,
  author: json.object({ login: json.string }),
  commits: json.array(json.object({ messageHeadline: json.string })),
  mergedAt: json.nullable(json.string),
  labels: json.optional(json.array(json.string)),
});

const parse = (text: string) => json.parseJson(text, pullRequest, "gh pr view");

describe("parseJson", () => {
  it("returns a value of the shape, extra fields included", () => {
    const value = parse(
      '{"number":7,"author":{"login":"a"},"commits":[{"messageHeadline":"x"}],"mergedAt":null,"extra":1}',
    );
    expect(value.author.login).toBe("a");
    expect(value.labels).toBeUndefined();
  });

  it("names the path of a missing field", () => {
    expect(() => parse('{"number":7,"commits":[],"mergedAt":null}')).toThrow(
      "gh pr view returned unexpected JSON at .author: expected an object, got undefined",
    );
  });

  it("names the path of a wrongly typed field inside an array", () => {
    expect(() =>
      parse(
        '{"number":7,"author":{"login":"a"},"commits":[{"messageHeadline":"x"},{"messageHeadline":3}],"mergedAt":null}',
      ),
    ).toThrow("at .commits[1].messageHeadline: expected a string, got number");
  });

  it("refuses null where the shape does not allow it, and a wrong top level", () => {
    expect(() =>
      parse('{"number":null,"author":{"login":"a"},"commits":[],"mergedAt":null}'),
    ).toThrow("at .number: expected a number, got null");
    expect(() => parse("[]")).toThrow("at the top level: expected an object, got an array");
  });

  it("checks an optional field when it is present", () => {
    expect(() =>
      parse('{"number":7,"author":{"login":"a"},"commits":[],"mergedAt":null,"labels":"bug"}'),
    ).toThrow('at .labels: expected an array, got the string "bug"');
  });

  it("checks every value of a record", () => {
    expect(() =>
      json.parseJson(
        '{"scripts":{"a":"x","b":1}}',
        json.object({ scripts: json.record(json.string) }),
        "package.json",
      ),
    ).toThrow("package.json returned unexpected JSON at .scripts.b: expected a string, got number");
  });

  it("reports text that is not JSON", () => {
    expect(() => parse("gh: not found")).toThrow("gh pr view did not return JSON: gh: not found");
  });
});

describe("the shapes of hosted settings", () => {
  it("accept the committed ruleset files", () => {
    const directory = resolve(import.meta.dirname, "../.github/rulesets");
    const files = readdirSync(directory).filter((name) => name.endsWith(".json"));
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const text = readFileSync(join(directory, file), "utf8");
      expect(json.parseJson(text, rulesetShape, file).name).not.toBe("");
    }
  });

  it("refuse workflow permissions without the approval setting", () => {
    expect(() =>
      json.parseJson('{"default_workflow_permissions":"read"}', workflowPermissionsShape, "gh api"),
    ).toThrow("at .can_approve_pull_request_reviews: expected a boolean, got undefined");
  });
});
