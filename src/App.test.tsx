import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { App } from "./App.tsx";

// Rendered to HTML without a browser; the browser tests cover typing into it.
describe("App", () => {
  it("greets the starter and labels the name field", () => {
    const html = renderToStaticMarkup(<App />);
    expect(html).toContain("<h1>Hello, agentic starter.</h1>");
    const label = /<label for="([^"]+)">Name<\/label>/u.exec(html)?.[1];
    expect(label).toBeDefined();
    expect(html).toContain(`id="${label}"`);
  });
});
