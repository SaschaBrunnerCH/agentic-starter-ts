import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

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
const directory = mkdtempSync(join(tmpdir(), "starter-adoption-"));
try {
  for (const flavor of ["react", "non-react"]) {
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
    edit("package.json", (text) =>
      text.replace('"name": "agentic-starter-ts"', `"name": "adopted-${flavor}"`),
    );
    edit(".github/CODEOWNERS", () => "# Fixture project owner\n* @example-owner\n");
    edit("index.html", (text) =>
      text
        .replace(/<title>.*<\/title>/u, `<title>Adopted ${flavor}</title>`)
        .replace(
          "Replace this description with one sentence about the application.",
          "A fixture application.",
        ),
    );
    if (
      !readFileSync(join(fixture, "index.html"), "utf8").includes(
        `<title>Adopted ${flavor}</title>`,
      )
    )
      throw new Error("HTML personalization did not apply");
    edit(".github/labels.json", (text) => text.replace('"area:app"', '"area:product"'));
    edit(
      "CONTEXT.md",
      (text) => text + "\nFixture product: an adopted application with an editable greeting.\n",
    );
    if (flavor === "non-react") {
      run(fixture, "pnpm", [
        "remove",
        "react",
        "react-dom",
        "@vitejs/plugin-react",
        "@types/react",
        "@types/react-dom",
      ]);
      for (const name of [
        "src/graphics",
        "src/App.tsx",
        "src/App.test.tsx",
        "src/App.interaction.test.tsx",
        "src/main.tsx",
        "src/app.css",
        "e2e/graphics.spec.ts",
        "e2e/graphics-evidence.ts",
        "engineering/designs/blueprint-graphics-example.md",
        "engineering/diagrams/starter-example.png",
        "engineering/diagrams/starter-example.json",
        "engineering/diagrams/capture-starter.mjs",
      ]) {
        rmSync(join(fixture, name), { recursive: true });
      }
      writeFileSync(
        join(fixture, "src/main.ts"),
        `import { greeting } from "./greeting.ts";\nconst app = document.querySelector<HTMLElement>("#app");\nif (app === null) throw new Error("Missing #app element");\nconst heading = document.createElement("h1");\nheading.textContent = greeting("agentic starter");\nconst label = document.createElement("label");\nlabel.textContent = "Name";\nlabel.htmlFor = "name";\nconst input = document.createElement("input");\ninput.id = "name";\ninput.value = "agentic starter";\ninput.addEventListener("input", () => { heading.textContent = greeting(input.value); });\napp.append(heading, label, input);\n`,
      );
      edit("index.html", (text) => text.replace("/src/main.tsx", "/src/main.ts"));
      edit("vite.config.ts", (text) =>
        text
          .replace(/^import react from .+\n/mu, "")
          .replace("  plugins: [react()],\n", "")
          .replace('"src/main.tsx"', '"src/main.ts"')
          .replace(
            /        \/\/ Native canvas[\s\S]*?"src\/graphics\/\{GraphicsLab.tsx,webgl-renderer.ts,webgpu-renderer.ts\}",\n/u,
            "",
          ),
      );
      edit("tsconfig.app.json", (text) => text.replace(',\n    "jsx": "react-jsx"', ""));
      edit(".oxlintrc.json", (text) => {
        // Use replacements to retain the supported existing JSON formatting.
        return text.replace(', "react", "jsx-a11y"', "").replace(/^    "react\/[^\n]+\n/gmu, "");
      });
      edit("README.md", (text) =>
        text.replace(/### Replace the example[\s\S]*?(?=### Without React)/u, ""),
      );
      edit("engineering/diagrams/README.md", (text) =>
        text
          .replace(/### Actual UI capture[\s\S]*?(?=## Review and maintenance)/u, "")
          .replace(/^.*#actual-ui-capture.*\n/gmu, ""),
      );
      edit("engineering/designs/README.md", (text) =>
        text.replace(/^- \[Blueprint graphics example\].*\n/mu, ""),
      );
      edit("CONTEXT.md", (text) =>
        text.replace(
          /## Product terms[\s\S]*/u,
          "## Product terms\n\nAn editable greeting demonstrates a small framework-free application.\n",
        ),
      );
      // The existing smoke checks exercise the same heading/name contract and axe
      // on the framework-free page too; their behavior does not depend on React.
      edit("e2e/smoke.spec.ts", (text) =>
        text.replace("the built application", "the adopted application"),
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
