# mike-factory

> [!WARNING]
> This project is a work in progress and configured for my own setup (my GitHub account, repos, and VPS). It isn't a drop-in tool, but in the open source spirit you're welcome to fork it and rebuild it for your own needs.

A self-hosted coding agent that turns a GitHub issue into a pull request. Comment `/mike` on an issue and it reads the issue, implements the change, runs the repo's checks, and opens a PR.

## How it works

- **`/mike`** starts a run on the issue. **`/mike <text>`** adds extra instructions. **`/mike stop`** aborts it.
- Progress shows up in a single status comment on the issue, edited in place. No labels are added to your repos.
- A public, read-only status page lists every run and refreshes itself; each run's page also shows the agent's conversation with a **Download JSON** link for a current snapshot. When `PUBLIC_URL` is set, the status comment ends with a link to that run's page.
- Each issue gets one durable [Pi Durable](https://www.npmjs.com/package/@earendil-works/pi-durable) run, triggered by a GitHub App webhook: prepare, implement, verify, publish, report.
- State lives in SQLite, so a restart resumes the run and still produces exactly one PR. Commits use the bot identity, overriding inherited Git author settings.
- The agent loads [skills](https://github.com/IgorWarzocha/pi-durable-components/tree/main/packages/skills) on demand. The bundled `pull-request` skill shapes commit messages and the PR description; a repo can add or override skills in `.agents/skills/<name>/SKILL.md`.
- Only an allowed sender can trigger runs, and each repo has its own setup command and ordered `checks` (e.g. lint, typecheck, test) and turn and cost budgets.

## Docs

- [Setup](docs/setup.md): local development, configuration, GitHub App, and deployment.