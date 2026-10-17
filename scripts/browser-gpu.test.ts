import { delimiter, join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  classifyRenderer,
  describeOwner,
  findOnPath,
  freeDisplayNumber,
  gpuLaunchArgs,
  gpuSetting,
  lockDecision,
  rendererFailure,
  rendererNote,
  systemBrowser,
  tryVirtualDisplayNext,
  virtualDisplayEnvironment,
  judgeAdapter,
  webgpuFailure,
  webgpuSetting,
} from "./browser-gpu.ts";

describe("gpuSetting", () => {
  it("requires the GPU by default", () => {
    expect(gpuSetting({})).toBe("required");
    expect(gpuSetting({ BROWSER_GPU: "" })).toBe("required");
    expect(gpuSetting({ BROWSER_GPU: "required" })).toBe("required");
  });

  it("turns it off on request, in CI and for a remote browser", () => {
    expect(gpuSetting({ BROWSER_GPU: "off" })).toBe("off");
    expect(gpuSetting({ CI: "true" })).toBe("off");
    expect(gpuSetting({ CI: "true", BROWSER_GPU: "required" })).toBe("required");
    expect(gpuSetting({ REMOTE_BROWSER_WS_ENDPOINT: "ws://remote", BROWSER_GPU: "required" })).toBe(
      "required",
    );
    expect(() => gpuSetting({ CI: "true", BROWSER_GPU: "invalid" })).toThrow();
    expect(gpuSetting({ REMOTE_BROWSER_WS_ENDPOINT: "ws://127.0.0.1:9326/" })).toBe("off");
  });

  it("rejects an unknown value instead of guessing", () => {
    expect(() => gpuSetting({ BROWSER_GPU: "yes" })).toThrow(
      'BROWSER_GPU must be "required" or "off", not "yes".',
    );
  });
});

describe("classifyRenderer", () => {
  it.each([
    "ANGLE (Intel, Vulkan 1.4.318 (Intel(R) UHD Graphics 630 (CFL GT2) (0x00003E9B)), Intel open-source Mesa driver)",
    "ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0, D3D11)",
    "ANGLE (Apple, ANGLE Metal Renderer: Apple M2, Unspecified Version)",
    "Mesa Intel(R) UHD Graphics 630 (CFL GT2)",
  ])("counts %s as hardware", (renderer) => {
    expect(classifyRenderer(renderer)).toBe("hardware");
  });

  it.each([
    "ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)",
    "llvmpipe (LLVM 19.1.7, 256 bits)",
    "softpipe",
    "ANGLE (Mesa, lavapipe, Vulkan 1.3)",
    "ANGLE (Microsoft, Microsoft Basic Render Driver Direct3D11 vs_5_0 ps_5_0, D3D11)",
    "Google SwiftShader",
  ])("counts %s as software", (renderer) => {
    expect(classifyRenderer(renderer)).toBe("software");
  });

  it("cannot tell without a renderer", () => {
    expect(classifyRenderer(null)).toBe("unknown");
    expect(classifyRenderer(undefined)).toBe("unknown");
    expect(classifyRenderer("  ")).toBe("unknown");
    expect(classifyRenderer("WebKit WebGL")).toBe("unknown");
    expect(classifyRenderer("ANGLE generic renderer")).toBe("unknown");
    expect(classifyRenderer("NVIDIA WARP CPU")).toBe("software");
  });
});

describe("gpuLaunchArgs", () => {
  it("asks for ANGLE on Vulkan without a window surface on Linux", () => {
    expect(gpuLaunchArgs("linux")).toEqual([
      "--ignore-gpu-blocklist",
      "--enable-gpu",
      "--use-angle=vulkan",
      "--enable-features=Vulkan,VulkanFromANGLE",
      "--disable-vulkan-surface",
    ]);
  });

  it("keeps the platform's own backend elsewhere", () => {
    expect(gpuLaunchArgs("darwin")).toEqual(["--ignore-gpu-blocklist", "--enable-gpu"]);
    expect(gpuLaunchArgs("win32")).toEqual(["--ignore-gpu-blocklist", "--enable-gpu"]);
  });
});

