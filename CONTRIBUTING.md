# Contributing

[AGENTS.md](AGENTS.md) holds the rules of this repository. They apply to people and to coding agents alike; "How to work here" in that file is the sequence for every change.

| You want to                      | Read                                                                               |
| -------------------------------- | ---------------------------------------------------------------------------------- |
| Understand this way of working   | [Getting started with agentic work](engineering/getting-started.md)                |
| Start, resume or hand off a task | [Task lifecycle](engineering/agents/task-lifecycle.md)                             |
| File or triage an issue          | [Issue tracker](engineering/agents/issue-tracker.md)                               |
| Know what is checked, and when   | [Local verification](engineering/agents/local-verification.md)                     |
| Get a pull request merged        | [Decision workflow](engineering/agents/decision-workflow.md)                       |
| Preserve research and rationale  | [Knowledge ownership](engineering/agents/decision-workflow.md#knowledge-ownership) |
| Find everything else             | [Engineering](engineering/README.md)                                               |

## AI-assisted contributions

Contributions written with AI tools are welcome and are the norm here. Whoever submits one is responsible for it as for their own work: they have the right to contribute it, it is contributed under the repository's licence, and it contains no third-party code under terms incompatible with that licence. Agents do not copy sizeable code from other projects; where a short piece is adapted, the pull request names its source and licence. Commits and pull requests carry no AI attribution; [ADR 0001](engineering/adr/0001-keep-ai-attribution-out-of-commits.md) records why.

Only hooks, the `PR build` and the hosted rulesets enforce anything. The guardrail table in `AGENTS.md` says for each rule which of them does, and which rules depend on review.
