import { describe, expect, it } from "vitest";
import {
  dependencyChanges,
  licenseAllowed,
  licenseProblems,
  lockedPackages,
  splitEntry,
} from "./dependency-review.ts";

const lock = (...entries: string[]) =>
  [
    "lockfileVersion: '9.0'",
    "",
    "importers:",
    "",
    "  .:",
    "    devDependencies:",
    "      vite:",
    "        specifier: ^8.0.0",
    "",
    "packages:",
    "",
    ...entries.flatMap((entry) => [`  ${entry}:`, "    resolution: {integrity: sha512-x}", ""]),
    "snapshots:",
    "",
    "  ignored@1.0.0: {}",
  ].join("\n");

describe("lockedPackages", () => {
  it("reads the packages section only, scoped names included", () => {
    expect([...lockedPackages(lock("'@scope/a@1.0.0'", "b@2.0.0"))]).toEqual([
      "@scope/a@1.0.0",
      "b@2.0.0",
    ]);
  });

  it("splits names and versions", () => {
    expect(splitEntry("@scope/a@1.0.0")).toEqual({ name: "@scope/a", version: "1.0.0" });
    expect(splitEntry("b@2.0.0-rc.1")).toEqual({ name: "b", version: "2.0.0-rc.1" });
  });
});

describe("dependencyChanges", () => {
  it("lists new packages and new versions with what they replace", () => {
    expect(
      dependencyChanges(lock("a@1.0.0", "b@1.0.0"), lock("a@1.0.0", "b@1.1.0", "'@s/c@3.0.0'")),
    ).toEqual([
      { name: "@s/c", version: "3.0.0", previous: [] },
      { name: "b", version: "1.1.0", previous: ["1.0.0"] },
    ]);
  });

  it("lists nothing when the lockfile did not change", () => {
    expect(dependencyChanges(lock("a@1.0.0"), lock("a@1.0.0"))).toEqual([]);
  });
});

const allowed = new Set(["MIT", "Apache-2.0"]);

describe("licenseAllowed", () => {
  it("reads SPDX expressions", () => {
    expect(licenseAllowed("MIT", allowed)).toBe(true);
    expect(licenseAllowed("(MIT OR GPL-3.0-only)", allowed)).toBe(true);
    expect(licenseAllowed("MIT AND GPL-3.0-only", allowed)).toBe(false);
    expect(licenseAllowed("GPL-3.0-only", allowed)).toBe(false);
    expect(licenseAllowed("", allowed)).toBe(false);
  });

  it("groups by parentheses, with AND binding tighter than OR", () => {
    expect(licenseAllowed("(MIT OR Apache-2.0) AND (GPL-3.0-only OR AGPL-3.0-only)", allowed)).toBe(
      false,
    );
    expect(licenseAllowed("(MIT OR GPL-3.0-only) AND (Apache-2.0 OR GPL-2.0-only)", allowed)).toBe(
      true,
    );
    expect(licenseAllowed("GPL-3.0-only OR MIT AND Apache-2.0", allowed)).toBe(true);
    expect(licenseAllowed("MIT OR GPL-3.0-only AND AGPL-3.0-only", allowed)).toBe(true);
    expect(licenseAllowed("((MIT))", allowed)).toBe(true);
  });

  it("counts WITH as one licence and refuses what does not parse", () => {
    expect(licenseAllowed("Apache-2.0 WITH LLVM-exception", allowed)).toBe(false);
    expect(
      licenseAllowed("Apache-2.0 WITH LLVM-exception", new Set(["Apache-2.0 WITH LLVM-exception"])),
    ).toBe(true);
    for (const broken of ["(MIT", "MIT)", "MIT OR", "AND MIT", "MIT MIT", "MIT WITH", "()"]) {
      expect(licenseAllowed(broken, allowed)).toBe(false);
    }
  });
});

describe("licenseProblems", () => {
  it("refuses every runtime dependency outside the list, changed or not", () => {
    const runtime = new Map([
      ["ok@1.0.0", "MIT"],
      ["gpl@1.0.0", "GPL-3.0-only"],
      ["agpl@2.0.0", "AGPL-3.0-only"],
    ]);
    expect(licenseProblems(runtime, allowed)).toEqual([
      'agpl@2.0.0 is a runtime dependency under "AGPL-3.0-only"',
      'gpl@1.0.0 is a runtime dependency under "GPL-3.0-only"',
    ]);
  });

  it("accepts a package the owner allowed by name, under any licence", () => {
    const runtime = new Map([
      ["@vendor/sdk@5.0.0", "Unknown"],
      ["other@1.0.0", "Unknown"],
    ]);
    expect(licenseProblems(runtime, allowed, new Set(["@vendor/sdk"]))).toEqual([
      'other@1.0.0 is a runtime dependency under "Unknown"',
    ]);
  });

  it("accepts an empty runtime", () => {
    expect(licenseProblems(new Map(), allowed)).toEqual([]);
  });
});
