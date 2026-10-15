# AI tools

Which AI tools may work in this repository, and how that list changes.

## Approved agents

| Agent          | Reads its rules from                                                         |
| -------------- | ---------------------------------------------------------------------------- |
| GitHub Copilot | `.github/copilot-instructions.md`, a pointer, and `AGENTS.md`                |
| OpenAI Codex   | `AGENTS.md`                                                                  |
| Claude Code    | `CLAUDE.md`, a pointer to `AGENTS.md`                                        |
| Gemini CLI     | `.gemini/settings.json`, set to `AGENTS.md`                                  |
| Pi             | `AGENTS.md`                                                                  |
| Hermes Agent   | `AGENTS.md`; a `.hermes.md` would take its place, so the repository has none |

Each works with the access of the account it runs under and with the data rules of [data handling](data-handling.md). Pi and Hermes Agent send the work to whichever model provider they are set up with; that provider's data terms are the ones that apply. Another agent is added by an issue that names it, its provider's data terms and how it reads `AGENTS.md`; `pnpm check:agents` then needs its pointer file registered.

## Skills

A skill is a saved procedure an agent follows when a person names it. The repository has two:

| Skill    | Does                                                                                                                                                     | Claude Code             | Codex                   |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- | ----------------------- |
| `review` | A read-only [review by a second agent](review.md) of a pull request or commit, with confirmed findings and what could be simpler                         | `/review [pr]`          | `$review [pr]`          |
| `issue`  | Turns a rough goal or an existing epic into complete issues, ordered with blockers and "Touches", shown as drafts and created only after the owner's yes | `/issue <goal or epic>` | `$issue <goal or epic>` |

Each skill lives once, in `.agents/skills/<name>/`, where Codex reads it; Claude Code reads it through the link `.claude/skills/<name>`. Other agents follow the file when told to: "follow `.agents/skills/review/SKILL.md` for pull request 12".

Skills run only when a person names them, never on an agent's own decision: a review costs time and tokens, and an issue is the owner's call. `disable-model-invocation: true` in `SKILL.md` keeps Claude Code from starting one, and keeps its description out of every session's context; `allow_implicit_invocation: false` in `agents/openai.yaml` does the same for Codex. `pnpm check:agents` refuses a skill without both, without its link, or one only Claude Code reads. A new skill is added like a tool, by an issue the owner decides, when a procedure has been repeated by hand.

## MCP servers and other tool extensions

No MCP server, plug-in or other tool extension is approved by default. Adding one needs the owner's decision in an issue that states:

- what it can read and change, and with which credentials;
- the exact version or commit it runs, and where it comes from;
- why the task cannot be done without it.

Configure it with the narrowest access that works, and remove it when the task is done. Output from such a tool is untrusted content like any other.

Approved, optional, set up per machine and never committed; unlike a tool approved for one task, these may stay configured:

| Tool           | Version and source                                           | Reads and changes                                                                                                                   | Why                                                                                                              |
| -------------- | ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Playwright MCP | `@playwright/mcp@0.0.83` from the npm registry, by Microsoft | A browser with an in-memory profile and no credentials; the pages it opens, limited to local servers and the project's Pages origin | The agent sees and uses the UI it builds; see [browser testing](browser-testing.md#let-an-agent-use-the-browser) |

## When a provider or model changes

A model or provider that is withdrawn or changes its terms is replaced by updating this page in a pull request. Nothing in the repository depends on a particular model; the checks judge the output.
