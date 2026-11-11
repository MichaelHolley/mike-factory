# Setup

## Local development

```sh
pnpm install
cp .env.example .env   # fill in the GitHub App values; leave OPENROUTER_API_KEY empty
MODEL=faux DATA_DIR=./data pnpm dev
pnpm test
pnpm typecheck
pnpm lint          # oxlint
pnpm format        # oxfmt; CI runs pnpm format:check
```

`MODEL=faux` swaps every repo's model for the scripted faux provider, so no real model runs on your machine. Without it, `OPENROUTER_API_KEY` is required.

CI (`.github/workflows/ci.yml`) runs lint, format check, typecheck and tests on every pull request. Pushes to `main` publish the Docker image (`.github/workflows/docker.yml`), skipping docs- and test-only changes; a newer push cancels a build still in progress.

To work on the status UI (`web/`), run the server as above and `pnpm -C web dev` next to it. Vite serves the UI on http://localhost:5173 with HMR and proxies `/status` to the server on :3000. `pnpm dev` alone serves no UI until `pnpm -C web build` has produced `web/dist`. Without GitHub App secrets, run `pnpm dev:mock` instead of the server: it serves the same `/status` API from in-memory sample runs, with no webhook route, and answers run-page messages with a canned reply.

## Configuration

Configuration is in `config/repos.yaml` (owner, allowed sender id, per-repo `setup` and ordered `checks` commands, run in sequence on a clean working tree after the agent finishes, plus budgets). Each repo's `model` defaults to `openai/gpt-6.1-sol` via OpenRouter (any `openrouter` chat model in the catalog bundled with `@earendil-works/pi-ai`; others fail at run time) and its `thinkingLevel` (`off` to `max`) to `high`; both can be set under `defaults` or per repo. Environment variables are listed in `.env.example`; `PUBLIC_URL` (optional) is the public base URL, e.g. `https://factory.example.com`, used for the run link in status comments. Secrets are read once at startup and removed from `process.env` before any tool shell can inherit them. When committing, the configured bot identity takes precedence over inherited `GIT_AUTHOR_*` and `GIT_COMMITTER_*` names and emails.

## Commit and PR writing

The agent drafts the PR title and body with the `draft_pull_request` tool, which rejects non-conventional titles and over-long bodies so the agent can retry. Without a draft, the pipeline uses the latest commit subject when conventional, otherwise `chore: <issue title>`, and the final reply as the body. The body is capped at 3,000 characters, ending with `Closes #<issue>`. Existing open PRs are reused without title updates. Writing guidance lives in `src/agent/tasks/issuePipeline.ts`.

Set each repo's squash default commit message to **Pull request title** so squash merges produce conventional commits.

## Skills

Skills live in `.agents/skills/<name>/SKILL.md` and ship in the image. Every run's system prompt lists each skill's name and description; the agent reads a skill's full text with the `load_skill` tool. Only `SKILL.md` is served, so skills that depend on extra files or scripts won't work fully.

Add one with the skills CLI from the repo root, then commit `.agents/skills/` and `skills-lock.json`:

```sh
npx skills add anthropics/skills --skill frontend-design --copy -y -a codex
npx skills update -p   # refresh installed skills
```

Prefer skills that work unattended. Skills that ask the user questions, push, or open PRs clash with the pipeline and its guards.

## GitHub App

Create the app under your account and install it with "Only select repositories". Every repo must also be listed in `config/repos.yaml`.

- Repository permissions: Contents, Issues and Pull requests read/write; Metadata read
- Subscribe to events: **Issue comment** (starts and stops runs) and **Pull request** (removes the worktree and local branch when an agent PR is merged or closed)

## Deployment

Run the image behind a reverse proxy; it listens on port 3000, which should not be published past the proxy. Set `MAX_CONCURRENT` (default 3) to limit how many issues run at once; the rest wait as `queued`. Worktrees of closed issues are also swept at startup and every 24 hours.

The image contains `config/repos.yaml`, so adding or changing a repo needs a rebuilt image, or a mounted file with `REPOS_CONFIG` pointing at it.

The image also builds the status UI and serves it from `/`, with each run at `/runs/<repo>/<issue>`. `GET /status` returns the runs as a public projection (`RunStatus` in `src/runStatus.ts`), including each run's model and thinking level, without worktree paths or other internals. `GET /status/<repo>/<issue>/conversation` returns the run's conversation (the pipeline's prompts, the agent's replies, and its tool calls and results) for the run page; the system prompt and the model's thinking are left out and each item is clipped to 4,000 characters; `?download=1` returns it as a JSON file, used by the run page's **Download JSON** link. `POST /status/<repo>/<issue>/messages` with JSON `{ id, text }` (`id` a UUID that makes retries safe, `text` up to 8,000 characters) sends the run page's message to the agent and answers 202 with `{ "result": "steered" }` while a run is live, or `{ "result": "started" }` when it starts a follow-up run. The UI follows `GET /status/stream` and `GET /status/<repo>/<issue>/conversation/stream`, which push the same data as Server-Sent Events whenever it changes, so the proxy must not buffer or compress `text/event-stream` responses (Traefik doesn't by default; for nginx the app sends `X-Accel-Buffering: no`). The app has no auth of its own, so put everything except `/webhooks/github` (which GitHub calls and the app verifies by HMAC signature) behind reverse-proxy auth, such as Traefik basic auth. Set `PUBLIC_URL` to the proxy's public URL so status comments link to the run page.
