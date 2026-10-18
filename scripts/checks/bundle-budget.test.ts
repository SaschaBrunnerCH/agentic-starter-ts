import { describe, expect, it } from "vitest";
import { budgetKind, budgetProblems, totals } from "./bundle-budget.ts";

const limits = { javascript: 1000, css: 100, html: 50 };

describe("bundle budget", () => {
  it("sums built files by kind and ignores files without a budget", () => {
    expect(budgetKind("assets/index-abc.js")).toBe("javascript");
    expect(budgetKind("assets/logo.svg")).toBeUndefined();
    expect(
      totals([
        { path: "assets/a.js", gzipBytes: 600 },
        { path: "assets/b.mjs", gzipBytes: 300 },
        { path: "assets/a.css", gzipBytes: 80 },
        { path: "index.html", gzipBytes: 40 },
        { path: "assets/photo.png", gzipBytes: 9000 },
      ]),
    ).toEqual({ javascript: 900, css: 80, html: 40 });
  });

  it("refuses each kind over its limit, and only those", () => {
    expect(budgetProblems({ javascript: 1000, css: 100, html: 50 }, limits)).toEqual([]);
    expect(budgetProblems({ javascript: 1001, css: 0, html: 51 }, limits)).toEqual([
      "javascript is 1001 gzip bytes, above its budget of 1000",
      "html is 51 gzip bytes, above its budget of 50",
    ]);
  });
});
