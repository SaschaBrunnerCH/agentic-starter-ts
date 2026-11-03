import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "../..");
const fixture = mkdtempSync(join(tmpdir(), "static-safeguards-"));
afterAll(() => rmSync(fixture, { recursive: true, force: true }));
mkdirSync(join(fixture, "src"));
mkdirSync(join(fixture, "scripts"));

const run = (tool: string, args: string[]) => {
  const result = spawnSync(resolve(root, "node_modules/.bin", tool), args, {
    cwd: fixture,
    encoding: "utf8",
    timeout: 10_000,
  });
  expect(result.error).toBeUndefined();
  return { status: result.status, output: result.stdout + result.stderr };
};

it.each(["app", "test", "node", "e2e"])(
  "tsconfig.%s.json rejects implicit overrides and explicit undefined optional properties",
  (name) => {
    writeFileSync(
      join(fixture, "tsconfig.json"),
      JSON.stringify({
        extends: resolve(root, `tsconfig.${name}.json`),
        compilerOptions: { types: [] },
        files: ["control.ts"],
        include: [],
      }),
    );
    writeFileSync(
      join(fixture, "control.ts"),
      "class Parent { value = 1; }\nexport class Child extends Parent { override value = 2; }\nexport const optional: { text?: string } = {};\n",
    );
    const valid = run("tsc", ["--project", "tsconfig.json"]);
    expect(valid.status, valid.output).toBe(0);

    writeFileSync(
      join(fixture, "control.ts"),
      "class Parent { value = 1; }\nexport class Child extends Parent { value = 2; }\nexport const optional: { text?: string } = { text: undefined };\n",
    );
    const invalid = run("tsc", ["--project", "tsconfig.json"]);
    expect(invalid.status, invalid.output).not.toBe(0);
    expect(invalid.output).toContain("TS4114");
    expect(invalid.output).toContain("TS2375");
  },
);

const lintCases: [string, string, string][] = [
  ["explicit any", "export type Value = any;", "no-explicit-any"],
  [
    "non-null assertion",
    "export function first(values: string[]) { return values[0]!; }",
    "no-non-null-assertion",
  ],
  ["ts-ignore", "// @ts-ignore: deliberate control\nexport const value = 1;", "ban-ts-comment"],
  [
    "ts-expect-error with a description",
    "// @ts-expect-error: deliberate control\nexport const value = 1;",
    "ban-ts-comment",
  ],
  ["ts-nocheck", "// @ts-nocheck\nexport const value = 1;", "ban-ts-comment"],
  ["application console", 'console.error("control");', "no-console"],
];
// Framework-free adopters remove React and its rules, while retaining other bans.
if (/"react"\s*:/u.test(readFileSync(join(root, "package.json"), "utf8"))) {
  lintCases.push([
    "unsafe HTML",
    'export function Panel() { return <div dangerouslySetInnerHTML={{ __html: "control" }} />; }',
    "no-danger",
  ]);
}

it.each(lintCases)("Oxlint rejects %s", (_name, source, rule) => {
  writeFileSync(join(fixture, ".oxlintrc.json"), readFileSync(join(root, ".oxlintrc.json")));
  writeFileSync(join(fixture, "src/control.tsx"), source);
  const result = run("oxlint", ["--deny-warnings", "src/control.tsx"]);
  expect(result.status, result.output).not.toBe(0);
  expect(result.output).toContain(rule);
});

it("allows safe JSX and legitimate tooling/test console diagnostics", () => {
  writeFileSync(join(fixture, ".oxlintrc.json"), readFileSync(join(root, ".oxlintrc.json")));
  writeFileSync(
    join(fixture, "src/control.tsx"),
    "// @ts-check\nexport function Panel({ text }: { text: string }) { return <p>{text}</p>; }",
  );
  writeFileSync(join(fixture, "scripts/control.ts"), 'console.log("tooling diagnostic");');
  mkdirSync(join(fixture, "e2e"), { recursive: true });
  writeFileSync(join(fixture, "e2e/control.ts"), 'console.error("deliberate browser control");');
  const result = run("oxlint", ["--deny-warnings", "src", "scripts", "e2e"]);
  expect(result.status, result.output).toBe(0);
});
