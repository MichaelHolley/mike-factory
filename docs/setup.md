# Setup

## Local development

```sh
pnpm install
cp .env.example .env   # fill in the GitHub App values; leave OPENAI_API_KEY empty
MODEL=faux DATA_DIR=./data pnpm dev
pnpm test
pnpm typecheck
```

`MODEL=faux` swaps every repo's model for the scripted faux provider, so no real model runs on your machine. Without it, `OPENAI_API_KEY` is required.

To work on the status UI (`web/`), run the server as above and `pnpm -C web dev` next to it. Vite serves the UI on http://localhost:5173 with HMR and proxies `/status` to the server on :3000. `pnpm dev` alone serves no UI until `pnpm -C web build` has produced `web/dist`.

## Configuration

Configuration is in `config/repos.yaml` (owner, allowed sender id, per-repo `setup` and ordered `checks` commands, run in sequence after the agent finishes, plus budgets). Environment variables are listed in `.env.example`; `PUBLIC_URL` (optional) is the public base URL, e.g. `https://factory.example.com`, used for the run link in status comments. Secrets are read once at startup and removed from `process.env` before any tool shell can inherit them. When committing, the configured bot identity takes precedence over inherited `GIT_AUTHOR_*` and `GIT_COMMITTER_*` names and emails.

## Skills

Bundled skills live in `skills/<name>/SKILL.md` and are copied into the Docker image. A target repo's `.agents/skills/<name>/SKILL.md` overrides a bundled skill of the same name; `disable-model-invocation: true` in its frontmatter hides it. The agent's final reply becomes the PR body, followed by `Closes #<issue>`; the PR title is the issue title.

## GitHub App

Create the app under your account and install it with "Only select repositories". Every repo must also be listed in `config/repos.yaml`.

- Repository permissions: Contents, Issues and Pull requests read/write; Metadata read
- Subscribe to events: **Issue comment** (starts and stops runs) and **Pull request** (removes the worktree and local branch when an agent PR is merged or closed)

## Deployment

`docker-compose.prod.yml` is the Portainer stack. Set `MAX_CONCURRENT` (default 3) to limit how many issues run at once; the rest wait as `queued`. Worktrees of closed issues are also swept at startup and every 24 hours.

The image also builds the status UI and serves it from `/`, with each run at `/runs/<repo>/<issue>`. `GET /status` returns the runs as a public projection (repo, issue, issueUrl, branch, phase, attempts, costUsd, prUrl, lastError, startedAt, updatedAt) without worktree paths or other internals. `GET /status/<repo>/<issue>/conversation` returns the run's conversation (the pipeline's prompts, the agent's replies, and its tool calls and results) for the run page; the system prompt and the model's thinking are left out and each item is clipped to 4,000 characters; `?download=1` returns it as a JSON file, used by the run page's **Download JSON** link. Neither the UI nor these endpoints have auth, so anything in a run's state or conversation is public; that's fine as long as every configured repo is public.

`deploy/nginx.conf` forwards `/webhooks/github` and everything else to the app on `127.0.0.1:3000`, with no basic auth. Set `PUBLIC_URL` to the host nginx serves so status comments link to it. The old `mike-factory.htpasswd` file is no longer used and can be deleted.
