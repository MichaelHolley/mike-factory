import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { serve } from "@hono/node-server";
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import { openNodeSqliteStorage } from "@earendil-works/pi-durable/storage/sqlite/node";
import { createModels } from "@earendil-works/pi-ai/models";
import { openrouterProvider } from "@earendil-works/pi-ai/providers/openrouter";
import { fauxProvider } from "@earendil-works/pi-ai/providers/faux";
import { openAgentHarness } from "./agent/harness.ts";
import { loadSkills, SKILLS_DIR } from "./agent/extensions/skills.ts";
import { DEFAULT_MAX_CONCURRENT } from "./agent/tasks/issuePipeline.ts";
import { loadConfig, type AppConfig } from "./config.ts";
import { createGitHubClient } from "./github/app.ts";
import { createWorktrees } from "./git/worktrees.ts";
import { openWorkspace } from "./runner.ts";
import { createServer } from "./server.ts";
import { takeSecrets } from "./secrets.ts";

const SWEEP_INTERVAL_MS = 24 * 60 * 60 * 1000;

const log = (msg: string, data: object = {}) =>
  console.log(JSON.stringify({ time: new Date().toISOString(), msg, ...data }));

function buildModels(openrouterApiKey: string | undefined, useFaux: boolean) {
  if (useFaux) {
    const faux = fauxProvider();
    const models = createModels();
    models.setProvider(faux.provider);
    const model = faux.getModel();
    return { models, model: { provider: model.provider, modelId: model.id } };
  }
  if (!openrouterApiKey) throw new Error("OPENROUTER_API_KEY is required unless MODEL=faux");
  // openrouterProvider() resolves its key lazily from process.env, which takeSecrets has already scrubbed.
  const models = createModels({
    authContext: {
      env: async (name) => (name === "OPENROUTER_API_KEY" ? openrouterApiKey : undefined),
      fileExists: async () => false,
    },
  });
  models.setProvider(openrouterProvider());
  return { models, model: undefined };
}

async function main() {
  const config = await loadConfig(process.env.REPOS_CONFIG ?? "config/repos.yaml");
  const skills = await loadSkills(SKILLS_DIR);
  const dataDir = process.env.DATA_DIR ?? "/data";
  const mirrorDir = process.env.MIRRORS_DIR ?? join(dataDir, "mirrors");
  const port = Number(process.env.PORT ?? 3000);
  const hostname = process.env.HOST ?? "127.0.0.1";
  const useFaux = process.env.MODEL === "faux";
  const maxConcurrent = Number(process.env.MAX_CONCURRENT ?? DEFAULT_MAX_CONCURRENT);
  if (!Number.isInteger(maxConcurrent) || maxConcurrent < 1)
    throw new Error("MAX_CONCURRENT must be a positive integer");

  const publicUrl = process.env.PUBLIC_URL?.replace(/\/+$/, "") || undefined;

  const secrets = takeSecrets();

  const github = createGitHubClient({ appId: secrets.appId, privateKey: secrets.privateKey, owner: config.owner });
  const runnerHost = process.env.RUNNER_HOST || undefined;
  const workspace = await openWorkspace({ runnerHost, dataDir, gitIdentity: await github.botIdentity() });
  if (!runnerHost) log("RUNNER_HOST is unset: agent tools run unsandboxed in the server process");

  const worktrees = createWorktrees({
    env: workspace.env(dataDir),
    dataDir,
    mirrorDir,
    owner: config.owner,
    token: (repo) => github.gitToken(repo),
  });

  const { models, model } = buildModels(secrets.openrouterApiKey, useFaux);
  const effectiveConfig: AppConfig = model
    ? { ...config, repos: config.repos.map((repo) => ({ ...repo, model })) }
    : config;

  await mkdir(dataDir, { recursive: true });
  const storage = await openNodeSqliteStorage(join(dataDir, "agent.sqlite"));
  const { harness, service } = await openAgentHarness(
    {
      storage,
      models,
      deps: { config: effectiveConfig, github, worktrees, env: workspace.env, log, maxConcurrent, publicUrl, skills },
      crashAt: process.env.CRASH_AT,
    },
    BACKGROUND_CONTEXT,
  );

  let shuttingDown = false;
  void harness.closed.then((end) => {
    if (shuttingDown) return;
    log("harness closed unexpectedly", { end: end.reason === "failed" ? String(end.error) : end.reason });
    process.exit(1);
  });

  const sweep = () => service.sweep().catch((error) => log("sweep failed", { error: String(error) }));
  void sweep();
  setInterval(sweep, SWEEP_INTERVAL_MS).unref();

  const shutdownController = new AbortController();
  const app = createServer({
    service,
    webhook: { config: effectiveConfig, secret: secrets.webhookSecret },
    log,
    shutdownSignal: shutdownController.signal,
  });
  const server = serve({ fetch: app.fetch, port, hostname }, (info) =>
    log("listening", {
      port: info.port,
      model: useFaux ? "faux" : "openrouter",
      skills: skills.map((skill) => skill.name),
    }),
  );

  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    log("shutting down", { signal });
    shutdownController.abort();
    const serverClosed = new Promise<void>((resolve) => server.close(() => resolve()));
    if ("closeIdleConnections" in server) server.closeIdleConnections();
    // A client that stopped reading never drains its live stream, so its socket would never close.
    if ("closeAllConnections" in server) setTimeout(() => server.closeAllConnections(), 5_000).unref();
    await serverClosed;
    await harness.close(BACKGROUND_CONTEXT);
    workspace.close();
    process.exit(0);
  };
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}

main().catch((error) => {
  log("fatal", { error: error instanceof Error ? (error.stack ?? error.message) : String(error) });
  process.exit(1);
});
