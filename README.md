# mike-factory

A small service that turns a `/mike` comment on a GitHub issue into a pull request. `/mike <text>` adds extra instructions for the run, `/mike stop` aborts it, and the agent shows progress in one status comment on the issue that it edits in place. It adds no labels to your repos. A GitHub App webhook starts a durable [Pi Durable](https://www.npmjs.com/package/@earendil-works/pi-durable) run per issue (prepare, implement, verify, publish, report). State lives in SQLite on `/data`, so a restart resumes the run and still produces exactly one PR. See [PLAN.md](PLAN.md) for the design.

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
3. Subscribe to events: `Issue comment`, `Pull request`.
4. Generate a private key. Install the app on the account with "Only select repositories".
5. Add each repo to `config/repos.yaml`, and turn on "require a pull request" for its default branch.

## Deploy

CI (`.github/workflows/docker.yml`) pushes `<user>/mike-factory:latest` and `:sha-<short>` to Docker Hub on every push to `main`. It needs the repo variable `DOCKERHUB_USERNAME` and the repo secret `DOCKERHUB_TOKEN`.

On the VPS:

1. Create a Portainer stack from `compose.yaml` and enter the variables from `.env.example` as the stack's environment variables (Portainer writes them to `stack.env`). Put the private key on one line with `\n` for newlines. Optionally set `IMAGE_TAG`, e.g. `sha-abc1234`, to pin or roll back.
2. Data lives in the named volume `agent-data`, which Docker creates owned by the container user.
3. Nginx Proxy Manager runs as a container: the stack joins its network (`PROXY_NETWORK`, default `nginx-proxy-manager_default`) and NPM forwards the webhook host to `http://mike-factory:3000`. No host port is published. The service answers 404 on everything except `/webhooks/github`. (`deploy/nginx.conf` is the equivalent for a plain nginx on the host.)
4. Deploying a new image is manual: pull and recreate the stack. Run a single replica; SQLite storage has one owner.
