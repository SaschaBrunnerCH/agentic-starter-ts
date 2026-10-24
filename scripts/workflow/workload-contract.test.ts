import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, it } from "vitest";
import * as json from "../shared/json-shape.ts";

const scripts = json.parseJson(
  readFileSync(resolve(import.meta.dirname, "../../package.json"), "utf8"),
  json.object({ scripts: json.record(json.string) }),
  "package.json",
).scripts;
const browser = new Set(["test:browser", "test:devices", "browser:doctor", "browser:cli"]);
const participants = ["test", "build", "check:push", "check:adoption", ...browser];
const preload = "node --import ./scripts/browser/playwright-browsers-env.ts ";
const runner = "scripts/workflow/workload.ts run --label ";

function problems(commands: Readonly<Record<string, string>>) {
  return participants.filter((name) => {
    const [launch, child] = (commands[name] ?? "").split(" -- ");
    // Only cache initialization precedes the reservation; browser discovery runs inside it.
    const prefix = browser.has(name) ? preload : "node ";
    return (
      !launch?.startsWith(prefix + runner) ||
      !child ||
      (browser.has(name) && !child.startsWith(preload))
    );
  });
}

it("reserves every participating entrypoint before its command or browser GPU discovery", () => {
  expect(problems(scripts)).toEqual([]);
});

it("rejects a removed wrapper at each supported entrypoint", () => {
  for (const name of participants) {
    const child = scripts[name]?.split(" -- ")[1] ?? "";
    expect(problems({ ...scripts, [name]: child })).toContain(name);
  }
});

it("rejects GPU/browser startup before the reservation and missing inner cache initialization", () => {
  for (const name of browser) {
    expect(
      problems({
        ...scripts,
        [name]: preload + "scripts/browser/browser-test.ts -- pnpm workload run",
      }),
    ).toContain(name);
    expect(
      problems({
        ...scripts,
        [name]: preload + runner + "browser -- node scripts/browser/browser-test.ts",
      }),
    ).toContain(name);
  }
});
