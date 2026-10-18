export type Projection = "globe" | "map";
export interface Scene {
  projection: Projection;
  angle: number;
  width: number;
  height: number;
}

// Original, deliberately coarse outlines: a visual demo, not cartographic data.
const continents: (readonly [number, number])[][] = [
  [
    [-168, 66],
    [-150, 70],
    [-135, 60],
    [-125, 50],
    [-124, 40],
    [-112, 30],
    [-100, 20],
    [-88, 21],
    [-82, 9],
    [-77, 9],
    [-80, 25],
    [-66, 45],
    [-53, 50],
    [-60, 60],
    [-80, 63],
    [-95, 75],
    [-125, 73],
    [-145, 60],
    [-168, 66],
  ],
  [
    [-73, 59],
    [-48, 60],
    [-23, 76],
    [-40, 83],
    [-60, 80],
    [-73, 59],
  ],
  [
    [-81, 12],
    [-66, 10],
    [-50, 2],
    [-35, -7],
    [-40, -20],
    [-52, -35],
    [-68, -55],
    [-74, -43],
    [-70, -18],
    [-80, -4],
    [-81, 12],
  ],
  [
    [-17, 36],
    [0, 37],
    [12, 33],
    [33, 31],
    [43, 12],
    [51, 11],
    [42, -1],
    [35, -20],
    [20, -35],
    [12, -28],
    [10, -6],
    [-5, 5],
    [-17, 15],
    [-17, 36],
  ],
  [
    [-10, 36],
    [-9, 44],
    [0, 49],
    [10, 54],
    [5, 60],
    [20, 71],
    [35, 69],
    [50, 60],
    [65, 68],
    [100, 77],
    [140, 72],
    [178, 65],
    [160, 58],
    [145, 50],
    [140, 36],
    [125, 40],
    [120, 22],
    [108, 18],
    [105, 8],
    [98, 8],
    [95, 20],
    [80, 8],
    [70, 24],
    [55, 25],
    [42, 12],
    [35, 30],
    [28, 41],
    [15, 45],
    [12, 37],
    [6, 44],
    [-10, 36],
  ],
  [
    [112, -22],
    [115, -34],
    [132, -35],
    [145, -39],
    [154, -28],
    [146, -16],
    [137, -12],
    [130, -15],
    [121, -18],
    [112, -22],
  ],
  [
    [47, -13],
    [50, -16],
    [45, -26],
    [43, -21],
    [47, -13],
  ],
  [
    [130, -3],
    [145, -6],
    [151, -10],
    [141, -9],
    [130, -3],
  ],
  [
    [166, -35],
    [178, -39],
    [172, -46],
    [166, -45],
    [173, -40],
    [166, -35],
  ],
];
const radians = Math.PI / 180;
type Point = readonly [number, number, number];

function project(longitude: number, latitude: number, scene: Scene): Point {
  const aspect = scene.height / scene.width;
  if (scene.projection === "map") return [longitude / 200, (latitude / 100) * aspect, 1];
  const lon = (longitude + scene.angle) * radians;
  const lat = latitude * radians;
  const x = Math.cos(lat) * Math.sin(lon);
  const y = Math.sin(lat);
  const z = Math.cos(lat) * Math.cos(lon);
  const tilt = 12 * radians;
  return [
    x * 0.8 * aspect,
    (y * Math.cos(tilt) - z * Math.sin(tilt)) * 0.8,
    y * Math.sin(tilt) + z * Math.cos(tilt),
  ];
}

/** Identical line triangles go to both native APIs; no map service or graphics library. */
export function sceneVertices(scene: Scene): Float32Array {
  const vertices: number[] = [];
  const segment = (a: Point, b: Point, coast: boolean) => {
    if (a[2] < 0 || b[2] < 0) return;
    const dx = (b[0] - a[0]) * scene.width;
    const dy = (b[1] - a[1]) * scene.height;
    const length = Math.hypot(dx, dy);
    if (length < 0.001) return;
    const width = coast ? 1.45 : 0.75;
    const ox = ((-dy / length) * width) / scene.width;
    const oy = ((dx / length) * width) / scene.height;
    const color = coast ? [0.39, 0.91, 1, 1] : [0.1, 0.4, 0.53, 0.8];
    const corners: (readonly [number, number])[] = [
      [a[0] + ox, a[1] + oy],
      [a[0] - ox, a[1] - oy],
      [b[0] + ox, b[1] + oy],
      [b[0] + ox, b[1] + oy],
      [a[0] - ox, a[1] - oy],
      [b[0] - ox, b[1] - oy],
    ];
    for (const [x, y] of corners) {
      vertices.push(x, y, ...color);
    }
  };
  for (let lon = -180; lon <= 180; lon += 15) {
    for (let lat = -90; lat < 90; lat += 3)
      segment(project(lon, lat, scene), project(lon, lat + 3, scene), false);
  }
  for (let lat = -75; lat <= 75; lat += 15) {
    for (let lon = -180; lon < 180; lon += 3)
      segment(project(lon, lat, scene), project(lon + 3, lat, scene), false);
  }
  for (const outline of continents) {
    outline.reduce(([lon, lat], [nextLon, nextLat]) => {
      const steps = Math.ceil(Math.max(Math.abs(nextLon - lon), Math.abs(nextLat - lat)) / 2);
      for (let j = 0; j < steps; j++) {
        segment(
          project(lon + ((nextLon - lon) * j) / steps, lat + ((nextLat - lat) * j) / steps, scene),
          project(
            lon + ((nextLon - lon) * (j + 1)) / steps,
            lat + ((nextLat - lat) * (j + 1)) / steps,
            scene,
          ),
          true,
        );
      }
      return [nextLon, nextLat];
    });
  }

  // Globe limb; independent of the coastlines and the rotation.
  if (scene.projection === "globe") {
    for (let i = 0; i < 180; i++) {
      const a = (i * Math.PI) / 90;
      const b = ((i + 1) * Math.PI) / 90;
      segment(
        [(Math.cos(a) * 0.8 * scene.height) / scene.width, Math.sin(a) * 0.8, 1],
        [(Math.cos(b) * 0.8 * scene.height) / scene.width, Math.sin(b) * 0.8, 1],
        true,
      );
    }
  }
  return new Float32Array(vertices);
}

export interface Motion {
  angle: number;
  since: number;
  playing: boolean;
}
export function angleAt(motion: Motion, now: number): number {
  return (motion.angle + (motion.playing ? Math.max(0, now - motion.since) * 0.006 : 0)) % 360;
}

/** Counts colors from a real canvas readback, not an API-ready flag. */
export function pixelEvidence(pixels: Uint8Array): { grid: number; coast: number } {
  const data = new DataView(pixels.buffer, pixels.byteOffset, pixels.byteLength);
  let grid = 0;
  let coast = 0;
  for (let i = 0; i + 3 < pixels.length; i += 4) {
    const red = data.getUint8(i);
    const green = data.getUint8(i + 1);
    const blue = data.getUint8(i + 2);
    if (red > 65 && green > 160 && blue > 180 && blue > red * 1.5) coast++;
    else if (blue > 55 && green > 40 && blue > red * 1.5) grid++;
  }
  return { grid, coast };
}
