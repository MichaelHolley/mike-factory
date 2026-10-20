# mike-factory

A small service that turns the `agent:ready` label on a GitHub issue into a pull request. A GitHub App webhook starts a durable [Pi Durable](https://www.npmjs.com/package/@earendil-works/pi-durable) run per issue (prepare, implement, verify, publish, report). State lives in SQLite on `/data`, so a restart resumes the run and still produces exactly one PR. See [PLAN.md](PLAN.md) for the design.

## Local development

```sh
pnpm install
cp .env.example .env   # fill in the GitHub App values; leave OPENAI_API_KEY empty
MODEL=faux DATA_DIR=./data pnpm dev
pnpm test
pnpm typecheck
```

`MODEL=faux` swaps every repo's model for the scripted faux provider, so no real model runs on your machine. Without it, `OPENAI_API_KEY` is required.

Configuration is in `config/repos.yaml` (owner, allowed sender id, per-repo commands and budgets). Environment variables are listed in `.env.example`. Secrets are read once at startup and removed from `process.env` before any tool shell can inherit them.

## GitHub App setup

1. Create a GitHub App under the owner account. Webhook URL `https://<host>/webhooks/github`, plus a webhook secret.
2. Repository permissions: Contents read/write, Issues read/write, Pull requests read/write, Metadata read.
3. Subscribe to events: `issues`, `pull_request`.
4. Generate a private key. Install the app on the account with "Only select repositories".
5. Add each repo to `config/repos.yaml`, and turn on "require a pull request" for its default branch.

## Deploy

CI (`.github/workflows/docker.yml`) pushes `<user>/mike-factory:latest` and `:sha-<short>` to Docker Hub on every push to `main`. It needs the repo secrets `DOCKERHUB_USERNAME` and `DOCKERHUB_TOKEN`.

On the VPS:

1. Create a Portainer stack from `compose.yaml`. Set the stack variable `DOCKERHUB_USER` (and optionally `IMAGE_TAG`, e.g. `sha-abc1234` to pin or roll back).
2. Put a `.env` (see `.env.example`) next to the stack's compose file, and `mkdir data && chown 10001:10001 data` (the container runs as uid 10001).
3. Add the snippet from `deploy/nginx.conf` to the TLS server block. Only `/webhooks/github` is exposed; the container binds `127.0.0.1:3000`.
4. Deploying a new image is manual: pull and recreate the stack. Run a single replica; SQLite storage has one owner.