describe("finding executables", () => {
  const path = ["/opt/bin", "/usr/bin"].join(delimiter);

  it("returns the first name found on PATH, directory by directory", () => {
    const present = new Set([join("/usr/bin", "chromium"), join("/opt/bin", "google-chrome")]);
    expect(findOnPath(["chromium", "google-chrome"], { PATH: path }, (p) => present.has(p))).toBe(
      join("/opt/bin", "google-chrome"),
    );
    expect(findOnPath(["Xvfb"], { PATH: path }, () => false)).toBeUndefined();
    expect(findOnPath(["Xvfb"], {}, () => true)).toBeUndefined();
  });

  it("prefers the configured browser, then a system Chromium", () => {
    expect(systemBrowser({ BROWSER_GPU_EXECUTABLE: "/x/chrome", PATH: path }, () => true)).toBe(
      "/x/chrome",
    );
    expect(
      systemBrowser({ BROWSER_GPU_EXECUTABLE: "", PATH: path }, (p) => p.endsWith("chromium")),
    ).toBe(join("/opt/bin", "chromium"));
    expect(systemBrowser({ PATH: path }, () => false)).toBeUndefined();
  });
});

describe("lockDecision", () => {
  const owner = { pid: 4242, directory: "/work/app", startedAt: "2026-10-15T07:00:00.000Z" };

  it("takes a free lock and one left by a process that is gone", () => {
    expect(lockDecision(undefined, () => true)).toBe("take");
    expect(lockDecision(owner, () => false)).toBe("take-stale");
  });

  it("is blocked by a living owner and names it", () => {
    expect(lockDecision(owner, (pid) => pid === 4242)).toBe("blocked");
    expect(describeOwner(owner)).toBe("process 4242 in /work/app, since 2026-10-15T07:00:00.000Z");
  });
});

describe("the virtual display", () => {
  it("is tried only on Linux with Xvfb, after headless did not reach the GPU", () => {
    expect(tryVirtualDisplayNext("linux", "software", true)).toBe(true);
    expect(tryVirtualDisplayNext("linux", "unknown", true)).toBe(true);
    expect(tryVirtualDisplayNext("linux", "hardware", true)).toBe(false);
    expect(tryVirtualDisplayNext("linux", "unknown", false)).toBe(false);
    expect(tryVirtualDisplayNext("darwin", "unknown", true)).toBe(false);
    expect(tryVirtualDisplayNext("win32", "software", true)).toBe(false);
  });

  it("takes the first number from 90 that no socket or lock file announces", () => {
    expect(freeDisplayNumber([])).toBe(90);
    expect(freeDisplayNumber(["X0", "X1", "X90", ".X91-lock", ".X11-unix", "X92-other"])).toBe(92);
    expect(freeDisplayNumber(["X5"], 5)).toBe(6);
  });

  it("points the browser at it and leaves the desktop session out", () => {
    expect(
      virtualDisplayEnvironment(
        {
          PATH: "/usr/bin",
          DISPLAY: ":0",
          WAYLAND_DISPLAY: "wayland-0",
          XDG_SESSION_TYPE: "wayland",
          HOME: undefined,
        },
        ":90",
      ),
    ).toEqual({ PATH: "/usr/bin", DISPLAY: ":90" });
  });
});

