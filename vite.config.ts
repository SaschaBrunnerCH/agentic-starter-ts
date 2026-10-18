import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // Relative asset paths, so the same build works at the root of a domain and under
  // a sub-path such as /<repository>/ on GitHub Pages or /pr-12/ for a preview.
  base: "./",
  plugins: [react()],
  test: {
    include: ["src/**/*.test.{ts,tsx}", "scripts/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reportsDirectory: "coverage",
      reporter: ["text-summary", "html"],
      include: ["src/**/*.{ts,tsx}", "scripts/**/*.ts"],
      exclude: [
        "**/*.test.{ts,tsx}", // Test bodies are evidence, not production behaviour.
        "src/main.tsx", // The browser entry point; the browser tests cover it.
        // Commands that run git, gh, the network or a browser. Their decisions live in the
        // rule modules beside them, which are measured.
        "scripts/{issue,task,release,github,setup-github,setup-previews,install-hooks,pre-push,run-local-checks,test-devices,browser-gpu-setup,browser-gpu-discovery,browser-test,browser-test-cli,browser-doctor,playwright-browsers-env}.ts",
        "scripts/check-*.ts",
      ],
      // A floor, not a target: raise it when coverage rises, and lower it only
      // with a reason in the pull request.
      thresholds: { statements: 95, branches: 90, functions: 95, lines: 95 },
    },
  },
});
