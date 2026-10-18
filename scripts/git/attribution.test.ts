import { describe, expect, it } from "vitest";
import { attributionLine } from "./attribution.ts";

describe("attributionLine", () => {
  it("finds each form of AI attribution", () => {
    for (const line of [
      "Co-authored-by: Someone <someone@example.com>",
      "Assisted-by: Gemini",
      "Generated-by: an agent",
      "Claude-Session: abc",
      "Generated with Claude Code",
      "Made with Cursor",
      "written by Copilot",
      "🤖 done",
    ]) {
      expect(attributionLine(`Fix the total\n\n${line}\n`), line).toBe(line);
    }
  });

  it("accepts a message that only mentions the tools", () => {
    expect(
      attributionLine("Document how Claude Code and Codex read AGENTS.md\n\nCloses #3"),
    ).toBeUndefined();
    expect(attributionLine("Generate the report with the new totals")).toBeUndefined();
  });

  it("accepts text that names the forms in code spans, and nothing more", () => {
    expect(
      attributionLine("- Recognise `Assisted-by:` and `Co-authored-by:` trailers"),
    ).toBeUndefined();
    const hidden = "`note` Co-authored-by: Someone <someone@example.com>";
    expect(attributionLine(hidden)).toBe(hidden);
  });
});
