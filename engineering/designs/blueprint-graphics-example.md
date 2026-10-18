# Blueprint graphics example

Accepted for the replaceable starter screen on 2026-10-18. This is an application example, not a graphics framework or a new deployment requirement.

## Behavior and rationale

Keep the editable greeting first. Below it, two labelled native-API panels draw the same schematic world: a navy background, cyan graticule and brighter coast outlines. The shared Globe / Flat map buttons make the two implementations comparable. A globe makes motion visible; a flat equirectangular view makes the underlying geometry recognizable. Coarse original outlines avoid a dataset download, attribution dependency or map service. They are deliberately unsuitable for geographical decisions.

The owner chose a blueprint style and slow spinning globe. A static triangle would require less code but demonstrate less about graphics applications. A 3D engine, detailed map dataset, textures, zoom and separate example route would increase adoption cost without helping this example. The two renderers use native shaders and no new dependency.

Globe rotation takes one minute per revolution. Pause freezes the shared clock; Resume continues from that orientation. Reduced motion starts paused and a change to reduced motion pauses it. A user may explicitly resume. Flat map stops rotation; returning to Globe leaves it paused. Hidden documents stop frame scheduling and freeze the clock; visibility restores the previous playing state. A page first loaded hidden starts its default rotation on becoming visible, unless reduced motion is requested. Resize and control changes redraw a paused scene once. Unmount cancels frames, disconnects observers/listeners and destroys native resources; asynchronous initialization disposes a renderer that arrives after unmount.

Each panel explains missing APIs, a missing adapter, initialization/rendering failure or device/context loss. A failed panel does not prevent the greeting, controls or other panel from working. There is no fallback illustration. The report links open the independent browser capability pages only when followed; the application sends no automatic requests to them. Adapter details identify the renderer without claiming physical hardware from API presence alone.

## Code ownership

`src/graphics/scene.ts` owns projections, shared colored line triangles, the rotation clock and pixel classification. Both APIs consume those exact vertices. CPU projection keeps the shader examples short; it is not a recommendation for large production datasets. `renderers.ts` owns shader compilation, buffers, canvas drawing/readback and resource destruction. `GraphicsLab.tsx` owns controls, canvas sizing, frame scheduling and readable status. `webgpu.d.ts` supplements the platform DOM library's missing canvas overload and runtime constants, without another package.

The two API implementations are intentionally separate. WebGPU uses a four-sample attachment resolved into the canvas so thin lines remain comparable with WebGL2's antialiasing; resizing and disposal destroy that attachment. Async initialization checks cancellation before configuring a canvas, so an old React StrictMode effect cannot overwrite its replacement. WebGL cleanup deletes the owned resources without deliberately losing the reusable canvas context. A general engine abstraction or separate package is unnecessary for an example that adopters can remove as one folder. The README lists the removal steps. Styling belongs to `src/app.css`; there are no remote fonts or assets.

## Verification contract

Unit tests measure projection geometry, aspect ratio, rotation/pause continuity and color classification. Native rendering and browser lifecycle code are excluded from Node coverage with an explicit reason in `vite.config.ts`; browser tests cover them instead. Existing coverage floors remain unchanged.

Browser evidence must include both native canvas readback and compositor screenshot pixels. WebGL2 reads the rendered canvas; WebGPU copies the actual current canvas texture into an aligned staging buffer in the same submission as the render pass. Readbacks run at initialization and view/size changes, not continuously. Counts must contain both grid and bright coast ink. `e2e/graphics-evidence.ts` independently decodes a canvas screenshot and asserts those colors were painted. API creation or a ready attribute alone cannot establish success.

The blank-frame control disables native draw calls and must fail the same output assertions. Failure-path tests deny the API/adapter/device and lose the WebGL context. Interaction tests cover reduced motion, pause/resume, projection changes and narrow layout; the existing greeting and axe checks remain required. These checks establish expected nonblank output, not pixel-identical cartographic accuracy, comprehensive accessibility or performance.

The 2026-10-18 axe diagnostic found no violations but marked some contrast checks incomplete over the decorative grid and canvases. A separate WCAG relative-luminance calculation against the grid's brightest intersection (both 20%-opacity lines over navy) gave a minimum 6.18:1 for the page text palette; the corrected divider exceeds 8:1 and is explicitly decorative. This supplements axe rather than establishing complete accessibility or non-text control contrast. The hidden-load regression was reproduced with the previous startup state, then passed after preserving the default rotation intent until first visibility.

Hardware acceptance additionally requires recognized actual application renderer/adapter identities, no fallback/software adapter, and successful pixel/paint checks. A Windows browser is native Windows evidence; a Linux browser on WSL D3D12 is translated evidence. Software CI output and emulated viewport results are functional evidence only. Missing APIs and untested systems remain unverified. Follow [GPU discovery](../agents/browser-gpu-discovery.md) and [browser testing](../agents/browser-testing.md), including the shared ownership lock and exact-process cleanup. The [capture guide](../diagrams/README.md#actual-ui-capture) records a specific screenshot separately from these acceptance claims.
