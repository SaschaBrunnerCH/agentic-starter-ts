# Data handling

What may appear where. Agents send what they read to their provider, and much of what they write ends up in public or long-lived places: commits, pull requests, issues, handoffs and logs.

## Classes

| Class        | Examples                                                                           | May appear in                                         |
| ------------ | ---------------------------------------------------------------------------------- | ----------------------------------------------------- |
| Public       | Source, documentation, issue and pull-request text, build output                   | Anywhere                                              |
| Internal     | Unreleased plans, private repository content, local paths and machine names        | This repository and an approved agent's session       |
| Confidential | Credentials, tokens, keys, `.env` contents, personal data of anyone, customer data | Only where it is used: a secret store or a local file |

The content of a private repository is Internal: approved agents may read it, and it is not copied to other services.

## Rules

- Never put Confidential data into a prompt, a commit, a pull request, an issue, a comment, a handoff, a log quoted in text or a screenshot. If a task needs a credential, the owner sets it in a secret store and the workflow reads it there.
- Redact before quoting: replace tokens, keys, e-mail addresses, names of private persons and internal URLs in logs and outputs with a placeholder such as `<token>`.
- Share with a service only what the task needs, and only with services the task needs; the approved AI tools are listed in [AI tools](ai-tools.md).
- A credential that appeared anywhere it should not have is compromised: report it to the owner, who revokes it first, then remove it. Rewriting history does not undo exposure. This is an [AI incident](../operations/ai-incidents.md).
- An application that will hold personal or regulated data needs its own record of what it stores, where and for how long, before it stores any.
