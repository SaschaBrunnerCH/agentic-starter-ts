import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import globalSetup from "./browser-gpu-setup.ts";

beforeEach(() => {
  for (const name of [
    "CI",
    "REMOTE_BROWSER_WS_ENDPOINT",
    "BROWSER_GPU",
    "BROWSER_GPU_PROFILE",
    "BROWSER_GPU_REPORT",
    "BROWSER_GPU_WS_ENDPOINT",
    "BROWSER_GPU_SETTING",
  ])
    vi.stubEnv(name, undefined);
});
afterEach(() => vi.unstubAllEnvs());

describe("the direct hardware invocation guard", () => {
  it("rejects an ordinary direct invocation until discovery supplies a profile", () => {
    expect(() => globalSetup()).toThrow("require discovery before worker configuration");
  });
  it("keeps CI functional by default but preserves an explicit requirement", () => {
    vi.stubEnv("CI", "true");
    expect(() => globalSetup()).not.toThrow();
    vi.stubEnv("BROWSER_GPU", "required");
    expect(() => globalSetup()).toThrow("require discovery");
  });
  it("accepts the parent's valid profile, and rejects malformed metadata", () => {
    vi.stubEnv(
      "BROWSER_GPU_PROFILE",
      JSON.stringify({ channel: "chrome", backend: "default", apis: ["webgl2"] }),
    );
    vi.stubEnv("BROWSER_GPU_REPORT", ".local/browser-gpu/run/report.json");
    vi.stubEnv("BROWSER_GPU_WS_ENDPOINT", "ws://127.0.0.1/owned-browser");
    expect(() => globalSetup()).not.toThrow();
    vi.stubEnv("BROWSER_GPU_PROFILE", "{}");
    expect(() => globalSetup()).toThrow();
  });
});
