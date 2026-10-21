import type { Context } from "@earendil-works/chord";
import type { Models } from "@earendil-works/pi-ai";
import { Harness, type Storage } from "@earendil-works/pi-durable";
import { NodeExecutionEnv } from "@earendil-works/pi-durable/env/node";
import type { AppConfig } from "../config.ts";
import type { GitHubClient, IssueService, Worktrees } from "../contracts.ts";
import { createAgentRegistry } from "./registry.ts";
import { createIssueService } from "./service.ts";

export interface AgentDeps {
  config: AppConfig;
  github: GitHubClient;
  worktrees: Worktrees;
  log?: (msg: string, data?: object) => void;
  maxConcurrent?: number;
}

/** Opens the harness over `storage`, installs the agent, and resumes unfinished work before returning. */
export async function openAgentHarness(
  opts: { storage: Storage; models: Models; deps: AgentDeps; crashAt?: string },
  context: Context,
): Promise<{ harness: Harness; service: IssueService }> {
  const log = opts.deps.log ?? (() => {});
  const holder: { harness?: Harness } = {};
  const { registry, pipeline } = createAgentRegistry(opts.deps, {
    crashAt: opts.crashAt,
    abortTask: (id) => {
      holder.harness?.abortTask(id, context).catch((error) => log("abortTask failed", { error: String(error) }));
    },
  });
  const harness = await Harness.open(
    opts.storage,
    {
      models: opts.models,
      registry,
      env: ({ cwd }) => (cwd === undefined ? undefined : new NodeExecutionEnv({ cwd })),
      onReport: (error) => log("harness report", { error: error instanceof Error ? (error.stack ?? error.message) : String(error) }),
    },
    context,
  );
  holder.harness = harness;
  const service = createIssueService({ harness, storage: opts.storage, pipeline, deps: opts.deps, context });
  harness.resume();
  return { harness, service };
}
