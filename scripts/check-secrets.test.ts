import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

// Negative control: the scanner, with this repository's configuration, rejects a credential.
const root = resolve(import.meta.dirname, "..");
const directory = mkdtempSync(join(tmpdir(), "secret-control-"));
afterAll(() => rmSync(directory, { recursive: true }));

function scan(content: string): number | null {
  const file = join(directory, "sample.txt");
  writeFileSync(file, content);
  return spawnSync(resolve(root, "node_modules/.bin/secretlint"), ["--no-glob", file], {
    cwd: root,
    encoding: "utf8",
  }).status;
}

describe("the secret scanner", () => {
  it("rejects a token and accepts ordinary text", () => {
    // Assembled here so that this file holds no token itself.
    const token = ["ghp", "R8mQ2vX7cL4tZ9bN1kW6yH3sD5fJ0gPaUeTo"].join("_");
    expect(scan(`token=${token}\n`)).not.toBe(0);
    expect(scan("token=<your token>\n")).toBe(0);
  });
});
