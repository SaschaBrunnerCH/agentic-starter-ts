import { expect, it } from "vitest";
import { setupMode, setupUsage } from "./setup-arguments.ts";
it("keeps no-argument apply and accepts only exclusive documented modes", () => {
  expect(setupMode([])).toBe("apply");
  expect(setupMode(["--dry-run"])).toBe("dry-run");
  for (const flag of ["--help", "-h", "help"]) expect(setupMode([flag])).toBe("help");
  for (const args of [["--bad"], ["--dry-run=true"], ["--help", "extra"]])
    expect(() => setupMode(args)).toThrow("Unsupported setup arguments");
  expect(setupUsage("setup:github")).toContain("pnpm setup:github");
});
