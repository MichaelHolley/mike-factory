import { createRegistry, defineExtension, type TaskId } from "@earendil-works/pi-durable";
import { CodingTools } from "@earendil-works/pi-durable/tools";
import type { AgentDeps } from "./harness.ts";
import { createGithubTools } from "./extensions/github.ts";
import { createGuards } from "./extensions/guards.ts";
import { createRepoContext } from "./extensions/repo-context.ts";
import { createIssuePipeline } from "./tasks/issuePipeline.ts";

export function createAgentRegistry(deps: AgentDeps, opts: { crashAt?: string; abortTask: (id: TaskId) => void }) {
  const pipeline = createIssuePipeline({ ...deps, crashAt: opts.crashAt });
  const registry = createRegistry();
  registry.install(CodingTools);
  registry.install(createRepoContext(deps.config));
  registry.install(createGithubTools(deps.github));
  registry.install(createGuards({ config: deps.config, abortTask: opts.abortTask }));
  registry.install(defineExtension({ name: "issue-pipeline", tasks: [pipeline] }));
  return { registry, pipeline };
}
