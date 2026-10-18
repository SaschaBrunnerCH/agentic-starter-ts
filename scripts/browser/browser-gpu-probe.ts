// Browser-side probes are strings because command scripts deliberately have no DOM globals.
export const GRAPHICS_PROBE = `(async ({ apis, webgpuFeatureLevel = "core" }) => {
  const results = [];
  for (const api of apis) {
    try {
      if (api !== "webgpu") {
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = 1;
        const gl = canvas.getContext(api, { preserveDrawingBuffer: true });
        if (!gl) { results.push({ api, identity: null, fallback: false, work: false, reason: "no context" }); continue; }
        const info = gl.getExtension("WEBGL_debug_renderer_info");
        const identity = String(gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER));
        gl.clearColor(0.25, 0.5, 0.75, 1);
        gl.clear(gl.COLOR_BUFFER_BIT);
        const pixel = new Uint8Array(4);
        gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
        const work = Math.abs(pixel[0] - 64) <= 1 && Math.abs(pixel[1] - 128) <= 1 && Math.abs(pixel[2] - 191) <= 1 && pixel[3] === 255 && gl.getError() === gl.NO_ERROR;
        gl.getExtension("WEBGL_lose_context")?.loseContext();
        results.push({ api, identity, fallback: false, work, reason: work ? null : "draw/readback mismatch" });
        continue;
      }
      if (!navigator.gpu) { results.push({ api, identity: null, fallback: false, work: false, reason: "navigator.gpu is missing" }); continue; }
      const adapter = await navigator.gpu.requestAdapter({ featureLevel: webgpuFeatureLevel });
      if (!adapter) { results.push({ api, identity: null, fallback: false, work: false, reason: "no adapter" }); continue; }
      const info = adapter.info ?? {};
      const identity = [info.vendor, info.architecture, info.device, info.description].filter(Boolean).join(" ");
      const fallback = info.isFallbackAdapter ?? adapter.isFallbackAdapter;
      const device = await adapter.requestDevice();
      try {
        const texture = device.createTexture({ size: [1, 1], format: "rgba8unorm", usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC });
        const readback = device.createBuffer({ size: 256, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
        try {
          const encoder = device.createCommandEncoder();
          const pass = encoder.beginRenderPass({ colorAttachments: [{ view: texture.createView(), clearValue: { r: 0.25, g: 0.5, b: 0.75, a: 1 }, loadOp: "clear", storeOp: "store" }] });
          pass.end();
          encoder.copyTextureToBuffer({ texture }, { buffer: readback, bytesPerRow: 256 }, [1, 1]);
          device.queue.submit([encoder.finish()]);
          await readback.mapAsync(GPUMapMode.READ);
          const pixel = new Uint8Array(readback.getMappedRange().slice(0, 4));
          const work = Math.abs(pixel[0] - 64) <= 1 && Math.abs(pixel[1] - 128) <= 1 && Math.abs(pixel[2] - 191) <= 1 && pixel[3] === 255;
          readback.unmap();
          results.push({ api, identity, fallback: fallback !== false, work, reason: fallback === undefined ? "fallback status unavailable" : work ? null : "submission/readback mismatch" });
        } finally { readback.destroy(); texture.destroy(); }
      } finally { device.destroy(); }
    } catch (error) { results.push({ api, identity: null, fallback: false, work: false, reason: String(error) }); }
  }
  return results;
})`;
