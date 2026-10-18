// The decisions of `pnpm test:devices`, kept apart from Playwright and gh so they can
// be tested. See engineering/agents/browser-testing.md.

/** One run: a local Playwright project, or a farm device reached through an endpoint. */
export type Device = Readonly<{ name: string; project: string; endpoint?: string }>;

export type DeviceResult = Device & Readonly<{ passed: boolean; seconds: number }>;

export const reportMarker = "<!-- device-tests -->";

/** The projects of playwright.config.ts; a test keeps the two lists equal. */
export const projects = [
  "chromium",
  "firefox",
  "webkit",
  "mobile-chrome",
  "mobile-safari",
] as const;

/**
 * Farm devices from lines of "<name> <project> <endpoint>"; blank lines and lines
 * starting with # are skipped. Endpoints carry credentials, so an error names the
 * line number only.
 */
export function parseEndpoints(text: string, known: readonly string[]): Device[] {
  const devices: Device[] = [];
  for (const [index, line] of text.split("\n").entries()) {
    const trimmed = line.trim();
    if (trimmed === "" || trimmed.startsWith("#")) continue;
    const [name, project, endpoint, ...rest] = trimmed.split(/\s+/u);
    if (name === undefined || project === undefined || endpoint === undefined || rest.length > 0) {
      throw new Error(`Endpoint line ${index + 1}: expected "<name> <project> <endpoint>"`);
    }
    if (!known.includes(project)) {
      throw new Error(
        `Endpoint line ${index + 1}: unknown project "${project}"; use one of ${known.join(", ")}`,
      );
    }
    devices.push({ name, project, endpoint });
  }
  return devices;
}

/** The pull-request comment: what was tested, where, and each result. Endpoints are left out. */
export function renderReport(
  results: readonly DeviceResult[],
  context: Readonly<{ commit: string; target: string; machine: string; date: string }>,
): string {
  const passed = results.filter((result) => result.passed).length;
  return [
    reportMarker,
    `### Device tests: ${passed} of ${results.length} passed`,
    "",
    `Run on ${context.machine} on ${context.date}, not in CI, for commit ${context.commit} against ${context.target}.`,
    "",
    "| Device | Project | Result | Time |",
    "| --- | --- | --- | --- |",
    ...results.map(
      (result) =>
        `| ${result.name} | ${result.project} | ${result.passed ? "pass" : "**fail**"} | ${Math.round(result.seconds)} s |`,
    ),
    "",
    "Traces of failures stay on the machine that ran the tests, under `test-results/`.",
  ].join("\n");
}
