import { useEffect, useId, useRef, useState } from "react";
import { angleAt, sceneVertices, type Motion, type Projection } from "./scene.ts";
import type { Renderer } from "./renderer.ts";
import { webglRenderer } from "./webgl-renderer.ts";
import { webgpuRenderer } from "./webgpu-renderer.ts";

type Api = "WebGL2" | "WebGPU";
interface View {
  projection: Projection;
  motion: Motion;
}

function GraphicsPanel({ api, view }: { api: Api; view: View }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const current = useRef(view);
  const refresh = useRef<(() => void) | undefined>(undefined);
  const [status, setStatus] = useState("Preparing the renderer…");
  const [identity, setIdentity] = useState("");
  const titleId = useId();
  const statusId = useId();

  useEffect(() => {
    current.current = view;
    refresh.current?.();
  }, [view]);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    let stopped = false;
    let failed = false;
    let frame = 0;
    let last = -Infinity;
    let needsRead = true;
    let drawing = false;
    let renderer: Renderer | undefined;
    const initialization = new AbortController();
    const fail = (message: string) => {
      if (stopped || failed) return;
      failed = true;
      cancelAnimationFrame(frame);
      canvas.dataset.state = "unavailable";
      setStatus(message);
    };
    const schedule = () => {
      cancelAnimationFrame(frame);
      if (!stopped && !failed && !document.hidden) frame = requestAnimationFrame(draw);
    };
    const draw = async (now: number) => {
      if (stopped || failed || !renderer || drawing) return;
      const { projection, motion } = current.current;
      const animated = projection === "globe" && motion.playing;
      if (!needsRead && animated && now - last < 32) {
        schedule();
        return;
      }
      drawing = true;
      const read = needsRead;
      needsRead = false;
      try {
        const width = Math.max(
          1,
          Math.round(canvas.clientWidth * Math.min(window.devicePixelRatio, 2)),
        );
        const height = Math.max(
          1,
          Math.round(canvas.clientHeight * Math.min(window.devicePixelRatio, 2)),
        );
        if (canvas.width !== width || canvas.height !== height) {
          canvas.width = width;
          canvas.height = height;
        }
        const pixels = await renderer.draw(
          sceneVertices({ projection, angle: angleAt(motion, now), width, height }),
          read,
        );
        if (stopped || failed) return;
        last = now;
        canvas.dataset.frames = String(Number(canvas.dataset.frames ?? "0") + 1);
        if (pixels) {
          canvas.dataset.grid = String(pixels.grid);
          canvas.dataset.coast = String(pixels.coast);
          if (pixels.grid < 100 || pixels.coast < 30)
            throw new Error(`${api} produced an empty or incomplete frame. Reload to try again.`);
          canvas.dataset.state = "ready";
          canvas.dataset.projection = projection;
          setStatus("Rendering live · original schematic outlines");
        }
      } catch (error) {
        fail(error instanceof Error ? error.message : `${api} could not render.`);
      } finally {
        drawing = false;
      }
      if (needsRead || (current.current.projection === "globe" && current.current.motion.playing))
        schedule();
    };
    const redraw = () => {
      needsRead = true;
      if (!drawing) schedule();
    };
    refresh.current = redraw;
    const resize = new ResizeObserver(redraw);
    resize.observe(canvas);
    document.addEventListener("visibilitychange", redraw);
    const contextLost = (event: Event) => {
      event.preventDefault();
      fail("WebGL2 context lost. Reload to try again.");
    };
    canvas.addEventListener("webglcontextlost", contextLost);
    void (async () => {
      try {
        const created =
          api === "WebGL2"
            ? webglRenderer(canvas)
            : await webgpuRenderer(canvas, fail, initialization.signal);
        if (stopped) {
          created.dispose();
          return;
        }
        renderer = created;
        canvas.dataset.renderer = created.identity;
        canvas.dataset.fallback = String(created.fallback);
        setIdentity(created.identity + (created.fallback ? " · fallback adapter" : ""));
        redraw();
      } catch (error) {
        fail(error instanceof Error ? error.message : `${api} could not start.`);
      }
    })();
    return () => {
      stopped = true;
      initialization.abort();
      cancelAnimationFrame(frame);
      refresh.current = undefined;
      resize.disconnect();
      document.removeEventListener("visibilitychange", redraw);
      canvas.removeEventListener("webglcontextlost", contextLost);
      renderer?.dispose();
    };
  }, [api]);

  return (
    <section className="graphics-panel" aria-labelledby={titleId}>
      <header className="panel-header">
        <h2 id={titleId}>{api}</h2>
        <span className="panel-tag">NATIVE API</span>
      </header>
      <div className="canvas-frame">
        <span className="coordinate coordinate-top" aria-hidden="true">
          {view.projection === "globe" ? "ORTHOGRAPHIC / 12°" : "EQUIRECTANGULAR / 2:1"}
        </span>
        <canvas
          ref={canvasRef}
          aria-label={`${api} blueprint ${view.projection === "globe" ? "globe" : "flat map"}`}
          aria-describedby={statusId}
          width="800"
          height="640"
        >
          A schematic world drawn with {api}. The status below reports whether rendering is
          available.
        </canvas>
        <span className="coordinate coordinate-bottom" aria-hidden="true">
          15° GRATICULE <span>LOCAL GEOMETRY</span>
        </span>
      </div>
      <output className="render-status" id={statusId}>
        {status}
      </output>
      {identity && (
        <details className="adapter">
          <summary>Renderer details</summary>
          <p>{identity}</p>
        </details>
      )}
      <a
        className="report-link"
        href={api === "WebGPU" ? "https://webgpureport.org" : "https://webglreport.com/?v=2"}
      >
        {api === "WebGPU" ? "WebGPU report" : "WebGL2 report"}
        <span aria-hidden="true"> ↗</span>
      </a>
    </section>
  );
}

