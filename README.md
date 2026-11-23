# mike-factory

A self-hosted coding agent that turns a GitHub issue into a pull request. Comment `/mike` on an issue and it reads the issue, implements the change, runs the repo's checks, and opens a PR.

## Usage

- `/mike` starts a run on the issue and requests your review on its PR; `/mike <text>` adds instructions.
- `/mike` on an issue with an open agent PR continues on that PR.
- `/mike stop` aborts the run.
- On mike's PR, request changes or comment `/mike <text>` (including inline) to have it revise the PR. It replies in the threads and re-requests your review.

Files attached to the issue or its comments, to a message on the run page, or to a `/mike` PR comment or review are saved in the agent's worktree for it to open, whatever their type: up to 10 per message, 10 MB each and 25 MB in total. Some private-repository attachments can't be downloaded and are skipped.

Progress appears in a single status comment on the issue, or on the PR for runs started there. A status page lists all runs live, shows each agent's conversation, and lets you steer a running agent or continue a finished one.

## How it works

- A GitHub App webhook starts a durable run per issue: prepare, implement, verify, publish, report.
- The agent edits and commits locally; the pipeline runs the repo's checks and pushes only verified commits.
- Run state lives in SQLite, so a restart resumes where it left off and still opens exactly one PR.
- Each repo sets its setup command and checks in a `.mike.yaml`; the factory sets the model and budgets.
- The repo's root `AGENTS.md` (else `CLAUDE.md`, else `README.md`) is part of the agent's system prompt.
- Skills in `.agents/skills/` are offered to the agent and loaded on demand.

## Docs

- [Setup](docs/setup.md): local development, configuration, GitHub App and deployment.
