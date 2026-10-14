/** Markdown without fenced code blocks and inline code, where links are not links. */
function prose(markdown: string): string {
  return markdown
    .replace(/^(`{3,}|~{3,})[^\n]*\n[\s\S]*?^\1[^\n]*$/gmu, "")
    .replace(/`[^`\n]*`/gu, "");
}

/** The anchors GitHub gives the headings of a Markdown file. */
export function headingAnchors(markdown: string): Set<string> {
  const anchors = new Set<string>();
  const withoutFences = markdown.replace(/^(`{3,}|~{3,})[^\n]*\n[\s\S]*?^\1[^\n]*$/gmu, "");
  for (const match of withoutFences.matchAll(/^#{1,6}\s+(.+?)\s*#*\s*$/gmu)) {
    const text = (match[1] ?? "").replace(/!?\[([^\]]*)\]\([^)]*\)/gu, "$1").replace(/[`*]/gu, "");
    const base = text
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s_-]/gu, "")
      .replace(/\s/gu, "-");
    let anchor = base;
    for (let count = 1; anchors.has(anchor); count += 1) anchor = `${base}-${count}`;
    anchors.add(anchor);
  }
  return anchors;
}

export type LocalLink = Readonly<{ path: string; anchor: string | undefined }>;

/**
 * Links to files of the repository and to anchors, inline ones and the definitions
 * of reference-style links ("[label]: path"); links to other sites are not checked.
 */
export function localLinks(markdown: string): LocalLink[] {
  const links: LocalLink[] = [];
  const text = prose(markdown);
  const targets = [
    ...text.matchAll(/\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/gu),
    ...text.matchAll(/^ {0,3}\[[^\]\n]+\]:[ \t]*<?([^\s>]+)>?/gmu),
  ];
  for (const match of targets) {
    const target = match[1] ?? "";
    if (/^[a-z][a-z0-9+.-]*:/iu.test(target) || target.startsWith("//")) continue;
    const [path = "", anchor] = target.split("#");
    links.push({ path: decodeURIComponent(path.split("?")[0] ?? ""), anchor });
  }
  return links;
}
