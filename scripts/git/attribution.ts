// Commits and pull requests carry the author's name only, whichever agent wrote them.
const attributionPatterns = [
  /co-authored-by:/i,
  /assisted-by:/i,
  /generated-by:/i,
  /claude-session:/i,
  /(?:generated|made|written|created) (?:with|by) (?:claude|codex|copilot|cursor|gemini)/i,
  /🤖/u,
];

/** The first line that attributes the text to an AI tool, if any. */
export function attributionLine(text: string): string | undefined {
  return text.split(/\r?\n/u).find((line) => {
    // A form named in a code span documents it; a trailer is never written that way.
    const outsideCode = line.replace(/`[^`]*`/gu, "");
    return attributionPatterns.some((pattern) => pattern.test(outsideCode));
  });
}
