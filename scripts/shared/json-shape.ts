// Checks parsed JSON against the shape a script uses, so a changed or missing field
// fails where it is read, with its path, instead of later with an unrelated error.
// Each shape is a type guard: a value that passes has the type, without an assertion.

/** Checks a value; on failure records the first problem with its path. */
export type Shape<T> = (value: unknown, path: string, problems: string[]) => value is T;
/** The type a shape checks. */
export type ShapeOf<S> = S extends Shape<infer T> ? T : never;

type OptionalShape<T> = Shape<T | undefined> & { readonly optional: true };
type Fields = Readonly<Record<string, Shape<unknown>>>;
type Required<F extends Fields> = {
  [K in keyof F as F[K] extends { optional: true } ? never : K]: ShapeOf<F[K]>;
};
type Optional<F extends Fields> = {
  [K in keyof F as F[K] extends { optional: true } ? K : never]?: ShapeOf<F[K]>;
};
type ObjectOf<F extends Fields> = Required<F> & Optional<F>;

function describe(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "an array";
  return typeof value === "string" ? `the string ${JSON.stringify(value)}` : typeof value;
}

function expect(ok: boolean, expected: string, value: unknown, path: string, problems: string[]) {
  if (!ok)
    problems.push(`${path || "the top level"}: expected ${expected}, got ${describe(value)}`);
  return ok;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export const string = (value: unknown, path: string, problems: string[]): value is string =>
  expect(typeof value === "string", "a string", value, path, problems);

export const number = (value: unknown, path: string, problems: string[]): value is number =>
  expect(typeof value === "number", "a number", value, path, problems);

export const boolean = (value: unknown, path: string, problems: string[]): value is boolean =>
  expect(typeof value === "boolean", "a boolean", value, path, problems);

/** Any value, kept as unknown for code that inspects it itself. */
export const anything = (_value: unknown, _path: string, _problems: string[]): _value is unknown =>
  true;

export function nullable<T>(shape: Shape<T>): Shape<T | null> {
  return (value, path, problems): value is T | null =>
    value === null || shape(value, path, problems);
}

/** A field that may be absent. Only meaningful inside `object`. */
export function optional<T>(shape: Shape<T>): OptionalShape<T> {
  return Object.assign(
    (value: unknown, path: string, problems: string[]): value is T | undefined =>
      value === undefined || shape(value, path, problems),
    { optional: true as const },
  );
}

export function array<T>(shape: Shape<T>): Shape<T[]> {
  return (value, path, problems): value is T[] => {
    if (!Array.isArray(value)) return expect(false, "an array", value, path, problems);
    return value.every((item: unknown, index) => shape(item, `${path}[${index}]`, problems));
  };
}

/** An object with string keys whose values all have one shape. */
export function record<T>(shape: Shape<T>): Shape<Record<string, T>> {
  return (value, path, problems): value is Record<string, T> => {
    if (!isRecord(value)) return expect(false, "an object", value, path, problems);
    return Object.entries(value).every(([key, item]) => shape(item, `${path}.${key}`, problems));
  };
}

/** An object with these fields; fields it has beyond them are allowed and not checked. */
export function object<F extends Fields>(fields: F): Shape<ObjectOf<F>> {
  return (value, path, problems): value is ObjectOf<F> => {
    if (!isRecord(value)) return expect(false, "an object", value, path, problems);
    return Object.entries(fields).every(([name, shape]) =>
      shape(value[name], `${path}.${name}`, problems),
    );
  };
}

/** Parses JSON and checks its shape; `source` names where the text came from. */
export function parseJson<T>(text: string, shape: Shape<T>, source: string): T {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error(`${source} did not return JSON: ${text.slice(0, 200)}`);
  }
  const problems: string[] = [];
  if (!shape(value, "", problems)) {
    throw new Error(`${source} returned unexpected JSON at ${problems[0] ?? "the top level"}`);
  }
  return value;
}
