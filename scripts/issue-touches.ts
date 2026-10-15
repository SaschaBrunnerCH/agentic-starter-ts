import { matchesGlob } from "node:path";

// The paths an issue expects to change, from its "Touches" section, and the overlap between
// two issues. Parallel work on the same files ends in a conflict at the second merge; a
// warning at the start lets the owner order the work instead. See
// engineering/agents/issue-tracker.md.

// A heading or a bold line that opens the section, as for "Done when".
const touchesStart = /^(?:>\s*)?(?:#{1,6}\s+|\*\*)Touches\b/iu;
const sectionStart = /^(?:>\s*)?(?:#{1,6}\s+|\*\*[^*]+\*\*\s*$)/u;
// A list item; the pattern may be in backticks and followed by a comment after " — " or " - ".
const listItem = /^(?:>\s*)?\s*[-*+]\s+(?!<!--)`?([^`\s]+)`?/u;

/** The glob patterns of an issue's "Touches" section; none when it has no section. */
export function touchesOf(body: string): string[] {
  const lines = body.split(/\r?\n/u);
  const start = lines.findIndex((line) => touchesStart.test(line.trim()));
  if (start === -1) return [];
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => sectionStart.test(line.trim()));
  return (end === -1 ? rest : rest.slice(0, end))
    .map((line) => listItem.exec(line)?.[1])
    .filter((pattern): pattern is string => pattern !== undefined)
    .map((pattern) => pattern.replace(/^\.\//u, ""));
}

// Wildcards, classes, braces and the extglob openers @( !( +( that matchesGlob supports.
const globCharacter = /[*?[{]|[@!+]\(/u;

// The part before the first glob character: every path a pattern matches starts with it.
function literalPrefix(pattern: string): string {
  const index = pattern.search(globCharacter);
  return index === -1 ? pattern : pattern.slice(0, index);
}

// Whether a path is a folder itself or lies in it.
function folderOf(folder: string, path: string): boolean {
  return path === folder || path.startsWith(folder.endsWith("/") ? folder : `${folder}/`);
}

/**
 * Whether two patterns can match a common path. Without globs: the same path, or one is a
 * folder of the other. With globs: one matches the other's literal, or their literal prefixes
 * lie on one line. Erring towards overlap is fine: the result is a warning.
 */
export function patternsOverlap(a: string, b: string): boolean {
  const aGlob = globCharacter.test(a);
  const bGlob = globCharacter.test(b);
  if (!aGlob && !bGlob) return folderOf(a, b) || folderOf(b, a);
  if (!aGlob && matchesGlob(a, b)) return true;
  if (!bGlob && matchesGlob(b, a)) return true;
  const [pa, pb] = [literalPrefix(a), literalPrefix(b)];
  return pa.startsWith(pb) || pb.startsWith(pa);
}

/** The pairs of patterns of two issues that overlap, as "mine ~ theirs". */
export function overlaps(mine: readonly string[], theirs: readonly string[]): string[] {
  return mine.flatMap((a) =>
    theirs.filter((b) => patternsOverlap(a, b)).map((b) => (a === b ? a : `${a} ~ ${b}`)),
  );
}
