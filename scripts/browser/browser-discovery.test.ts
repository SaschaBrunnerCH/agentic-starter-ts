import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { expect, it } from "vitest";
import { browserEvidenceFile } from "./browser-evidence.ts";

const root = resolve(import.meta.dirname, "../..");
const evidence = browserEvidenceFile(root);
const recorded = () => {
  try {
    return readFileSync(evidence, "utf8");
  } catch {
    return undefined;
  }
};
it.each(["--help", "--list"])(
  "the real browser CLI %s does not inspect source or write acceptance",
  (option) => {
    const directory = mkdtempSync(join(tmpdir(), "browser-discovery-"));
    const journal = join(directory, "git-calls.jsonl");
    const before = recorded();
    writeFileSync(journal, "");
    writeFileSync(
      join(directory, "git"),
      `#!/usr/bin/env node
const fs = require('node:fs');
fs.appendFileSync(process.env.DISCOVERY_GIT_JOURNAL, JSON.stringify(process.argv.slice(2))+'\n');
process.exit(73);
`,
      { mode: 0o755 },
    );
    try {
      const env = {
        ...Object.fromEntries(
          Object.entries(process.env).filter(([name]) => !name.startsWith("GIT_")),
        ),
        CI: "",
        BROWSER_GPU: "off",
        BROWSER_TEST_BASE_URL: "",
        REMOTE_BROWSER_WS_ENDPOINT: "",
        PLAYWRIGHT_BROWSERS_PATH: join(directory, "browser-cache"),
        DISCOVERY_GIT_JOURNAL: journal,
        PATH: `${directory}:${process.env.PATH ?? ""}`,
      };
      const result = spawnSync(
        process.execPath,
        [join(root, "scripts/browser/browser-test.ts"), option],
        {
          cwd: root,
          env,
          encoding: "utf8",
          timeout: 10000,
        },
      );
      expect(result.status, result.stderr).toBe(0);
      expect(result.stdout).toContain(option === "--list" ? "Total:" : "Usage:");
      expect(readFileSync(journal, "utf8")).toBe("");
      expect(recorded()).toBe(before);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  },
  12000,
);
