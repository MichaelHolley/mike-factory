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
