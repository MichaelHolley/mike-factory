# mike-factory

> [!WARNING]
> Work in progress, configured for my own GitHub account, repos and VPS. It isn't a drop-in tool, but you're welcome to fork it and adapt it.

A self-hosted coding agent that turns a GitHub issue into a pull request. Comment `/mike` on an issue and it reads the issue, implements the change, runs the repo's checks, and opens a PR.

## Usage

- `/mike` starts a run on the issue; `/mike <text>` adds instructions.
- `/mike` on an issue with an open agent PR continues on that PR.
- `/mike stop` aborts the run.

Progress appears in a single status comment on the issue. A status page lists all runs live, shows each agent's conversation, and lets you steer a running agent or continue a finished one.

## How it works

- A GitHub App webhook starts a durable run per issue: prepare, implement, verify, publish, report.
- The agent edits and commits locally; the pipeline runs the repo's checks and pushes only verified commits.
- Run state lives in SQLite, so a restart resumes where it left off and still opens exactly one PR.
- Each repo configures its own setup command, checks, model and budgets.
- Skills in `.agents/skills/` are offered to the agent and loaded on demand.

## Docs

- [Setup](docs/setup.md): local development, configuration, GitHub App and deployment.
