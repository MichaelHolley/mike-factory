import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { serve } from "@hono/node-server";
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import { openNodeSqliteStorage } from "@earendil-works/pi-durable/storage/sqlite/node";
import { createModels } from "@earendil-works/pi-ai/models";
import { openaiProvider } from "@earendil-works/pi-ai/providers/openai";
import { fauxProvider } from "@earendil-works/pi-ai/providers/faux";
import { openAgentHarness } from "./agent/harness.ts";
import { loadConfig, type AppConfig } from "./config.ts";
import { createGitHubClient } from "./github/app.ts";
import { createWorktrees } from "./git/worktrees.ts";
import { createServer } from "./server.ts";
import { takeSecrets } from "./secrets.ts";


const log = (msg: string, data: object = {}) => console.log(JSON.stringify({ time: new Date().toISOString(), msg, ...data }));

function buildModels(openaiApiKey: string | undefined, useFaux: boolean) {
  if (useFaux) {
    const faux = fauxProvider();
    const models = createModels();
    models.setProvider(faux.provider);
    const model = faux.getModel();
    return { models, model: { provider: model.provider, modelId: model.id } };
  }
  if (!openaiApiKey) throw new Error("OPENAI_API_KEY is required unless MODEL=faux");
  // openaiProvider() resolves its key lazily from process.env, which takeSecrets has already scrubbed.
  const models = createModels({
    authContext: {
      env: async (name) => (name === "OPENAI_API_KEY" ? openaiApiKey : undefined),
      fileExists: async () => false,
    },
  });
  models.setProvider(openaiProvider());
  return { models, model: undefined };
}

async function main() {
  const config = await loadConfig(process.env.REPOS_CONFIG ?? "config/repos.yaml");
  const dataDir = process.env.DATA_DIR ?? "/data";
  const port = Number(process.env.PORT ?? 3000);
  const hostname = process.env.HOST ?? "127.0.0.1";
  const useFaux = process.env.MODEL === "faux";

  const secrets = takeSecrets();

  const github = createGitHubClient({ appId: secrets.appId, privateKey: secrets.privateKey, owner: config.owner });
  const identity = await github.botIdentity();
  // Env instead of `git config --global`, so local dev never rewrites the developer's git identity.
  process.env.GIT_AUTHOR_NAME = process.env.GIT_COMMITTER_NAME = identity.name;
  process.env.GIT_AUTHOR_EMAIL = process.env.GIT_COMMITTER_EMAIL = identity.email;

  const worktrees = createWorktrees({ dataDir, owner: config.owner, token: (repo) => github.gitToken(repo) });

  const { models, model } = buildModels(secrets.openaiApiKey, useFaux);
  const effectiveConfig: AppConfig = model
    ? { ...config, repos: config.repos.map((repo) => ({ ...repo, model })) }
    : config;

  await mkdir(dataDir, { recursive: true });
  const storage = await openNodeSqliteStorage(join(dataDir, "agent.sqlite"));
  const { harness, service } = await openAgentHarness(
    { storage, models, deps: { config: effectiveConfig, github, worktrees, log }, crashAt: process.env.CRASH_AT },
    BACKGROUND_CONTEXT,
  );

  let shuttingDown = false;
  void harness.closed.then((end) => {
    if (shuttingDown) return;
    log("harness closed unexpectedly", { end: end.reason === "failed" ? String(end.error) : end.reason });
    process.exit(1);
  });

  const app = createServer({ config: effectiveConfig, service, webhookSecret: secrets.webhookSecret, log });
  const server = serve({ fetch: app.fetch, port, hostname }, (info) =>
    log("listening", { port: info.port, model: useFaux ? "faux" : "openai" }),
  );

  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    log("shutting down", { signal });
    const serverClosed = new Promise<void>((resolve) => server.close(() => resolve()));
    if ("closeIdleConnections" in server) server.closeIdleConnections();
    await serverClosed;
    await harness.close(BACKGROUND_CONTEXT);
    process.exit(0);
  };
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}

main().catch((error) => {
  log("fatal", { error: error instanceof Error ? (error.stack ?? error.message) : String(error) });
  process.exit(1);
});
