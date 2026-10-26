export type Option = Readonly<{ name: string; color: string; description: string }>;

export const statusOptions: readonly Option[] = [
  { name: "Backlog", color: "GRAY", description: "Accepted, not next or not ready to start" },
  { name: "Ready", color: "BLUE", description: "Specified, unblocked, can be claimed" },
  { name: "In progress", color: "YELLOW", description: "Being implemented or validated" },
  { name: "In review", color: "PURPLE", description: "Pull request awaits merge authorization" },
  { name: "Blocked", color: "RED", description: "Paused by a dependency or decision" },
  { name: "Done", color: "GREEN", description: "Closed with acceptance criteria satisfied" },
];
// A new Project starts with "Todo"; keep its item values when it becomes "Backlog".
const statusAliases: Readonly<Record<string, string>> = { todo: "Backlog" };

export const priorityOptions: readonly Option[] = [
  { name: "P0", color: "RED", description: "Done first" },
  { name: "P1", color: "ORANGE", description: "Next" },
  { name: "P2", color: "GRAY", description: "When nothing above it is available" },
];

export const views: readonly (readonly [name: string, layout: string, filter: string])[] = [
  ["Ready", "TABLE_LAYOUT", "is:open status:Ready -label:epic"],
  ["Current work", "TABLE_LAYOUT", 'is:open status:"In progress","In review"'],
  ["Decisions", "TABLE_LAYOUT", "is:open label:decision-needed"],
  ["Blocked", "TABLE_LAYOUT", "is:open status:Blocked"],
  ["Epics", "TABLE_LAYOUT", "is:open label:epic"],
  ["Backlog", "TABLE_LAYOUT", "is:open status:Backlog"],
  ["Board", "BOARD_LAYOUT", "is:open"],
];

export function canonical(name: string): string {
  return (statusAliases[name.toLowerCase()] ?? name).toLowerCase();
}
