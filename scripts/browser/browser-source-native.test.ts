import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { guardBrowserSource } from "./browser-source.ts";

let root = "";
beforeEach(() => {
  for (const name of Object.keys(process.env).filter((key) => key.startsWith("GIT_")))
    vi.stubEnv(name, undefined);
  root = mkdtempSync(join(tmpdir(), "browser-source-"));
  writeFileSync(join(root, ".gitignore"), "dist/\ntest-results/\n");
  writeFileSync(join(root, "app.ts"), "original\n");
  for (const args of [
    ["init", "-q"],
    ["add", "."],
    [
      "-c",
      "user.name=Fixture",
      "-c",
      "user.email=fixture@example.test",
      "commit",
      "-qm",
      "Create fixture",
    ],
  ]) {
    const result = spawnSync("git", args, { cwd: root, encoding: "utf8" });
    expect(result.status, result.stderr).toBe(0);
  }
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
  vi.unstubAllEnvs();
});
it("rejects a real source edit even when restored before the final Git inspection", async () => {
  const source = guardBrowserSource(root);
  try {
    writeFileSync(join(root, "app.ts"), "changed\n");
    writeFileSync(join(root, "app.ts"), "original\n");
    await vi.waitFor(() => expect(() => source.assertStable()).toThrow("Source changed"));
  } finally {
    source.close();
  }
});
it("allows a real ignored build without marking source changed", async () => {
  const source = guardBrowserSource(root);
  try {
    mkdirSync(join(root, "dist"));
    writeFileSync(join(root, "dist/index.html"), "built output");
    await new Promise<void>((done) => setTimeout(done, 100));
    source.assertStable();
  } finally {
    source.close();
  }
});

it("allows removal and recreation of an ignored output directory", async () => {
  const output = join(root, "test-results");
  mkdirSync(output);
  const source = guardBrowserSource(root);
  try {
    rmSync(output, { recursive: true });
    await new Promise<void>((done) => setTimeout(done, 100));
    mkdirSync(output);
    writeFileSync(join(output, "result.json"), "{}");
    await new Promise<void>((done) => setTimeout(done, 100));
    source.assertStable();
  } finally {
    source.close();
  }
});

it("rejects a source file replacing an ignored directory even after restoration", async () => {
  const output = join(root, "test-results");
  mkdirSync(output);
  const source = guardBrowserSource(root);
  try {
    rmSync(output, { recursive: true });
    writeFileSync(output, "unignored source file");
    // Observe the file while present; a restored edit must remain latched.
    await new Promise<void>((done) => setTimeout(done, 100));
    expect(() => source.assertStable()).toThrow("Source changed");
    rmSync(output);
    mkdirSync(output);
    expect(() => source.assertStable()).toThrow("Source changed");
  } finally {
    source.close();
  }
});
