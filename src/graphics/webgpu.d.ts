// The platform DOM library includes WebGPU interfaces but omits this overload
// and these runtime constants. Keep the small supplement next to the example.
export type WebGpuCanvas = GPUCanvasContext;
declare global {
  interface HTMLCanvasElement {
    getContext(contextId: "webgpu"): GPUCanvasContext | null;
  }
  const GPUTextureUsage: { readonly RENDER_ATTACHMENT: number; readonly COPY_SRC: number };
  const GPUBufferUsage: {
    readonly VERTEX: number;
    readonly COPY_DST: number;
    readonly MAP_READ: number;
  };
  const GPUMapMode: { readonly READ: number };
}
