import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { labelChanges, loadProjectLabels, parseProjectLabels } from "./project-labels.ts";

const root = resolve(import.meta.dirname, "../..");
const defaults = loadProjectLabels(join(root, ".github/labels.json"));
const parse = (value: unknown) => parseProjectLabels(JSON.stringify(value), "labels.json");

describe("project labels", () => {
  it("supports product areas and normalizes colors without changing workflow labels", () => {
    const custom = defaults.filter((label) => label.name !== "area:app");
    custom.push({ name: "area:routes", color: "AABBCC", description: "Routing" });
    expect(parse(custom)).toEqual(
      custom.map((label) => ({ ...label, color: label.color.toLowerCase() })),
    );
  });

  it.each([
    [null, "expected an array"],
    [[{}], ".name"],
    [[{ name: "x", color: "abc123", description: 5 }], ".description"],
    [[{ name: " ", color: "abc123", description: "" }], ".name must"],
    [[{ name: "x ", color: "abc123", description: "" }], ".name must"],
    [[{ name: "x".repeat(51), color: "abc123", description: "" }], ".name must"],
    [[{ name: "x", color: "#abc123", description: "" }], ".color must"],
    [[{ name: "x", color: "gg0000", description: "" }], ".color must"],
    [[{ name: "x", color: "abc123", description: "x".repeat(101) }], ".description must"],
    [[...defaults, defaults[0]], "duplicates"],
    [[...defaults, { ...defaults[0], name: "NEEDS-TRIAGE" }], "case-insensitive"],
    [defaults.filter((label) => label.name !== "area:engineering"), "area:engineering"],
    [defaults.filter((label) => label.name !== "ready-for-agent"), "ready-for-agent"],
  ])("rejects malformed configuration %#", (value, message) => {
    expect(() => parse(value)).toThrow(message);
  });

  it("reports malformed JSON and missing files with their source", () => {
    expect(() => parseProjectLabels("{", "labels.json")).toThrow("labels.json did not return JSON");
    expect(() => loadProjectLabels(join(root, "missing-labels.json"))).toThrow(
      "Cannot read label configuration",
    );
  });

  it("reconciles only changed configured labels and is idempotent", () => {
    const hosted = defaults.map((label) => ({ ...label, color: label.color.toUpperCase() }));
    hosted.push({ name: "unconfigured", color: "ffffff", description: "Keep this" });
    expect(labelChanges(defaults, hosted)).toEqual([]);
    const wanted = [
      ...defaults.slice(1),
      { ...defaults[0]!, description: "Updated description" },
      { name: "area:new", color: "aabbcc", description: "New" },
    ];
    const changes = labelChanges(wanted, hosted);
    expect(changes).toEqual([
      { label: wanted.at(-2), exists: true },
      { label: wanted.at(-1), exists: false },
    ]);
    const applied = [
      ...hosted.filter((label) => !changes.some((change) => change.label.name === label.name)),
      ...changes.map((change) => change.label),
    ];
    expect(labelChanges(wanted, applied)).toEqual([]);
    expect(applied.find((label) => label.name === "unconfigured")).toEqual(hosted.at(-1));
  });

  it("refuses bad configuration before even invoking gh in the real setup command", () => {
    const fixture = mkdtempSync(join(tmpdir(), "label-setup-"));
    try {
      cpSync(join(root, "scripts"), join(fixture, "scripts"), { recursive: true });
      mkdirSync(join(fixture, ".github"));
      const bin = join(fixture, "bin");
      mkdirSync(bin);
      const marker = join(fixture, "gh-called");
      writeFileSync(
        join(bin, "gh"),
        `#!${process.execPath}\nrequire('node:fs').writeFileSync(${JSON.stringify(marker)}, 'called'); process.exit(75);\n`,
        { mode: 0o755 },
      );
      // Prove the sentinel notices execution before testing that setup never reaches it.
      expect(spawnSync(process.execPath, [join(bin, "gh")]).status).toBe(75);
      expect(existsSync(marker)).toBe(true);
      rmSync(marker);
      for (const content of [undefined, "{", JSON.stringify([...defaults, defaults[0]]), "[]"]) {
        const file = join(fixture, ".github/labels.json");
        if (content === undefined) rmSync(file, { force: true });
        else writeFileSync(file, content);
        const result = spawnSync(
          process.execPath,
          [join(fixture, "scripts/setup/setup-github.ts")],
          {
            cwd: fixture,
            encoding: "utf8",
            env: { ...process.env, PATH: bin },
          },
        );
        expect(result.status).not.toBe(0);
        expect(result.stderr).toContain("labels.json");
        expect(existsSync(marker)).toBe(false);
      }
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
  });
});
