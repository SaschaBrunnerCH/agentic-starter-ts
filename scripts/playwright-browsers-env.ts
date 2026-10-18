// Node --import runs before the entrypoint and its static Playwright imports.
import { playwrightBrowsersPath } from "./playwright-browsers-path.ts";

process.env.PLAYWRIGHT_BROWSERS_PATH = playwrightBrowsersPath();
