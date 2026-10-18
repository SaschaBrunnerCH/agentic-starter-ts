import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { skillProblems, skillsDirectory } from "./agent-skills.ts";

const directory = resolve(import.meta.dirname, "../..", skillsDirectory);
const read = (path: string) => readFileSync(resolve(directory, path), "utf8");
const policy = "policy:\n  allow_implicit_invocation: false\n";
const skill = (fields: string) => `---\n${fields}\n---\n\nDo it.\n`;

describe("the skills of this repository", () => {
  it("run only when a person names them", () => {
    const names = readdirSync(directory);
    expect(names).toEqual(["issue", "review"]);
    for (const name of names) {
      expect(
        skillProblems(name, read(`${name}/SKILL.md`), read(`${name}/agents/openai.yaml`)),
      ).toEqual([]);
    }
  });
});

// Negative controls: each rule rejects the violation it exists for.
describe("skillProblems", () => {
  it("accepts a manual-only skill", () => {
    expect(skillProblems("x", skill("name: x\ndisable-model-invocation: true"), policy)).toEqual(
      [],
    );
  });

  it("notices a skill Claude Code may start on its own", () => {
    expect(skillProblems("x", skill("name: x"), policy)).toEqual([
      "SKILL.md lacks disable-model-invocation: true, so Claude Code may start it",
    ]);
  });

  it("notices a skill Codex may start on its own", () => {
    const fields = skill("name: x\ndisable-model-invocation: true");
    const problem =
      "agents/openai.yaml lacks policy.allow_implicit_invocation: false, so Codex may start it";
    expect(skillProblems("x", fields, undefined)).toEqual([problem]);
    expect(skillProblems("x", fields, "policy:\n  allow_implicit_invocation: true\n")).toEqual([
      problem,
    ]);
  });

  it("notices a missing file, missing frontmatter and a wrong name", () => {
    expect(skillProblems("x", undefined, policy)).toEqual(["has no SKILL.md"]);
    expect(skillProblems("x", "Do it.\n", policy)).toEqual(["SKILL.md has no frontmatter"]);
    expect(skillProblems("x", skill("name: y\ndisable-model-invocation: true"), policy)).toEqual([
      "SKILL.md does not name itself x",
    ]);
  });
});
