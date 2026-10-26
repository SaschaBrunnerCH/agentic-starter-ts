import { requireDevelopmentPlatform } from "../shared/development-platform.ts";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import * as json from "../shared/json-shape.ts";

requireDevelopmentPlatform();

// On-demand acceptance, deliberately outside check:push and the unit-test inventory.
// Fixtures contain files from HEAD only: no original .git, worktree, origin or gh state.
if (process.env.STARTER_ADOPTION_FIXTURE === "true") {
  throw new Error("Adoption fixtures cannot launch another adoption check");
}
const root = resolve(import.meta.dirname, "../..");
const environment = {
  ...Object.fromEntries(
    Object.entries(process.env).filter(
      ([name]) => !name.startsWith("GIT_") && !name.startsWith("VITEST_"),
    ),
  ),
  STARTER_ADOPTION_FIXTURE: "true",
};
function run(cwd: string, command: string, args: readonly string[], expected = 0): string {
  console.log(
    `\n[${cwd === root ? "source" : cwd.split("/").at(-1)}] ${command} ${args.join(" ")}`,
  );
  const result = spawnSync(command, args, {
    cwd,
    env: environment,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
  process.stdout.write(result.stdout ?? "");
  process.stderr.write(result.stderr ?? "");
  if (result.error || result.status !== expected)
    throw new Error(`${command} ${args.join(" ")} exited ${result.status}; expected ${expected}`, {
      cause: result.error,
    });
  return result.stdout;
}
if (run(root, "git", ["status", "--porcelain"]).trim())
  throw new Error("Commit the intended adoption-check revision and start with a clean tree");
const revision = run(root, "git", ["rev-parse", "HEAD"]).trim();
const archive = spawnSync("git", ["archive", "--format=tar", revision], {
  cwd: root,
  env: environment,
  maxBuffer: 16 * 1024 * 1024,
});
if (archive.status !== 0) throw new Error("Cannot archive the committed starter");
const manifest = json.parseJson(
  readFileSync(join(root, "package.json"), "utf8"),
  json.object({
    dependencies: json.optional(json.record(json.string)),
    devDependencies: json.optional(json.record(json.string)),
  }),
  "package.json",
);
const dependencies = { ...manifest.dependencies, ...manifest.devDependencies };
const flavors = dependencies.react === undefined ? ["non-react"] : ["react", "non-react"];
const directory = mkdtempSync(join(tmpdir(), "starter-adoption-"));
try {
  for (const flavor of flavors) {
    const fixture = join(directory, flavor);
    const origin = join(directory, `${flavor}-origin.git`);
    mkdirSync(fixture);
    const unpack = spawnSync("tar", ["-xf", "-", "-C", fixture], { input: archive.stdout });
    if (unpack.status !== 0) throw new Error("Cannot unpack starter fixture");
    run(directory, "git", ["init", "--bare", "--initial-branch=main", origin]);
    run(fixture, "git", ["init", "--initial-branch=main"]);
    run(fixture, "git", ["config", "user.name", "Adoption fixture"]);
    run(fixture, "git", ["config", "user.email", "fixture@example.invalid"]);
    run(fixture, "git", ["add", "."]);
    run(fixture, "git", ["commit", "-m", "Initialize independent template fixture"]);
    run(fixture, "git", ["remote", "add", "origin", origin]);
    run(fixture, "git", ["push", "-u", "origin", "main"]);
    run(fixture, "pnpm", ["install", "--frozen-lockfile"]);
    run(fixture, "pnpm", ["check:push"]);

    const edit = (name: string, transform: (text: string) => string) => {
      const path = join(fixture, name);
      writeFileSync(path, transform(readFileSync(path, "utf8")));
    };
    edit("package.json", (text) => {
      const value = json.parseJson(text, json.record(json.anything), "package.json");
      value.name = `adopted-${flavor}`;
      return JSON.stringify(value, null, 2) + "\n";
    });
    edit(".github/CODEOWNERS", () => "# Fixture project owner\n* @example-owner\n");
    edit("index.html", (text) =>
      text
        .replace(/<title>.*<\/title>/u, `<title>Adopted ${flavor}</title>`)
        .replace(
          "Replace this description with one sentence about the application.",
          "A fixture application.",
        )
        .replace(
          /(<script\b[^>]*\bsrc=)["'][^"']+["']/u,
          `$1"/src/main.${flavor === "react" ? "tsx" : "ts"}"`,
        ),
    );
    edit(".github/labels.json", (text) => text.replace('"area:app"', '"area:product"'));
    edit(
      "README.md",
      () =>
        "# Adopted product\n\nSee [engineering](engineering/README.md) for development guidance.\n",
    );
    edit("CONTEXT.md", (text) =>
      text.replace(
        /## Product terms[\s\S]*/u,
        "## Product terms\n\nAn adopted fixture renders a greeting.\n",
      ),
    );
    // These are owned, disposable fixtures. Replace their application completely so
    // acceptance exercises inherited tools without requiring the starter demo to survive.
    for (const name of [
      "src",
      "e2e",
      "engineering/designs/blueprint-graphics-example.md",
      "engineering/diagrams/starter-example.png",
      "engineering/diagrams/starter-example.json",
      "engineering/diagrams/capture-starter.mjs",
    ]) {
      rmSync(join(fixture, name), { recursive: true, force: true });
    }
    edit("engineering/diagrams/README.md", (text) =>
      text
        .replace(/### Actual UI capture[\s\S]*?(?=## Review and maintenance)/u, "")
        .replace(/^.*#actual-ui-capture.*\n/gmu, ""),
    );
    edit("engineering/designs/README.md", (text) =>
      text.replace(/^- \[Blueprint graphics example\].*\n/mu, ""),
    );
    edit("vite.config.ts", (text) =>
      text
        .replace(/"src\/main\.tsx?"/gu, `"src/main.${flavor === "react" ? "tsx" : "ts"}"`)
        .replace(
          /        \/\/ Native canvas[\s\S]*?"src\/graphics\/\{GraphicsLab.tsx,webgl-renderer.ts,webgpu-renderer.ts\}",\n/u,
          "",
        ),
    );
    if (flavor === "non-react") {
      const packages = [
        "react",
        "react-dom",
        "@vitejs/plugin-react",
        "@types/react",
        "@types/react-dom",
      ].filter((name) => dependencies[name] !== undefined);
      if (packages.length > 0) run(fixture, "pnpm", ["remove", ...packages]);
      edit("vite.config.ts", (text) =>
        text.replace(/^import react from .+\n/mu, "").replace("  plugins: [react()],\n", ""),
      );
      edit("tsconfig.app.json", (text) => text.replace(',\n    "jsx": "react-jsx"', ""));
      edit(".oxlintrc.json", (text) =>
        text.replace(', "react", "jsx-a11y"', "").replace(/^    "react\/[^\n]+\n/gmu, ""),
      );
    }
    mkdirSync(join(fixture, "src"));
    mkdirSync(join(fixture, "e2e"));
    const files: Readonly<Record<string, string>> = {
      "src/greeting.ts":
        'export function greeting(name: string): string { return name.trim() ? `Hello, ${name}.` : "Hello."; }\n',
      "src/greeting.test.ts":
        'import { expect, it } from "vitest";\nimport { greeting } from "./greeting.ts";\nit("greets a name or a blank input", () => { expect(greeting("fixture")).toBe("Hello, fixture."); expect(greeting(" ")).toBe("Hello."); });\n',
      "e2e/smoke.spec.ts": readFileSync(join(root, "scripts/checks/adoption-smoke.txt"), "utf8"),
    };
    for (const [name, content] of Object.entries(files))
      writeFileSync(join(fixture, name), content);
    if (flavor === "react") {
      writeFileSync(
        join(fixture, "src/App.tsx"),
        'import { greeting } from "./greeting.ts";\nexport function App() { return <main><h1>{greeting("fixture")}</h1></main>; }\n',
      );
      writeFileSync(
        join(fixture, "src/App.test.tsx"),
        'import { renderToStaticMarkup } from "react-dom/server";\nimport { expect, it } from "vitest";\nimport { App } from "./App.tsx";\nit("renders the adopted application", () => { expect(renderToStaticMarkup(<App />)).toContain("Hello, fixture."); });\n',
      );
      writeFileSync(
        join(fixture, "src/main.tsx"),
        'import { createRoot } from "react-dom/client";\nimport { App } from "./App.tsx";\nconst element = document.getElementById("app");\nif (element === null) throw new Error("Missing app element");\ncreateRoot(element).render(<App />);\n',
      );
    } else {
      writeFileSync(
        join(fixture, "src/main.ts"),
        'import { greeting } from "./greeting.ts";\nconst app = document.querySelector<HTMLElement>("#app");\nif (app === null) throw new Error("Missing app element");\nconst main = document.createElement("main");\nconst heading = document.createElement("h1");\nheading.textContent = greeting("fixture");\nmain.append(heading);\napp.append(main);\n',
      );
    }
    run(fixture, "pnpm", ["format"]);
    run(fixture, "git", [
      "add",
      ".github/CODEOWNERS",
      ".github/labels.json",
      "package.json",
      "pnpm-lock.yaml",
      "index.html",
      "CONTEXT.md",
      "src",
      "e2e",
      "vite.config.ts",
      "tsconfig.app.json",
      ".oxlintrc.json",
      "README.md",
      "engineering",
    ]);
    run(fixture, "git", ["diff", "--cached", "--stat"]);
    run(fixture, "git", ["commit", "-m", `Personalize ${flavor} fixture`]);
    run(fixture, "git", ["rev-parse", "--verify", "origin/main"]);
    if (run(fixture, "git", ["rev-list", "--count", "main"]).trim() !== "2")
      throw new Error("Fixture inherited non-independent history");
    if (run(fixture, "git", ["status", "--porcelain"]).trim())
      throw new Error("Personalization left unstaged files");
    if (flavor === "non-react") {
      run(fixture, "git", ["ls-files", "--error-unmatch", "src/main.ts"]);
      if (run(fixture, "git", ["ls-files", "src/main.tsx"]).trim())
        throw new Error("Old entry point remained tracked");
    }
    run(fixture, "pnpm", ["install", "--frozen-lockfile"]);
    run(fixture, "pnpm", ["check:push"]);
    if (!existsSync(join(fixture, "dist/index.html")))
      throw new Error("Production build is missing");
    const html = readFileSync(join(fixture, "index.html"), "utf8");
    writeFileSync(
      join(fixture, "index.html"),
      html.replace(/\/src\/main\.tsx?/u, "/src/missing-entry.ts"),
    );
    const rejected = spawnSync("pnpm", ["build"], {
      cwd: fixture,
      env: environment,
      encoding: "utf8",
    });
    if (rejected.status === 0 || !(rejected.stdout + rejected.stderr).includes("missing-entry.ts"))
      throw new Error("Broken-entrypoint control did not fail for the intended cause");
    writeFileSync(join(fixture, "index.html"), html);
    console.log(
      `PASS ${flavor}: independent history/origin, frozen installation, personalization/staging, full gate/build and broken-entrypoint control`,
    );
  }
  console.log(
    `PASS adoption at ${revision}; local fixtures only, no hosted provisioning or browser/GPU acceptance`,
  );
} finally {
  rmSync(directory, { recursive: true, force: true });
}