describe("rendererNote", () => {
  const wslRenderer = "D3D12 (NVIDIA GeForce RTX 3060 Laptop GPU)";

  it("marks a GPU reached through WSL", () => {
    expect(
      rendererNote({ WSL_DISTRO_NAME: "Ubuntu" }, "ANGLE (Microsoft, D3D12 (NVIDIA))"),
    ).toMatch(/^inside WSL/u);
    expect(rendererNote({}, wslRenderer)).toMatch(/^inside WSL/u);
  });

  it("marks a virtual machine's GPU", () => {
    expect(
      rendererNote(
        {},
        "ANGLE (Apple, ANGLE Metal Renderer: Apple Paravirtual device, Unspecified Version)",
      ),
    ).toMatch(/^a virtual machine/u);
    expect(rendererNote({}, "virgl (VirtIO-GPU)")).toMatch(/^a virtual machine/u);
  });

  it("says nothing for a native GPU or a software renderer", () => {
    expect(
      rendererNote({}, "ANGLE (Intel, Vulkan 1.4.318 (Intel(R) UHD Graphics 630))"),
    ).toBeUndefined();
    expect(
      rendererNote({ WSL_DISTRO_NAME: "Ubuntu" }, "llvmpipe (LLVM 19.1.7, 256 bits)"),
    ).toBeUndefined();
  });
});

describe("rendererFailure", () => {
  it("names the renderer and the saved report", () => {
    expect(rendererFailure("SwiftShader", ["test-results/gpu-report.txt"])).toBe(
      "BROWSER_GPU=required, but the browser draws with SwiftShader. The browser's GPU report is in test-results/gpu-report.txt; read it first. See engineering/agents/browser-gpu-discovery.md, or run with BROWSER_GPU=off.",
    );
  });

  it("says no WebGL, and leaves the report out when none was saved", () => {
    expect(rendererFailure(null, [])).toMatch(
      /^BROWSER_GPU=required, but the browser draws with no WebGL\. See/u,
    );
  });
});

describe("webgpuSetting", () => {
  it("is off unless required, and off wherever the GPU is not required", () => {
    expect(webgpuSetting({})).toBe("off");
    expect(webgpuSetting({ BROWSER_WEBGPU: "off" })).toBe("off");
    expect(webgpuSetting({ BROWSER_WEBGPU: "required" })).toBe("required");
    expect(webgpuSetting({ BROWSER_WEBGPU: "required", BROWSER_GPU: "off" })).toBe("off");
    expect(webgpuSetting({ BROWSER_WEBGPU: "required", CI: "true" })).toBe("off");
  });

  it("refuses other values", () => {
    expect(() => webgpuSetting({ BROWSER_WEBGPU: "yes" })).toThrow(/BROWSER_WEBGPU must be/u);
  });
});

describe("WebGPU in the launch flags and the message", () => {
  it("adds the WebGPU flag only when asked", () => {
    expect(gpuLaunchArgs("linux", true)).toContain("--enable-unsafe-webgpu");
    expect(gpuLaunchArgs("linux")).not.toContain("--enable-unsafe-webgpu");
  });

  it("says why and how to go on", () => {
    expect(webgpuFailure("the browser offers WebGPU but no adapter")).toBe(
      "BROWSER_WEBGPU=required, but the browser offers WebGPU but no adapter. See engineering/agents/browser-gpu-discovery.md, or run without BROWSER_WEBGPU.",
    );
  });
});

describe("judgeAdapter", () => {
  it("accepts a GPU adapter", () => {
    expect(judgeAdapter("intel gen-9 Intel(R) UHD Graphics 630", false)).toEqual({
      adapter: "intel gen-9 Intel(R) UHD Graphics 630",
      reason: null,
    });
  });

  it("refuses a fallback adapter and one that names a software renderer", () => {
    expect(judgeAdapter("google swiftshader", false)).toEqual({
      adapter: null,
      reason: "the only adapter draws on the CPU (google swiftshader)",
    });
    expect(judgeAdapter("mesa llvmpipe", false).adapter).toBeNull();
    expect(judgeAdapter("some vendor", true).adapter).toBeNull();
  });

  it("rejects an adapter without a known identity", () => {
    expect(judgeAdapter("", false).adapter).toBeNull();
    expect(judgeAdapter("some vendor", false).adapter).toBeNull();
  });
});
