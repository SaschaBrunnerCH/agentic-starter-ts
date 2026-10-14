import { describe, expect, it } from "vitest";
import { greeting } from "./greeting.ts";

describe("greeting", () => {
  it("addresses the given name", () => {
    expect(greeting("Ada")).toBe("Hello, Ada.");
  });

  it("falls back when the name is blank", () => {
    expect(greeting("  ")).toBe("Hello.");
  });
});
