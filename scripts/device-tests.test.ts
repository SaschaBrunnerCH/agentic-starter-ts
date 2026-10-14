import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  parseEndpoints,
  projects as allProjects,
  renderReport,
  reportMarker,
} from "./device-tests.ts";

it("lists the projects of playwright.config.ts", () => {
  const config = readFileSync(resolve(import.meta.dirname, "../playwright.config.ts"), "utf8");
  expect([...config.matchAll(/\{ name: "([^"]+)"/gu)].map((match) => match[1])).toEqual([
    ...allProjects,
  ]);
});

const projects = ["chromium", "webkit", "mobile-chrome"];

describe("parseEndpoints", () => {
  it("reads one device per line and skips comments and blank lines", () => {
    expect(
      parseEndpoints(
        "# farm\n\nwindows-edge chromium wss://a?key=secret\n  pixel   mobile-chrome  wss://b \n",
        projects,
      ),
    ).toEqual([
      { name: "windows-edge", project: "chromium", endpoint: "wss://a?key=secret" },
      { name: "pixel", project: "mobile-chrome", endpoint: "wss://b" },
    ]);
  });

  it("refuses a malformed line or an unknown project without printing the endpoint", () => {
    expect(() => parseEndpoints("only-a-name\n", projects)).toThrow("line 1");
    expect(() => parseEndpoints("x chromium wss://a extra\n", projects)).toThrow("line 1");
    const error = (() => {
      try {
        parseEndpoints("ok chromium wss://a\nx safari wss://secret-key\n", projects);
      } catch (caught) {
        return caught instanceof Error ? caught.message : "";
      }
      return "";
    })();
    expect(error).toContain('line 2: unknown project "safari"');
    expect(error).not.toContain("secret-key");
  });
});

describe("renderReport", () => {
  it("summarises the results without endpoints", () => {
    const report = renderReport(
      [
        { name: "firefox", project: "firefox", passed: true, seconds: 4.4 },
        {
          name: "pixel",
          project: "mobile-chrome",
          endpoint: "wss://secret",
          passed: false,
          seconds: 12,
        },
      ],
      { commit: "abc1234", target: "the local build", machine: "Linux x64", date: "2026-10-14" },
    );
    expect(report.startsWith(reportMarker)).toBe(true);
    expect(report).toContain("1 of 2 passed");
    expect(report).toContain("| firefox | firefox | pass | 4 s |");
    expect(report).toContain("| pixel | mobile-chrome | **fail** | 12 s |");
    expect(report).toContain("commit abc1234 against the local build");
    expect(report).not.toContain("wss://secret");
  });
});
