import { Script } from "node:vm";
import { describe, expect, it, vi } from "vitest";
import { GRAPHICS_PROBE } from "./browser-gpu-probe.ts";
import * as json from "./json-shape.ts";

type Probe = (input: { apis: string[]; webgpuFeatureLevel?: string }) => Promise<unknown>;
function isProbe(value: unknown): value is Probe {
  return typeof value === "function";
}

async function runProbe(
  level?: string,
  pixel = [64, 128, 191, 255],
  available = true,
  fallback = false,
) {
  const buffer = {
    mapAsync: vi.fn(async () => {}),
    getMappedRange: () => new Uint8Array(pixel).buffer,
    unmap: vi.fn(),
    destroy: vi.fn(),
  };
  const texture = { createView: () => ({}), destroy: vi.fn() };
  const encoder = {
    beginRenderPass: vi.fn((_descriptor: unknown) => ({ end: vi.fn() })),
    copyTextureToBuffer: vi.fn(),
    finish: () => ({}),
  };
  const device = {
    createTexture: () => texture,
    createBuffer: () => buffer,
    createCommandEncoder: () => encoder,
    queue: { submit: vi.fn() },
    destroy: vi.fn(),
  };
  const requestAdapter = vi.fn(async (_options: unknown) =>
    available
      ? {
          info: { vendor: "nvidia", architecture: "test", isFallbackAdapter: fallback },
          requestDevice: async () => device,
        }
      : null,
  );
  // Execute the production browser expression with controlled API boundaries;
  // no browser, driver or claimed physical hardware is supplied by this unit test.
  const expression: unknown = new Script(GRAPHICS_PROBE).runInNewContext({
    navigator: { gpu: { requestAdapter } },
    GPUTextureUsage: { RENDER_ATTACHMENT: 1, COPY_SRC: 2 },
    GPUBufferUsage: { COPY_DST: 1, MAP_READ: 2 },
    GPUMapMode: { READ: 1 },
    Uint8Array,
  });
  if (!isProbe(expression)) throw new Error("Expected the browser probe function");
  const raw = await expression({
    apis: ["webgpu"],
    ...(level === undefined ? {} : { webgpuFeatureLevel: level }),
  });
  const results = json.parseJson(
    JSON.stringify(raw),
    json.array(
      json.object({
        api: json.string,
        identity: json.nullable(json.string),
        fallback: json.boolean,
        work: json.boolean,
        reason: json.nullable(json.string),
      }),
    ),
    "Controlled probe",
  );
  return { results, requestAdapter, device, texture, buffer, encoder };
}

describe("WebGPU feature-level requests and real probe decisions", () => {
  it.each([undefined, "core", "compatibility"])(
    "requests %s without changing the readback contract",
    async (level) => {
      const probe = await runProbe(level);
      expect(probe.requestAdapter).toHaveBeenCalledWith({ featureLevel: level ?? "core" });
      expect(probe.results).toEqual([
        { api: "webgpu", identity: "nvidia test", fallback: false, work: true, reason: null },
      ]);
      expect(probe.encoder.beginRenderPass).toHaveBeenCalledWith(
        expect.objectContaining({
          colorAttachments: [
            expect.objectContaining({
              clearValue: { r: 0.25, g: 0.5, b: 0.75, a: 1 },
              loadOp: "clear",
              storeOp: "store",
            }),
          ],
        }),
      );
      expect(probe.encoder.copyTextureToBuffer).toHaveBeenCalledOnce();
      expect(probe.device.queue.submit).toHaveBeenCalledOnce();
      expect(probe.buffer.mapAsync).toHaveBeenCalledOnce();
      expect(probe.buffer.destroy).toHaveBeenCalledOnce();
      expect(probe.texture.destroy).toHaveBeenCalledOnce();
      expect(probe.device.destroy).toHaveBeenCalledOnce();
    },
  );
  it("fails a wrong pixel in compatibility mode despite a hardware identity", async () => {
    const probe = await runProbe("compatibility", [255, 0, 0, 255]);
    expect(probe.results[0]).toMatchObject({
      identity: "nvidia test",
      work: false,
      reason: "submission/readback mismatch",
    });
    expect(probe.device.destroy).toHaveBeenCalledOnce();
  });
  it("retains no-adapter and fallback failures in compatibility mode", async () => {
    expect((await runProbe("compatibility", undefined, false)).results[0]).toMatchObject({
      identity: null,
      work: false,
      reason: "no adapter",
    });
    expect((await runProbe("compatibility", undefined, true, true)).results[0]).toMatchObject({
      fallback: true,
      work: true,
    });
  });
});
