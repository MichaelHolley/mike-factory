import { createRegistry, defineExtension, type TaskId } from "@earendil-works/pi-durable";
import { CodingTools } from "@earendil-works/pi-durable/tools";
import { skills } from "@howaboua/pi-durable-skills";
import { fileURLToPath } from "node:url";
import type { AgentDeps } from "./harness.ts";
import { createGithubTools } from "./extensions/github.ts";
import { createGuards } from "./extensions/guards.ts";
import { createRepoContext } from "./extensions/repo-context.ts";
import { createIssuePipeline } from "./tasks/issuePipeline.ts";

/** Skills shipped with the factory; a target repo's `.agents/skills` overrides them by name. */
export const BUNDLED_SKILLS_DIR = fileURLToPath(new URL("../../skills", import.meta.url));

export function createAgentRegistry(deps: AgentDeps, opts: { crashAt?: string; abortTask: (id: TaskId) => void }) {
  const pipeline = createIssuePipeline({ ...deps, crashAt: opts.crashAt });
  const registry = createRegistry();
  registry.install(CodingTools);
  registry.install(createRepoContext(deps.config));
  registry.install(skills({ globalRoot: BUNDLED_SKILLS_DIR, sessionRoot: ".agents/skills" }));
  registry.install(createGithubTools(deps.github));
  registry.install(createGuards({ config: deps.config, abortTask: opts.abortTask }));
  registry.install(defineExtension({ name: "issue-pipeline", tasks: [pipeline] }));
  return { registry, pipeline };
}
