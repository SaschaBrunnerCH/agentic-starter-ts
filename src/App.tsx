import { useId, useState } from "react";
import { greeting } from "./greeting.ts";

/** The starter application; replace it with the first real screen. */
export function App() {
  const [name, setName] = useState("agentic starter");
  const nameId = useId();
  return (
    <>
      <h1>{greeting(name)}</h1>
      <label htmlFor={nameId}>Name</label>
      <input
        id={nameId}
        value={name}
        autoComplete="off"
        onChange={(event) => setName(event.target.value)}
      />
    </>
  );
}
