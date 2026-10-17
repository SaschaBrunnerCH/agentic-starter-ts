import { describe, expect, it } from "vitest";
import {
  browserCandidates,
  candidateProfiles,
  chromiumSelection,
  profileLaunchOptions,
  readProfile,
  requiredApis,
  writeProfile,
} from "./browser-gpu-profile.ts";

describe("required graphics APIs", () => {
  it("keeps the default and legacy contract, while allowing WebGPU alone", () => {
    expect(requiredApis({})).toEqual(["webgl"]);
    expect(requiredApis({ BROWSER_WEBGPU: "required" })).toEqual(["webgl", "webgpu"]);
    expect(requiredApis({ BROWSER_GPU_APIS: "webgpu" })).toEqual(["webgpu"]);
    expect(
      requiredApis({ BROWSER_GPU_APIS: "webgl2, webgl2", BROWSER_WEBGPU: "required" }),
    ).toEqual(["webgl2", "webgpu"]);
    expect(requiredApis({ BROWSER_GPU_APIS: "webgpu", BROWSER_WEBGPU: "required" })).toEqual([
      "webgpu",
    ]);
    expect(() => requiredApis({ BROWSER_GPU_APIS: "" })).toThrow("BROWSER_GPU_APIS");
    expect(() => requiredApis({ BROWSER_GPU_APIS: "webgl3" })).toThrow("BROWSER_GPU_APIS");
  });
});

describe("installed browser inventory", () => {
  it("respects an explicit executable without replacing it", () => {
    expect(browserCandidates("linux", { BROWSER_GPU_EXECUTABLE: "/chosen" }, () => true)).toEqual([
      { executablePath: "/chosen" },
    ]);
  });
  it("retains other installed Linux browsers in order, deduplicating PATH", () => {
    const paths = new Set(["/a/google-chrome", "/b/chromium"]);
    expect(browserCandidates("linux", { PATH: "/a:/b:/a:" }, (path) => paths.has(path))).toEqual([
      { executablePath: "/a/google-chrome" },
      { executablePath: "/b/chromium" },
    ]);
    expect(browserCandidates("linux", {}, () => false)).toEqual([
      { channel: "chrome" },
      { channel: "msedge" },
    ]);
  });
  it("recognizes Windows paths independent of the test driver's OS", () => {
    const paths = new Set([
      "C:\\bin\\chrome.exe",
      "C:\\Apps\\Microsoft\\Edge\\Application\\msedge.exe",
    ]);
    expect(
      browserCandidates(
        "win32",
        {
          Path: "C:\\bin;",
          ProgramFiles: "C:\\Apps",
          "PROGRAMFILES(X86)": "",
          LOCALAPPDATA: "C:\\Users\\test",
        },
        (path) => paths.has(path),
      ),
    ).toEqual([
      { executablePath: "C:\\bin\\chrome.exe" },
      { executablePath: "C:\\Apps\\Microsoft\\Edge\\Application\\msedge.exe" },
    ]);
    expect(browserCandidates("win32", {}, () => false)).toHaveLength(2);
  });
  it("recognizes applications installed on macOS", () => {
    expect(browserCandidates("darwin", {}, (path) => path.includes("Google Chrome.app"))).toEqual([
      { executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" },
    ]);
  });
});

describe("bounded platform candidates and worker launch profile", () => {
  const browser = { executablePath: "/chosen/chrome" };
  it("keeps native defaults and alternative Linux APIs separate", () => {
    expect(candidateProfiles("win32", {}, [browser]).map((profile) => profile.backend)).toEqual([
      "default",
    ]);
    expect(candidateProfiles("darwin", {}, [browser]).map((profile) => profile.backend)).toEqual([
      "default",
    ]);
    expect(candidateProfiles("linux", {}, [browser]).map((profile) => profile.backend)).toEqual([
      "default",
      "gl",
      "vulkan",
    ]);
    expect(
      candidateProfiles("linux", { WSL_INTEROP: "present" }, [browser]).map(
        (profile) => profile.backend,
      ),
    ).toEqual(["default", "wsl-d3d12", "vulkan", "gl"]);
    expect(candidateProfiles("linux", { WSL_DISTRO_NAME: "test" }, [browser])).toHaveLength(4);
    expect(() => candidateProfiles("freebsd", {}, [browser])).toThrow("not supported");
  });
  it("round trips the selected executable, API, backend and private display exactly", () => {
    const profile = {
      browser,
      backend: "wsl-d3d12",
      apis: ["webgl2"],
      display: ":99",
    } satisfies Parameters<typeof writeProfile>[0];
    const worker = readProfile(writeProfile(profile));
    expect(worker).toEqual(profile);
    const env = {
      PATH: "/bin",
      DISPLAY: ":0",
      WAYLAND_DISPLAY: "wayland-0",
      XDG_SESSION_TYPE: "wayland",
    };
    const launch = profileLaunchOptions(worker, env);
    expect(launch).toEqual(profileLaunchOptions(profile, env));
    expect(launch.executablePath).toBe(browser.executablePath);
    expect(launch.headless).toBe(false);
    expect(launch.env).toEqual({
      PATH: "/bin",
      DISPLAY: ":99",
      MESA_LOADER_DRIVER_OVERRIDE: "d3d12",
    });
    expect(launch.args).toContain("--use-angle=gl");
    expect(launch.args).not.toContain("--use-angle=vulkan");
    expect(env.WAYLAND_DISPLAY).toBe("wayland-0");
  });
  it("uses the same isolated environment for headless candidates", () => {
    const profiles = candidateProfiles("linux", { BROWSER_GPU_APIS: "webgpu" }, [
      { channel: "chrome" },
    ]);
    const launch = profileLaunchOptions(readProfile(writeProfile(profiles[0]!)), {
      WAYLAND_DISPLAY: "session",
    });
    expect(launch.channel).toBe("chrome");
    expect(launch.headless).toBe(true);
    expect(launch.env).toEqual({ DISPLAY: "" });
    expect(launch.args).toContain("--enable-unsafe-webgpu");
    expect(profileLaunchOptions(profiles[1]!, {}).args).toContain("--use-angle=gl");
    expect(profileLaunchOptions(profiles[2]!, {}).args).toContain("--use-angle=vulkan");
  });
  it("refuses malformed profiles rather than launching different settings", () => {
    for (const data of [
      "{}",
      JSON.stringify({ channel: "chrome", backend: "bad", apis: [] }),
      JSON.stringify({ channel: "chrome", backend: "default", apis: ["bad"] }),
      JSON.stringify({ channel: "chrome", backend: "default", apis: [] }),
      JSON.stringify({
        channel: "chrome",
        executablePath: "/x",
        backend: "default",
        apis: ["webgl"],
      }),
      JSON.stringify({ backend: "default", apis: ["webgl"] }),
    ])
      expect(() => readProfile(data)).toThrow();
  });
  it("identifies Chromium selections without treating Firefox as hardware-probed", () => {
    expect(chromiumSelection([])).toBe(true);
    expect(chromiumSelection(["--project", "chromium", "mobile-chrome", "--grep", "name"])).toBe(
      true,
    );
    expect(chromiumSelection(["--project=mobile-chrome"])).toBe(true);
    expect(chromiumSelection(["--project=mobile-*"])).toBe(true);
    expect(chromiumSelection(["--project", "firefox", "--project=webkit"])).toBe(false);
  });
});
