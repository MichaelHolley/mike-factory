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

## Configuration

Configuration is in `config/repos.yaml` (owner, allowed sender id, per-repo commands and budgets). Environment variables are listed in `.env.example`. Secrets are read once at startup and removed from `process.env` before any tool shell can inherit them.

## GitHub App

Create the app under your account and install it with "Only select repositories". Every repo must also be listed in `config/repos.yaml`.

- Repository permissions: Contents, Issues and Pull requests read/write; Metadata read
- Subscribe to events: **Issue comment** (starts and stops runs) and **Pull request** (removes the worktree and local branch when an agent PR is merged or closed)

## Deployment

`docker-compose.prod.yml` is the Portainer stack. Set `MAX_CONCURRENT` (default 3) to limit how many issues run at once; the rest wait as `queued`. Worktrees of closed issues are also swept at startup and every 24 hours.

`GET /status` returns every issue's state as JSON. It has no auth of its own, so expose it only behind the basic auth in `deploy/nginx.conf`.
