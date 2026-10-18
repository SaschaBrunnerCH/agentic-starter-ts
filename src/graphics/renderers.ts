import type { WebGpuCanvas } from "./webgpu.d.ts";
import { pixelEvidence } from "./scene.ts";

export interface Renderer {
  identity: string;
  fallback: boolean;
  draw(
    vertices: Float32Array,
    read: boolean,
  ): Promise<ReturnType<typeof pixelEvidence> | undefined>;
  dispose(): void;
}
const background = { r: 8 / 255, g: 21 / 255, b: 34 / 255, a: 1 };

export function webglRenderer(canvas: HTMLCanvasElement): Renderer {
  const gl = canvas.getContext("webgl2", {
    alpha: false,
    antialias: true,
    preserveDrawingBuffer: true,
  });
  if (!gl) throw new Error("WebGL2 is unavailable in this browser.");
  const shaders: WebGLShader[] = [];
  const program = gl.createProgram();
  const buffer = gl.createBuffer();
  try {
    for (const [kind, source] of [
      [
        gl.VERTEX_SHADER,
        "#version 300 es\nin vec2 position; in vec4 color; out vec4 ink; void main(){gl_Position=vec4(position,0.,1.);ink=color;}",
      ],
      [
        gl.FRAGMENT_SHADER,
        "#version 300 es\nprecision highp float; in vec4 ink; out vec4 pixel; void main(){pixel=ink;}",
      ],
    ] satisfies [number, string][]) {
      const shader = gl.createShader(kind);
      if (!shader) throw new Error("Cannot allocate a WebGL2 shader.");
      shaders.push(shader);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS))
        throw new Error(gl.getShaderInfoLog(shader) ?? "Shader compilation failed.");
      gl.attachShader(program, shader);
    }
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS))
      throw new Error(gl.getProgramInfoLog(program) ?? "Shader linking failed.");
  } catch (error) {
    for (const shader of shaders) gl.deleteShader(shader);
    gl.deleteProgram(program);
    gl.deleteBuffer(buffer);
    throw error;
  }
  gl.useProgram(program);
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  for (const [name, size, offset] of [
    ["position", 2, 0],
    ["color", 4, 8],
  ] satisfies [string, number, number][]) {
    const location = gl.getAttribLocation(program, name);
    gl.enableVertexAttribArray(location);
    gl.vertexAttribPointer(location, size, gl.FLOAT, false, 24, offset);
  }
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  const debug = gl.getExtension("WEBGL_debug_renderer_info");
  const identity: unknown = gl.getParameter(debug ? debug.UNMASKED_RENDERER_WEBGL : gl.RENDERER);
  return {
    identity: typeof identity === "string" ? identity : "Renderer identity unavailable",
    fallback: false,
    draw(vertices, read) {
      if (gl.isContextLost()) throw new Error("WebGL2 context lost. Reload to try again.");
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clearColor(background.r, background.g, background.b, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.DYNAMIC_DRAW);
      gl.drawArrays(gl.TRIANGLES, 0, vertices.length / 6);
      if (gl.getError() !== gl.NO_ERROR) throw new Error("WebGL2 could not draw the scene.");
      if (!read) return Promise.resolve(undefined);
      const pixels = new Uint8Array(canvas.width * canvas.height * 4);
      gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
      return Promise.resolve(pixelEvidence(pixels));
    },
    dispose() {
      gl.deleteBuffer(buffer);
      gl.deleteProgram(program);
      for (const shader of shaders) gl.deleteShader(shader);
    },
  };
}

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
      code: `
      struct Vertex { @builtin(position) position: vec4f, @location(0) color: vec4f }
      @vertex fn vertex(@location(0) position: vec2f, @location(1) color: vec4f) -> Vertex {
        return Vertex(vec4f(position, 0, 1), color);
      }
      @fragment fn fragment(input: Vertex) -> @location(0) vec4f { return input.color; }
    `,
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
        const encoder = device.createCommandEncoder();
        const pass = encoder.beginRenderPass({
          colorAttachments: [
            {
              view: texture.createView(),
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
