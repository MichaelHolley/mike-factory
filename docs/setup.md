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

Repos are configured in `config/repos.yaml`: the owner, the allowed sender id, and per repo the `setup` command, ordered `checks`, budgets, and optionally `model` (any OpenRouter model) and `thinkingLevel`. Environment variables are documented in `.env.example`.

To give the agent repo-specific instructions, commit an `AGENTS.md` at the root of the target repo; the agent gets it in its system prompt on every run.

## GitHub App

Create the app under your account and install it on selected repositories. Every repo must also be listed in `config/repos.yaml`.

- Repository permissions: Contents, Issues and Pull requests read/write; Metadata read.
- Events: **Issue comment** and **Pull request**.

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
- Don't buffer or compress `text/event-stream` responses; the status page streams live updates.
- Set `PUBLIC_URL` to the public URL so status comments link to the run page.
- `config/repos.yaml` is baked into the image; rebuild it, or mount the file and point `REPOS_CONFIG` at it.
