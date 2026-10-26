import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { expect, it } from "vitest";

// Exercise existing entrypoints: these assertions also run against the pre-fix code.
it.each(["setup-github.ts", "setup-previews.ts"])(
  "%s handles arguments before configuration or credentials",
  (entry) => {
    const root = mkdtempSync(join(tmpdir(), "setup-help-"));
    try {
      cpSync(resolve(import.meta.dirname, ".."), join(root, "scripts"), { recursive: true });
      const bin = join(root, "bin");
      mkdirSync(bin);
      const marker = join(root, "gh-called");
      writeFileSync(
        join(bin, "gh"),
        `#!${process.execPath}\nrequire('node:fs').writeFileSync(${JSON.stringify(marker)},'unexpected GitHub access');process.exit(75);`,
        { mode: 0o755 },
      );
      for (const args of [
        ["--help"],
        ["--", "--help"],
        ["-h"],
        ["help"],
        ["--unknown"],
        ["--help", "--dry-run"],
        ["--dry-run", "--dry-run"],
      ]) {
        const result = spawnSync(process.execPath, [join(root, "scripts/setup", entry), ...args], {
          cwd: root,
          env: { ...process.env, PATH: bin },
          encoding: "utf8",
        });
        expect(result.status).toBe(
          (args.length === 1 && args[0] !== "--unknown") || args[0] === "--" ? 0 : 1,
        );
        expect(result.stdout + result.stderr).toMatch(/Usage:|Use --help/u);
        expect(existsSync(marker)).toBe(false);
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  },
);
