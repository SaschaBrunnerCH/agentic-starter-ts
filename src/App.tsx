import { useId, useState } from "react";
import { greeting } from "./greeting.ts";
import { GraphicsLab } from "./graphics/GraphicsLab.tsx";
import "./app.css";

/** The starter application; replace it with the first real screen. */
export function App() {
  const [name, setName] = useState("agentic starter");
  const nameId = useId();
  return (
    <div className="app-shell">
      <header className="intro">
        <p className="eyebrow">
          <span aria-hidden="true">◎</span> AGENTIC STARTER{" "}
          <span className="eyebrow-divider">/</span> GRAPHICS LAB
        </p>
        <h1>{greeting(name)}</h1>
        <p className="intro-copy">A small starting point. A world of possibilities.</p>
        <div className="name-field">
          <label htmlFor={nameId}>Name</label>
          <input
            id={nameId}
            value={name}
            autoComplete="off"
            onChange={(event) => setName(event.target.value)}
          />
        </div>
      </header>
      <GraphicsLab />
      <footer className="app-footer">
        <span>BUILT TO BE REPLACED</span>
        <span>REACT · TYPESCRIPT · WEB GRAPHICS</span>
      </footer>
    </div>
  );
}