/** Replaceable native-graphics example; both panels share the view and animation clock. */
export function GraphicsLab() {
  const [view, setView] = useState<View>(() => ({
    projection: "globe",
    motion: {
      angle: -20,
      since: performance.now(),
      playing:
        typeof window !== "undefined" &&
        !window.matchMedia("(prefers-reduced-motion: reduce)").matches &&
        !document.hidden,
    },
  }));
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    let resume = !media.matches;
    const reduce = () => {
      if (media.matches) {
        resume = false;
        setView((value) => ({
          ...value,
          motion: {
            angle: angleAt(value.motion, performance.now()),
            since: performance.now(),
            playing: false,
          },
        }));
      }
    };
    const visibility = () => {
      setView((value) => {
        if (document.hidden) resume = value.motion.playing;
        return {
          ...value,
          motion: {
            angle: angleAt(value.motion, performance.now()),
            since: performance.now(),
            playing: !document.hidden && resume,
          },
        };
      });
    };
    media.addEventListener("change", reduce);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      media.removeEventListener("change", reduce);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, []);
  function selectProjection(projection: Projection) {
    setView((value) => ({
      projection,
      motion: {
        angle: angleAt(value.motion, performance.now()),
        since: performance.now(),
        playing: projection === "globe" && value.motion.playing,
      },
    }));
  }
  return (
    <div className="graphics-lab">
      <div className="lab-toolbar">
        <fieldset className="projection-controls">
          <legend className="sr-only">World projection</legend>
          <button
            type="button"
            aria-pressed={view.projection === "globe"}
            onClick={() => selectProjection("globe")}
          >
            Globe
          </button>
          <button
            type="button"
            aria-pressed={view.projection === "map"}
            onClick={() => selectProjection("map")}
          >
            Flat map
          </button>
        </fieldset>
        <button
          className="motion-control"
          type="button"
          disabled={view.projection === "map"}
          onClick={() =>
            setView((value) => ({
              ...value,
              motion: {
                angle: angleAt(value.motion, performance.now()),
                since: performance.now(),
                playing: !value.motion.playing,
              },
            }))
          }
        >
          <span aria-hidden="true">{view.motion.playing ? "Ⅱ" : "▷"}</span>{" "}
          {view.motion.playing ? "Pause rotation" : "Resume rotation"}
        </button>
      </div>
      <div className="panels">
        <GraphicsPanel api="WebGL2" view={view} />
        <GraphicsPanel api="WebGPU" view={view} />
      </div>
      <p className="lab-note">
        One world. Two native renderers. <span>Switch the projection to compare them.</span>
      </p>
    </div>
  );
}
