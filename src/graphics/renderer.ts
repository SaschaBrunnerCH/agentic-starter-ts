import type { pixelEvidence } from "./scene.ts";

export interface Renderer {
  identity: string;
  fallback: boolean;
  draw(
    vertices: Float32Array,
    read: boolean,
  ): Promise<ReturnType<typeof pixelEvidence> | undefined>;
  dispose(): void;
}
export const background = { r: 8 / 255, g: 21 / 255, b: 34 / 255, a: 1 };
