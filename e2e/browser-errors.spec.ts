import type { Page } from "@playwright/test";
import { expect, test, withBrowserErrorChecks } from "./fixtures.ts";

test.describe("automatic fixture teardown", () => {
  test.use({
    expectedBrowserErrors: [{ kind: "console", message: /^afterEach console control$/u }],
  });
  test.afterEach(async ({ page }) => {
    await page.evaluate(() => console.error("afterEach console control"));
  });
  test("observes an expected error emitted after the test body", async ({ page }) => {
    await expect(page.locator("body")).toHaveCount(1);
  });
});

// Exercise the same setup/teardown used by the automatic fixture on an isolated
// page, so a deliberately rejected guard does not fail the outer control test.
test.describe("browser error guard controls", () => {
  let control: Page;
  test.beforeEach(async ({ browser }) => {
    control = await browser.newPage();
  });
  test.afterEach(async () => {
    await control.close();
  });

  test("a clean page and a successful request pass", async () => {
    await control.route("https://browser-errors.invalid/**", (route) =>
      route.fulfill({ body: "ok", contentType: "text/plain" }),
    );
    await withBrowserErrorChecks(control, [], async () => {
      await control.goto("https://browser-errors.invalid/ok");
      await expect(control.locator("body")).toHaveText("ok");
    });
  });

  test("console errors after the main assertions fail teardown", async () => {
    await expect(
      withBrowserErrorChecks(control, [], async () => {
        await expect(control.locator("body")).toHaveCount(1);
        await control.evaluate(() => console.error("late console control"));
      }),
    ).rejects.toThrow("late console control");
  });

  test("uncaught page errors fail teardown", async () => {
    await expect(
      withBrowserErrorChecks(control, [], async () => {
        const error = control.waitForEvent("pageerror");
        await control.evaluate(() => {
          setTimeout(() => {
            throw new Error("uncaught page control");
          }, 0);
        });
        await error;
      }),
    ).rejects.toThrow("uncaught page control");
  });

  test("failed requests fail teardown", async () => {
    await control.route("https://browser-errors.invalid/aborted", (route) => route.abort());
    await expect(
      withBrowserErrorChecks(control, [], async () => {
        const failed = control.waitForEvent("requestfailed");
        await control.goto("https://browser-errors.invalid/aborted").catch(() => undefined);
        await failed;
      }),
    ).rejects.toThrow("requestfailed");
  });

  for (const status of [404, 503]) {
    test(`HTTP ${status} fails teardown`, async () => {
      await control.route("https://browser-errors.invalid/status", (route) =>
        route.fulfill({ status, body: "deliberate HTTP control", contentType: "text/plain" }),
      );
      await expect(
        withBrowserErrorChecks(control, [], async () => {
          await control.goto("https://browser-errors.invalid/status");
        }),
      ).rejects.toThrow(`response: ${status} GET https://browser-errors.invalid/status`);
    });
  }

  test("one narrow exception permits its deliberate error", async () => {
    await withBrowserErrorChecks(
      control,
      [{ kind: "console", message: /^deliberate console control$/u }],
      async () => {
        await control.evaluate(() => console.error("deliberate console control"));
      },
    );
  });

  test("an exception does not hide an unrelated error", async () => {
    await expect(
      withBrowserErrorChecks(
        control,
        [{ kind: "console", message: /^deliberate console control$/u }],
        async () => {
          await control.evaluate(() => {
            console.error("deliberate console control");
            console.error("unrelated console control");
          });
        },
      ),
    ).rejects.toThrow("unrelated console control");
  });

  test("an exception permits only one occurrence", async () => {
    await expect(
      withBrowserErrorChecks(
        control,
        [{ kind: "console", message: /^deliberate console control$/u }],
        async () => {
          await control.evaluate(() => {
            console.error("deliberate console control");
            console.error("deliberate console control");
          });
        },
      ),
    ).rejects.toThrow("deliberate console control");
  });

  test("an exception must actually occur", async () => {
    await expect(
      withBrowserErrorChecks(
        control,
        [{ kind: "pageerror", message: /^missing deliberate error$/u }],
        () => Promise.resolve(),
      ),
    ).rejects.toThrow("missing deliberate error");
  });

  test("a clean guard preserves a failure from the test body", async () => {
    await expect(
      withBrowserErrorChecks(control, [], () => Promise.reject(new Error("body failed"))),
    ).rejects.toThrow("body failed");
  });
});
