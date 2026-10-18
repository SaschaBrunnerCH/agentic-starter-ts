import type { WebGpuCanvas } from "./webgpu.d.ts";
import { background, type Renderer } from "./renderer.ts";
import { pixelEvidence } from "./scene.ts";
import worldShader from "./shaders/world.wgsl?raw";

export async function webgpuRenderer(
  canvas: HTMLCanvasElement,
  lost: (message: string) => void,
  signal: AbortSignal,
): Promise<Renderer> {
  signal.throwIfAborted();
  if (!navigator.gpu)
    throw new Error("WebGPU is unavailable in this browser. Try a browser with WebGPU enabled.");
  const adapter = await navigator.gpu.requestAdapter();
  signal.throwIfAborted();
  if (!adapter)
    throw new Error("No WebGPU adapter is available. Your browser or device may disable it.");
  const device = await adapter.requestDevice();
  let disposed = false;
  void device.lost.then((info) => {
    if (!disposed) lost(`WebGPU device lost: ${info.message || info.reason}. Reload to try again.`);
  });
  device.addEventListener("uncapturederror", (event) => lost(`WebGPU: ${event.error.message}`));
  try {
    signal.throwIfAborted();
    const context: WebGpuCanvas | null = canvas.getContext("webgpu");
    if (!context) throw new Error("Cannot create a WebGPU canvas context.");
    const format = navigator.gpu.getPreferredCanvasFormat();
    const shader = device.createShaderModule({
      code: worldShader,
    });
    const compilation = await shader.getCompilationInfo();
    if (compilation.messages.some((message) => message.type === "error"))
      throw new Error("WebGPU shader compilation failed.");
    const pipeline = await device.createRenderPipelineAsync({
      layout: "auto",
      vertex: {
        module: shader,
        entryPoint: "vertex",
        buffers: [
          {
            arrayStride: 24,
            attributes: [
              { shaderLocation: 0, offset: 0, format: "float32x2" },
              { shaderLocation: 1, offset: 8, format: "float32x4" },
            ],
          },
        ],
      },
      fragment: {
        module: shader,
        entryPoint: "fragment",
        targets: [
          {
            format,
            blend: {
              color: { srcFactor: "src-alpha", dstFactor: "one-minus-src-alpha" },
              alpha: { srcFactor: "one", dstFactor: "one-minus-src-alpha" },
            },
          },
        ],
      },
      primitive: { topology: "triangle-list" },
      multisample: { count: 4 },
    });
    // Configure only after async initialization and cancellation checks. An old
    // StrictMode effect must never overwrite the replacement effect's canvas.
    signal.throwIfAborted();
    context.configure({
      device,
      format,
      alphaMode: "opaque",
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
    });
    let buffer: GPUBuffer | undefined;
    let multisample: GPUTexture | undefined;
    return {
      identity:
        [
          adapter.info.vendor,
          adapter.info.architecture,
          adapter.info.device,
          adapter.info.description,
        ]
          .filter(Boolean)
          .join(" · ") || "Adapter identity unavailable",
      fallback: adapter.info.isFallbackAdapter,
      async draw(vertices, read) {
        if (!buffer || buffer.size < vertices.byteLength) {
          buffer?.destroy();
          buffer = device.createBuffer({
            size: vertices.byteLength,
            usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
          });
        }
        device.queue.writeBuffer(buffer, 0, vertices);
        const texture = context.getCurrentTexture();
        if (
          !multisample ||
          multisample.width !== canvas.width ||
          multisample.height !== canvas.height
        ) {
          multisample?.destroy();
          multisample = device.createTexture({
            size: { width: canvas.width, height: canvas.height },
            format,
            sampleCount: 4,
            usage: GPUTextureUsage.RENDER_ATTACHMENT,
          });
        }
        const encoder = device.createCommandEncoder();
        const pass = encoder.beginRenderPass({
          colorAttachments: [
            {
              view: multisample.createView(),
              resolveTarget: texture.createView(),
              clearValue: background,
              loadOp: "clear",
              storeOp: "store",
            },
          ],
        });
        pass.setPipeline(pipeline);
        pass.setVertexBuffer(0, buffer);
        pass.draw(vertices.length / 6);
        pass.end();
        const row = Math.ceil((canvas.width * 4) / 256) * 256;
        const height = canvas.height;
        const width = canvas.width;
        const staging = read
          ? device.createBuffer({
              size: row * height,
              usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
            })
          : undefined;
        if (staging)
          encoder.copyTextureToBuffer(
            { texture },
            { buffer: staging, bytesPerRow: row },
            { width, height },
          );
        device.queue.submit([encoder.finish()]);
        if (!staging) return undefined;
        try {
          await staging.mapAsync(GPUMapMode.READ);
          const source = new Uint8Array(staging.getMappedRange());
          const pixels = new Uint8Array(width * height * 4);
          for (let y = 0; y < height; y++)
            pixels.set(source.subarray(y * row, y * row + width * 4), y * width * 4);
          if (format === "bgra8unorm") {
            for (let i = 0; i < pixels.length; i += 4) {
              const blue = pixels[i] ?? 0;
              pixels[i] = pixels[i + 2] ?? 0;
              pixels[i + 2] = blue;
            }
          }
          return pixelEvidence(pixels);
        } finally {
          staging.destroy();
        }
      },
      dispose() {
        disposed = true;
        buffer?.destroy();
        multisample?.destroy();
        context.unconfigure();
        device.destroy();
      },
    };
  } catch (error) {
    disposed = true;
    device.destroy();
    throw error;
  }
}
