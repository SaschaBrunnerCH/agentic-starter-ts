import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("the built application loads and shows its content", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });

  // Relative to the base URL, which may be a sub-path such as /<repository>/.
  await page.goto("./");

  const heading = page.getByRole("heading", { level: 1 });
  await expect(heading).toHaveText("Hello, agentic starter.");

  // React handles input: the heading follows the name field.
  await page.getByLabel("Name").fill("Ada");
  await expect(heading).toHaveText("Hello, Ada.");
  expect(errors).toEqual([]);
});

test("the built application has no accessibility violations axe can find", async ({ page }) => {
  await page.goto("./");
  await expect(page.getByRole("main")).toBeVisible();

  // WCAG 2.2 A and AA rules. axe finds about half of all issues; keyboard use,
  // focus order and meaning still need a person.
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(results.violations.map((violation) => `${violation.id}: ${violation.help}`)).toEqual([]);
});
