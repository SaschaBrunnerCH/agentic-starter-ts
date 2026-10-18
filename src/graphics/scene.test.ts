import { describe, expect, it } from "vitest";
import { angleAt, pixelEvidence, sceneVertices } from "./scene.ts";

describe("shared scene geometry", () => {
  it("produces bounded complete colored triangles for both projections at every quarter turn", () => {
    for (const projection of ["globe", "map"] satisfies ("globe" | "map")[]) {
      for (const angle of [0, 90, 180, 270]) {
        const vertices = sceneVertices({ projection, angle, width: 800, height: 640 });
        expect(vertices.length % 18).toBe(0);
        expect(vertices.length).toBeGreaterThan(10000);
        let bright = 0;
        let dim = 0;
        for (let i = 0; i < vertices.length; i += 6) {
          expect(Math.abs(vertices[i] ?? Infinity)).toBeLessThan(1);
          expect(Math.abs(vertices[i + 1] ?? Infinity)).toBeLessThan(1);
          const color = vertices.slice(i + 2, i + 6);
          expect([...color].every((value) => value >= 0 && value <= 1)).toBe(true);
          if ((color[0] ?? 0) > 0.3) bright++;
          else dim++;
        }
        expect(bright).toBeGreaterThan(100);
        expect(dim).toBeGreaterThan(100);
      }
    }
  });
  it("rotates only the globe, hides its far side and preserves aspect ratio", () => {
    const scene = { projection: "globe", angle: 0, width: 800, height: 640 } as const;
    const globe = sceneVertices(scene);
    expect(sceneVertices({ ...scene, angle: 90 })).not.toEqual(globe);
    const flat = sceneVertices({ ...scene, projection: "map" });
    expect(sceneVertices({ ...scene, projection: "map", angle: 90 })).toEqual(flat);
    expect(flat.length).toBeGreaterThan(globe.length);
    // Measure the actual map bounds in pixels: equirectangular means 2:1.
    const xs = [...flat].filter((_, index) => index % 6 === 0);
    const ys = [...flat].filter((_, index) => index % 6 === 1);
    const ratio =
      ((Math.max(...xs) - Math.min(...xs)) * scene.width) /
      ((Math.max(...ys) - Math.min(...ys)) * scene.height);
    expect(ratio).toBeCloseTo(2, 1);
    const narrow = sceneVertices({ ...scene, width: 400 });
    expect(narrow.length).toBe(globe.length);
    expect(narrow[0]).toBeCloseTo((globe[0] ?? 0) * 2, 4);
    expect(narrow[1]).toBeCloseTo(globe[1] ?? 0, 4);
  });
});

it("makes one revolution per minute and freezes the rotation without a jump on resume", () => {
  const moving = { angle: 20, since: 1000, playing: true };
  expect(angleAt(moving, 31000)).toBe(200);
  expect(angleAt(moving, 61000)).toBe(20);
  expect(angleAt(moving, 0)).toBe(20);
  const paused = { angle: angleAt(moving, 31000), since: 31000, playing: false };
  expect(angleAt(paused, 100000)).toBe(200);
  expect(angleAt({ ...paused, since: 100000, playing: true }, 101000)).toBe(206);
});

it("distinguishes grid and coast ink from an empty background or unrelated colors", () => {
  expect(
    pixelEvidence(
      new Uint8Array([
        8, 21, 34, 255, 26, 102, 135, 255, 99, 232, 255, 255, 200, 20, 20, 255, 255, 255, 255, 255,
        0, 0, 0, 255,
      ]),
    ),
  ).toEqual({ grid: 1, coast: 1 });
  expect(pixelEvidence(new Uint8Array(400))).toEqual({ grid: 0, coast: 0 });
  expect(pixelEvidence(new Uint8Array([1, 2]))).toEqual({ grid: 0, coast: 0 });
  const backing = new Uint8Array([255, 255, 255, 255, 99, 232, 255, 255]);
  expect(pixelEvidence(backing.subarray(4))).toEqual({ grid: 0, coast: 1 });
});
