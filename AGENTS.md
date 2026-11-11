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
- Style the web UI with Tailwind utilities and the theme tokens in `web/src/style.css`, not custom CSS. Avoid arbitrary values like `w-[6px]` or `max-[48rem]:`; use the nearest scale class or breakpoint, even if it isn't pixel-identical.

## Tests

- Unit tests sit next to the source as `*.test.ts`.
- Pipeline tests live in `test/agent/` and use `support.ts` (`FakeGitHub`, faux model, local git remotes).
- A guard change needs a case in `test/agent/guards.test.ts`.
- Test real behavior, not mocks: a test that only checks what a mock returns, or a test for a test fake, adds nothing.
- Test each behavior once, at the cheapest level that proves it; don't repeat unit-tested cases through the HTTP or pipeline layers.

## Documentation

- `README.md` is a landing page for first-time visitors: what mike-factory is, how to use it, and how it works at a glance.
- `docs/setup.md` is setup instructions: the steps and settings an operator needs to run it.
- Document what a reader needs, and leave implementation details, API shapes, UI behavior and change history to the code and git log.
- When a change affects usage, setup, config or commands, update these docs in the same change; keep each edit a line or two.

## Commit

Commit using conventional commit messages.
