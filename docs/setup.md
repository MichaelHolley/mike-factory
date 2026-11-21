# Setup

## Local development

```sh
pnpm install
cp .env.example .env   # fill in the GitHub App values
MODEL=faux DATA_DIR=./data pnpm dev
```

`MODEL=faux` uses a scripted model so nothing real runs; without it, set `OPENROUTER_API_KEY`.

For the status UI, run `pnpm -C web dev` next to the server and open http://localhost:5173. Without GitHub App secrets, run `pnpm dev:mock` instead of `pnpm dev` to serve sample runs.

## Configuration

The factory is configured with environment variables, documented in `.env.example`. `OWNER` (the account the App is installed on) and `ALLOWED_SENDER_IDS` (comma-separated GitHub user ids allowed to trigger runs) are required. `MODEL` (any OpenRouter model, default `openai/gpt-6.2-sol`), `THINKING_LEVEL`, `MAX_TURNS`, `MAX_COST_USD` and `MAX_FIX_ATTEMPTS` apply to every repo.

Each target repo sets its own install command and ordered checks in a `.mike.yaml` at its root, read from the default branch on every run:

```yaml
setup: pnpm install --frozen-lockfile
checks:
  - pnpm lint
  - pnpm test
```

Without the file, runs have no setup and no checks, and the PR says so.

Branches are named `mike/<issue>-<slug>`, with the slug written from the issue by `BRANCH_MODEL` (default `openai/gpt-6-luna`, any model in the OpenRouter catalog).

To give the agent repo-specific instructions, commit an `AGENTS.md` at the root of the target repo; the agent gets it in its system prompt on every run.

## GitHub App

Create the app under your account and install it on selected repositories; installing it opts a repo in.

- Repository permissions: Contents, Issues and Pull requests read/write; Metadata read.
- Events: **Issue comment**, **Pull request**, **Pull request review** and **Pull request review comment**.

In each repo, set the squash merge default commit message to **Pull request title**, so merges produce conventional commits.

## Skills

Add skills with the skills CLI from the repo root, then commit `.agents/skills/` and `skills-lock.json`:

```sh
npx skills add anthropics/skills --skill frontend-design --copy -y -a codex
npx skills update -p
```

Only `SKILL.md` is served to the agent, so pick self-contained skills that run unattended.

## Deployment

Run the Docker image behind a reverse proxy; the app listens on port 3000 and has no auth of its own.

- Put everything except `/webhooks/github` behind proxy auth; GitHub calls the webhook, verified by signature.
- Set `PROXY_SECRET` (e.g. `openssl rand -hex 32`) and have the proxy set it as the `X-Proxy-Secret` header on every request; the app rejects other requests, so the runner can't call it directly.
- Don't buffer or compress `text/event-stream` responses; the status page streams live updates.
- Set `PUBLIC_URL` to the public URL so status comments link to the run page.

Run it as two services: the server, which holds the secrets, and a runner, where the agent's tools and its git commands run over SSH. Give secrets to the server only. With Traefik on an external `proxy` network:

```yaml
services:
  server:
    image: <user>/mike-factory:latest
    env_file: stack.env
    environment: { RUNNER_HOST: runner, MIRRORS_DIR: /mirrors }
    volumes: [state:/data, mirrors:/mirrors, ssh:/ssh]
    depends_on: [runner]
    networks: [proxy, default]
    labels:
      - traefik.enable=true
      - traefik.docker.network=proxy
      - traefik.http.services.mike-factory.loadbalancer.server.port=3000
      - traefik.http.routers.mike-factory-webhook.rule=Host(`factory.example.com`) && Path(`/webhooks/github`) && Method(`POST`)
      - traefik.http.routers.mike-factory-webhook.priority=100
      - traefik.http.routers.mike-factory.rule=Host(`factory.example.com`)
      - traefik.http.routers.mike-factory.middlewares=mike-factory-auth,mike-factory-proxy-secret
      - traefik.http.middlewares.mike-factory-auth.basicauth.users=<htpasswd line, with each $ doubled>
      - traefik.http.middlewares.mike-factory-proxy-secret.headers.customrequestheaders.X-Proxy-Secret=${PROXY_SECRET}
  runner:
    image: <user>/mike-factory:latest
    command: ["/app/runner.sh"]
    cap_drop: [NET_RAW]
    volumes: [work:/data, mirrors:/mirrors:ro, ssh:/ssh:ro]
    networks: [default]
volumes: { state: {}, mirrors: {}, work: {}, ssh: {} }
networks: { proxy: { external: true } }
```

- Compose fills `${PROXY_SECRET}` in the labels from its own environment (a `.env` beside the compose file, or Portainer's stack variables), not from `env_file`.
- The runner stays off the `proxy` network: it reaches the internet, but not the proxy or what it fronts.

- The server trusts the runner's host key, kept on `work`, on first connect. If `work` is recreated, the server refuses to start until you delete `ssh/known_hosts` from `state`.
- To switch a single-container deployment, finish or stop open runs first. Its volume becomes `state` and keeps `agent.sqlite`; its `repos/`, `worktrees/` and `pnpm-store/` are unused afterwards.
