# mike-factory

> [!WARNING]
> This project is a work in progress and configured for my own setup (my GitHub account, repos, and VPS). It isn't a drop-in tool, but in the open source spirit you're welcome to fork it and rebuild it for your own needs.

A self-hosted coding agent that turns a GitHub issue into a pull request. Comment `/mike` on an issue and it reads the issue, implements the change, runs the repo's checks, and opens a PR.

## How it works

- **`/mike`** starts a run on the issue. **`/mike <text>`** adds extra instructions. **`/mike stop`** aborts it.
- Progress shows up in a single status comment on the issue, edited in place. No labels are added to your repos.
- Each issue gets one durable [Pi Durable](https://www.npmjs.com/package/@earendil-works/pi-durable) run, triggered by a GitHub App webhook: prepare, implement, verify, publish, report.
- State lives in SQLite, so a restart resumes the run and still produces exactly one PR.
- Only an allowed sender can trigger runs, and each repo has its own setup/test/lint commands and turn and cost budgets.

## Docs

- [Setup](docs/setup.md): local development, configuration, GitHub App, and deployment.