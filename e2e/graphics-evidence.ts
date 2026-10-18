import assert from "node:assert/strict";
import type { Locator } from "@playwright/test";

/** Check both API readback and the browser compositor's actual painted canvas. */
export async function assertPainted(canvas: Locator) {
  assert.equal(await canvas.getAttribute("data-state"), "ready");
  const readback = {
    grid: Number(await canvas.getAttribute("data-grid")),
    coast: Number(await canvas.getAttribute("data-coast")),
  };
  assert.ok(readback.grid > 100, "Native readback must contain graticule ink");
  assert.ok(readback.coast > 30, "Native readback must contain coastline ink");
  const screenshot = await canvas.screenshot();
  const painted = await canvas.evaluate(
    async (element, bytes) => {
      const bitmap = await createImageBitmap(
        new Blob([new Uint8Array(bytes)], { type: "image/png" }),
      );
      const image = element.ownerDocument.createElement("canvas");
      image.width = bitmap.width;
      image.height = bitmap.height;
      const context = image.getContext("2d");
      if (!context) throw new Error("Cannot inspect the painted screenshot.");
      context.drawImage(bitmap, 0, 0);
      bitmap.close();
      const pixels = context.getImageData(0, 0, image.width, image.height).data;
      let grid = 0;
      let coast = 0;
      for (let i = 0; i < pixels.length; i += 4) {
        const r = pixels[i] ?? 0;
        const g = pixels[i + 1] ?? 0;
        const b = pixels[i + 2] ?? 0;
        if (r > 65 && g > 160 && b > 180 && b > r * 1.5) coast++;
        else if (b > 55 && g > 40 && b > r * 1.5) grid++;
      }
      return { grid, coast };
    },
    [...screenshot],
  );
  assert.ok(
    painted.grid > 100,
    `Painted canvas must contain graticule ink (found ${painted.grid})`,
  );
  assert.ok(
    painted.coast > 30,
    `Painted canvas must contain coastline ink (found ${painted.coast})`,
  );
  return {
    readback,
    painted,
    renderer: await canvas.getAttribute("data-renderer"),
    fallback: await canvas.getAttribute("data-fallback"),
  };
}
