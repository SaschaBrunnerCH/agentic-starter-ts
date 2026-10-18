import { Children, isValidElement, type ReactNode } from "react";
import { expect, it, vi } from "vitest";
import { App } from "./App.tsx";

const state = vi.hoisted(() => ({ setName: vi.fn() }));
vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react")>()),
  useState: () => ["agentic starter", state.setName],
  useId: () => "name-field",
}));

type InputProps = {
  children?: ReactNode;
  onChange?: (event: { target: { value: string } }) => void;
};
function nameInput(node: ReactNode): InputProps | undefined {
  if (!isValidElement<InputProps>(node)) return undefined;
  if (node.type === "input") return node.props;
  return Children.toArray(node.props.children)
    .map(nameInput)
    .find((input) => input !== undefined);
}

// This checks the component's event-to-state wiring. React DOM event dispatch,
// typing and the updated heading remain covered by the real-browser smoke journey.
it("passes the name input value to its state setter", () => {
  const input = nameInput(App());
  expect(input?.onChange).toBeTypeOf("function");
  input?.onChange?.({ target: { value: "Ada" } });
  expect(state.setName).toHaveBeenCalledExactlyOnceWith("Ada");
});
