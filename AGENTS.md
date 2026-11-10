# AGENTS.md

Self-hosted agent that turns a `/mike` comment on a GitHub issue into a pull request. Overview in `README.md`, setup and config in `docs/setup.md`.

- Use pnpm. Verify with `pnpm lint`, `pnpm typecheck` and `pnpm test`; run `pnpm format` before committing.
- Running the server needs GitHub App secrets even with `MODEL=faux`; use the tests to verify behavior offline.
- For UI work without secrets, run `pnpm dev:mock` (the real HTTP server on :3000 with in-memory sample runs and no GitHub, `src/dev/mock.ts`) alongside `pnpm -C web dev`.

## Code map

- `src/contracts.ts`: interfaces between the HTTP server, GitHub, git and the agent.
- `src/agent/tasks/issuePipeline.ts`: the run's phases, prompts and PR publishing.
- `src/agent/service.ts`: starts, stops and lists runs.
- `src/agent/extensions/`: agent tools, system prompt sections, and the guards that block commands and enforce budgets.
- `src/git/worktrees.ts`: bare clones and per-issue worktrees.

## Rules

- Every pipeline phase must be safe to rerun from its top after a crash; `test/agent/crash.test.ts` checks this.
- Secrets never reach `process.env` or tool shells; see `src/secrets.ts`.
- Only pipeline code pushes, opens PRs or comments on GitHub. The agent only edits and commits locally.

## Tests

- Unit tests sit next to the source as `*.test.ts`.
- Pipeline tests live in `test/agent/` and use `support.ts` (`FakeGitHub`, faux model, local git remotes).
- A guard change needs a case in `test/agent/guards.test.ts`.
- Test real behavior, not mocks: a test that only checks what a mock returns, or a test for a test fake, adds nothing.
- Test each behavior once, at the cheapest level that proves it; don't repeat unit-tested cases through the HTTP or pipeline layers.

## Documentation

- Documentation must be kept short and concise.
- Do not bloat a docs file content.
- When a change affects behavior, setup, config, or commands, update `README.md` and `docs/` in the same change.

## Commit

Commit using conventional commit messages.
