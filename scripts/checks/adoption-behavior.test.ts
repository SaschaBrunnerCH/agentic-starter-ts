import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { expect, it } from "vitest";

const root = resolve(import.meta.dirname, "../..");
const env = Object.fromEntries(
  Object.entries(process.env).filter(([name]) => !name.startsWith("GIT_")),
);

function fixture() {
  const directory = mkdtempSync(join(tmpdir(), "adoption-behavior-"));
  const checkout = join(directory, "source");
  const tracked = spawnSync("git", ["ls-files", "-z"], { cwd: root, env, encoding: "utf8" });
  expect(tracked.status).toBe(0);
  for (const file of tracked.stdout.split("\0").filter(Boolean)) {
    mkdirSync(dirname(join(checkout, file)), { recursive: true });
    cpSync(join(root, file), join(checkout, file), { verbatimSymlinks: true, recursive: true });
  }
  const git = (args: string[]) => {
    const result = spawnSync("git", args, { cwd: checkout, env, encoding: "utf8" });
    expect(result.status, result.stderr).toBe(0);
  };
  git(["init", "--quiet", "--initial-branch=main"]);
  git(["config", "user.name", "Fixture"]);
  git(["config", "user.email", "fixture@example.invalid"]);
  return { directory, checkout, git };
}

it("retains engineering links after replacing the root README with a product README", () => {
  const test = fixture();
  try {
    writeFileSync(join(test.checkout, "README.md"), "# Product\n\nProduct documentation.\n");
    test.git(["add", "."]);
    const result = spawnSync(
      process.execPath,
      [join(test.checkout, "scripts/checks/check-links.ts")],
      { env, encoding: "utf8" },
    );
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain("local links");
  } finally {
    rmSync(test.directory, { recursive: true, force: true });
  }
});

it("runs the real adoption command after example assets have already been removed", () => {
  const test = fixture();
  try {
    const edit = (file: string, transform: (text: string) => string) =>
      writeFileSync(
        join(test.checkout, file),
        transform(readFileSync(join(test.checkout, file), "utf8")),
      );
    for (const file of [
      "src/graphics",
      "e2e/graphics.spec.ts",
      "e2e/graphics-evidence.ts",
      "engineering/designs/blueprint-graphics-example.md",
      "engineering/diagrams/starter-example.png",
      "engineering/diagrams/starter-example.json",
      "engineering/diagrams/capture-starter.mjs",
    ])
      rmSync(join(test.checkout, file), { force: true, recursive: true });
    edit("README.md", (text) =>
      text.replace(
        /### (?:Example application|Replace the example)[\s\S]*?(?=### Without React|## Working with an agent)/u,
        "",
      ),
    );
    edit("engineering/diagrams/README.md", (text) =>
      text
        .replace(/### Actual UI capture[\s\S]*?(?=## Review and maintenance)/u, "")
        .replace(/^.*#actual-ui-capture.*\n/gmu, ""),
    );
    edit("engineering/designs/README.md", (text) =>
      text.replace(/^- \[Blueprint graphics example\].*\n/mu, ""),
    );
    test.git(["add", "."]);
    test.git(["commit", "--quiet", "-m", "Initialize adopted source"]);
    const bin = join(test.directory, "bin");
    mkdirSync(bin);
    // Bounded command regression: no registry, hosted service, full gate or nested
    // unit suite. Actual install/build acceptance remains check:adoption's job.
    writeFileSync(
      join(bin, "pnpm"),
      `#!${process.execPath}
const fs = require('node:fs');
const cp = require('node:child_process');
const args = process.argv.slice(2);
if (args[0] === 'check:push') { const r = cp.spawnSync(process.execPath, ['scripts/checks/check-links.ts'], { stdio: 'inherit' }); process.exit(r.status ?? 1); }
if (args[0] === 'remove') { const p = JSON.parse(fs.readFileSync('package.json', 'utf8')); for (const name of args.slice(1)) { delete p.dependencies?.[name]; delete p.devDependencies?.[name]; } fs.writeFileSync('package.json', JSON.stringify(p)); }
else if (args[0] === 'build') { if (fs.readFileSync('index.html','utf8').includes('missing-entry.ts')) { console.error('missing-entry.ts'); process.exit(1); } }
else if (!['install', 'format'].includes(args[0])) { throw new Error('Unexpected workload: ' + args.join(' ')); }
fs.mkdirSync('dist', { recursive: true }); fs.writeFileSync('dist/index.html', 'fixture');
`,
      { mode: 0o755 },
    );
    const result = spawnSync(
      process.execPath,
      [join(test.checkout, "scripts/checks/check-adoption.ts")],
      {
        cwd: test.checkout,
        env: { ...env, PATH: `${bin}:${process.env.PATH ?? ""}`, STARTER_ADOPTION_FIXTURE: "" },
        encoding: "utf8",
        timeout: 12000,
        maxBuffer: 1024 * 1024,
      },
    );
    expect(result.status, result.stderr + result.stdout).toBe(0);
    if (/"react"\s*:/u.test(readFileSync(join(root, "package.json"), "utf8"))) {
      expect(result.stdout).toContain("PASS react:");
    }
    expect(result.stdout).toContain("PASS non-react:");
    expect(result.stdout).toContain("broken-entrypoint control");
  } finally {
    rmSync(test.directory, { recursive: true, force: true });
  }
}, 15000);
