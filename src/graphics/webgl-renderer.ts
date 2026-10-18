import { background, type Renderer } from "./renderer.ts";
import { pixelEvidence } from "./scene.ts";
import vertexShader from "./shaders/world.vert.glsl?raw";
import fragmentShader from "./shaders/world.frag.glsl?raw";

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
      [gl.VERTEX_SHADER, vertexShader],
      [gl.FRAGMENT_SHADER, fragmentShader],
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
