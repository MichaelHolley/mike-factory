# AGENTS.md

Self-hosted agent that turns a `/mike` comment on a GitHub issue into a pull request. Overview in `README.md`, setup and config in `docs/setup.md`.

- Use pnpm. Verify with `pnpm typecheck` and `pnpm test`.
- Run locally with `MODEL=faux` so no real model is called.
- When a change affects behavior, setup, config, or commands, update `README.md` and `docs/` in the same change.
