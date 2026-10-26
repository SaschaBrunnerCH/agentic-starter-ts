import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { personalizationProblems } from "./personalization.ts";

const source = resolve(import.meta.dirname, "../..");
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "personalization-"));
  mkdirSync(join(root, ".github"));
  writeFileSync(join(root, ".github/CODEOWNERS"), "* @example-owner\n");
  writeFileSync(join(root, "package.json"), '{"name":"product"}');
  writeFileSync(
    join(root, "index.html"),
    '<title>Product</title><meta content="Product description" name="description">',
  );
  return root;
}
const project = "https://github.com/example-owner/product";

describe("personalization preflight", () => {
  it("reports all inherited placeholders, with actionable file names", () => {
    const root = fixture();
    try {
      writeFileSync(join(root, ".github/CODEOWNERS"), "* @SaschaBrunnerCH\n");
      writeFileSync(join(root, "package.json"), '{"name":"agentic-starter-ts"}');
      writeFileSync(
        join(root, "index.html"),
        '<title>Application</title><meta name="description" content="Replace this description with one sentence about the application.">',
      );
      expect(personalizationProblems(root, project)).toHaveLength(4);
      expect(personalizationProblems(root, project).join("\n")).toContain(
        "replace the inherited template owner",
      );
      expect(personalizationProblems(root, project).join("\n")).toContain("package.json");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it.each([
    "* @example-owner",
    "* @example-org/maintainers",
    "*\t@example-org/team.one @another-user # owners",
    "# * @SaschaBrunnerCH\n* @example-owner",
  ])("accepts user/team owners: %s", (owners) => {
    const root = fixture();
    try {
      writeFileSync(join(root, ".github/CODEOWNERS"), owners);
      expect(personalizationProblems(root, project)).toEqual([]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it.each(["", "# no owner", "src/ @someone", "* someone", "* @org/", "* @user @bad!"])(
    "requires valid global ownership: %s",
    (owners) => {
      const root = fixture();
      try {
        writeFileSync(join(root, ".github/CODEOWNERS"), owners);
        expect(personalizationProblems(root, project).join("\n")).toContain("set a global * owner");
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    },
  );

  it("accepts the original starter identity, including its initial placeholders", () => {
    expect(
      personalizationProblems(source, "https://github.com/SaschaBrunnerCH/agentic-starter-ts/"),
    ).toEqual([]);
  });

  it("accepts the same owner's personalized projects without exempting metadata", () => {
    const root = fixture();
    try {
      writeFileSync(join(root, ".github/CODEOWNERS"), "* @SaschaBrunnerCH");
      expect(personalizationProblems(root, "https://github.com/SaschaBrunnerCH/product")).toEqual(
        [],
      );
      expect(
        personalizationProblems(root, "https://another.example/SaschaBrunnerCH/agentic-starter-ts"),
      ).toEqual([]);
      writeFileSync(join(root, "package.json"), '{"name":"agentic-starter-ts"}');
      expect(
        personalizationProblems(root, "https://another.example/SaschaBrunnerCH/agentic-starter-ts"),
      ).toHaveLength(1);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it.each([
    "",
    "<title> </title><meta name='description' content=' '>",
    "<title>Product</title><meta name='description'>",
  ])("rejects missing or empty HTML fields", (html) => {
    const root = fixture();
    try {
      writeFileSync(join(root, "index.html"), html);
      expect(personalizationProblems(root, project).join("\n")).toContain("index.html");
      writeFileSync(join(root, "package.json"), '{"name":" "}');
      expect(personalizationProblems(root, project).join("\n")).toContain("package.json");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("reports malformed local input", () => {
    const root = fixture();
    try {
      writeFileSync(join(root, "package.json"), "{");
      expect(() => personalizationProblems(root, project)).toThrow(
        "package.json did not return JSON",
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it.each(["setup-github.ts", "setup-previews.ts"])(
    "blocks %s after its identity read and before any mutation",
    (entry) => {
      const root = fixture();
      try {
        cpSync(join(source, "scripts"), join(root, "scripts"), { recursive: true });
        cpSync(join(source, ".github/labels.json"), join(root, ".github/labels.json"));
        const bin = join(root, "bin");
        mkdirSync(bin);
        const log = join(root, "calls.jsonl");
        const repository = {
          id: "fixture",
          name: "product",
          nameWithOwner: "example-owner/product",
          url: project,
          visibility: "PUBLIC",
          owner: { login: "example-owner" },
          squashMergeAllowed: true,
          mergeCommitAllowed: false,
          rebaseMergeAllowed: false,
          deleteBranchOnMerge: true,
        };
        writeFileSync(
          join(bin, "gh"),
          `#!${process.execPath}\nconst fs=require('node:fs'); const args=process.argv.slice(2); fs.appendFileSync(${JSON.stringify(log)},JSON.stringify(args)+'\\n'); if(args[0]==='repo'){console.log(${JSON.stringify(JSON.stringify(repository))});}else{console.error('sentinel beyond preflight');process.exit(75);}\n`,
          { mode: 0o755 },
        );
        const run = () =>
          spawnSync(process.execPath, [join(root, "scripts/setup", entry)], {
            cwd: root,
            env: { ...process.env, PATH: bin },
            encoding: "utf8",
          });
        writeFileSync(join(root, "package.json"), '{"name":"agentic-starter-ts"}');
        const rejected = run();
        expect(rejected.status).not.toBe(0);
        expect(rejected.stderr).toContain("package.json");
        expect(readFileSync(log, "utf8").trim().split("\n")).toHaveLength(1);
        writeFileSync(join(root, "package.json"), '{"name":"product"}');
        const accepted = run();
        expect(accepted.stderr).toContain("sentinel beyond preflight");
        const calls = readFileSync(log, "utf8").trim().split("\n");
        expect(calls.length).toBeGreaterThanOrEqual(3);
        expect(calls[2]).toContain('"api"');
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    },
  );
});
