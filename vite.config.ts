import { coverageThresholds } from "./scripts/checks/coverage-thresholds.ts";
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
      reporter: ["text-summary", "html", "json-summary"],
      include: ["src/**/*.{ts,tsx}", "scripts/**/*.ts"],
      exclude: [
        "**/*.test.{ts,tsx}", // Test bodies are evidence, not production behaviour.
        "src/main.tsx", // The browser entry point; the browser tests cover it.
        // Native canvas/resource lifecycles need a browser. Geometry, clock and
        // pixel classification remain measured in scene.ts; e2e/graphics.spec.ts
        // checks both renderers, their painted output and unavailable paths.
        "src/graphics/{GraphicsLab.tsx,webgl-renderer.ts,webgpu-renderer.ts}",
        // Commands that run git, gh, the network or a browser. Their decisions live in the
        // rule modules beside them, which are measured.
        "scripts/workflow/{issue,task,init-local-artifacts}.ts",
        // OS/IPC command supervision is exercised by bounded real-process fixtures.
        // Protocol decisions remain measured in workload-rules.ts.
        "scripts/workflow/{workload,workload-runtime,workload-supervisor,workload-group}.ts",
        "scripts/setup/{setup-github,setup-previews}.ts",
        "scripts/release/release.ts",
        "scripts/shared/github.ts",
        "scripts/git/{install-hooks,pre-push,check-commit-message}.ts",
        "scripts/checks/{run-local-checks,check-*}.ts",
        "scripts/browser/{test-devices,browser-gpu-setup,browser-gpu-discovery,browser-test,browser-test-cli,browser-doctor,playwright-browsers-env,check-browser-environment}.ts",
      ],
      // A floor, not a target: raise it when coverage rises, and lower it only
      // with a reason in the pull request.
      thresholds: coverageThresholds,
    },
  },
});
