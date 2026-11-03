import {
  expect,
  test as base,
  type ConsoleMessage,
  type Page,
  type Request,
  type Response,
} from "@playwright/test";

type ExpectedBrowserError = {
  kind: "console" | "pageerror" | "requestfailed" | "response";
  message: RegExp;
};

/** The automatic fixture's lifecycle, also exercised by real-browser controls. */
export async function withBrowserErrorChecks(
  page: Page,
  expected: readonly ExpectedBrowserError[],
  run: () => Promise<void>,
) {
  const remaining = [...expected];
  const unexpected: string[] = [];
  const record = (kind: ExpectedBrowserError["kind"], message: string) => {
    const match = remaining.findIndex(
      (error) =>
        error.kind === kind && new RegExp(error.message.source, error.message.flags).test(message),
    );
    if (match === -1) unexpected.push(`${kind}: ${message}`);
    else remaining.splice(match, 1);
  };
  const consoleError = (message: ConsoleMessage) => {
    if (message.type() === "error") record("console", message.text());
  };
  const pageError = (error: Error) => record("pageerror", error.message);
  const requestFailed = (request: Request) =>
    record(
      "requestfailed",
      `${request.method()} ${request.url()}: ${request.failure()?.errorText}`,
    );
  const responseError = (response: Response) => {
    if (response.status() >= 400)
      record("response", `${response.status()} ${response.request().method()} ${response.url()}`);
  };
  page.on("console", consoleError);
  page.on("pageerror", pageError);
  page.on("requestfailed", requestFailed);
  page.on("response", responseError);
  try {
    await run();
  } finally {
    page.off("console", consoleError);
    page.off("pageerror", pageError);
    page.off("requestfailed", requestFailed);
    page.off("response", responseError);
    expect(
      {
        unexpected,
        missingExpected: remaining.map((error) => `${error.kind}: ${error.message}`),
      },
      "Browser errors must match only the explicitly expected occurrences",
    ).toEqual({ unexpected: [], missingExpected: [] });
  }
}

export const test = base.extend<{
  expectedBrowserErrors: ExpectedBrowserError[];
  browserErrors: void;
}>({
  expectedBrowserErrors: [[], { option: true }],
  browserErrors: [
    async ({ page, expectedBrowserErrors }, run) => {
      await withBrowserErrorChecks(page, expectedBrowserErrors, () => run());
    },
    { auto: true },
  ],
});

export { expect } from "@playwright/test";
