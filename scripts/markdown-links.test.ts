import { describe, expect, it } from "vitest";
import { headingAnchors, localLinks } from "./markdown-links.ts";

describe("headingAnchors", () => {
  it("names headings as GitHub does", () => {
    const anchors = headingAnchors(
      "# How to work here\n\n## The `PR build` status: what, why?\n\n## Setup\n\n## Setup\n",
    );
    expect([...anchors]).toEqual([
      "how-to-work-here",
      "the-pr-build-status-what-why",
      "setup",
      "setup-1",
    ]);
  });

  it("ignores headings inside code fences", () => {
    expect([...headingAnchors("```sh\n# not a heading\n```\n\n# Real\n")]).toEqual(["real"]);
  });
});

describe("localLinks", () => {
  it("finds files and anchors and leaves other sites alone", () => {
    expect(
      localLinks(
        "See [a](docs/a.md#part), [top](#top), ![d](d.svg) and [site](https://example.com/x.md).",
      ),
    ).toEqual([
      { path: "docs/a.md", anchor: "part" },
      { path: "", anchor: "top" },
      { path: "d.svg", anchor: undefined },
    ]);
  });

  it("finds the targets of reference-style links", () => {
    expect(
      localLinks(
        'See [rules][r] and [site][s].\n\n[r]: missing.md#absent\n  [s]: <https://example.com> "Site"\n',
      ),
    ).toEqual([{ path: "missing.md", anchor: "absent" }]);
  });

  it("ignores links shown as code", () => {
    expect(localLinks("Write `[text](missing.md)`.\n\n```md\n[x](gone.md)\n```\n")).toEqual([]);
  });
});
