import { expect, it } from "vitest";
import { pagesInitializationNeeded } from "./pages-initialization.ts";

it("waits for Pages, main-only deployment and complete setup; preserves existing choices", () => {
  for (const pages of [false, true])
    for (const mainOnly of [false, true])
      for (const complete of [false, true]) {
        expect(pagesInitializationNeeded(undefined, pages, mainOnly, complete)).toBe(
          pages && mainOnly && complete,
        );
        expect(pagesInitializationNeeded("false", pages, mainOnly, complete)).toBe(false);
        expect(pagesInitializationNeeded("true", pages, mainOnly, complete)).toBe(false);
      }
});
