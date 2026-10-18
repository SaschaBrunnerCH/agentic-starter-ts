// Vitest applies global floors to every measured file, including files matched by
// these groups. Each group must also pass independently so one cannot mask the other.
const floor = { statements: 95, branches: 90, functions: 95, lines: 95 };
export const coverageThresholds = { ...floor, "src/**": { ...floor }, "scripts/**": { ...floor } };
