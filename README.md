# mike-factory

> [!WARNING]
> This project is a work in progress and configured for my own setup (my GitHub account, repos, and VPS). It isn't a drop-in tool, but in the open source spirit you're welcome to fork it and rebuild it for your own needs.

A self-hosted coding agent that turns a GitHub issue into a pull request. Comment `/mike` on an issue and it reads the issue, implements the change, runs the repo's checks, and opens a PR.

## How it works

### Commands

- **`/mike`** starts a run on the issue. **`/mike <text>`** adds extra instructions. **`/mike stop`** aborts it.
- `/mike` while a run is in progress is ignored without a reply. While the issue has an open agent PR, `/mike` continues on it: the run pushes to the same branch and updates the PR's title and body.
- A failed or stopped run keeps its worktree, and the next `/mike` continues it. After the PR closes, the next run starts from a fresh worktree but keeps the earlier conversation.
- Only an allowed sender can trigger runs.

### The run

- Each issue gets one durable [Pi Durable](https://www.npmjs.com/package/@earendil-works/pi-durable) run, triggered by a GitHub App webhook: prepare, implement, verify, publish, report, with `fix` and `revise` looping back to verify.
- The agent commits its own work: code, tests and docs that resolve the issue, but not scratch or helper files. Checks only run on a clean working tree, so leftover files go back to the agent as a fix attempt, and only verified commits are pushed.
- State lives in SQLite, so a restart resumes the run and still produces exactly one PR. Commits use the bot identity, overriding inherited Git author settings.
- New PR titles follow conventional commits so squash merges can use the PR title as their commit subject.
- Built-in writing guidance asks for focused, descriptive commits and PR descriptions covering the full change, rationale, testing, and relevant documentation or migration notes.

### Following and steering a run

- Progress shows up in a single status comment on the issue, edited in place. No labels are added to your repos.
- A status page, meant to sit behind reverse-proxy auth, lists runs with their model and effort, in progress first, then finished runs grouped by repo, and updates live.
- Each run's page shows the agent's conversation with a **Download JSON** link for a current snapshot. When `PUBLIC_URL` is set, the status comment ends with a link to that run's page.
- From a run's page you can message the agent: **Steer** reaches it during its current work, **Continue** starts a follow-up run on a finished one. Messages go through the pipeline, so every change is verified before it is pushed.

### Per-repo setup

- Each repo has its own setup command, ordered `checks` (e.g. lint, typecheck, test), and turn and cost budgets.
- Skills (`SKILL.md` folders in `.agents/skills/`) are listed in the agent's system prompt and loaded on demand with a `load_skill` tool. `frontend-design` ships by default.

## Docs

- [Setup](docs/setup.md): local development, configuration, GitHub App, and deployment.
