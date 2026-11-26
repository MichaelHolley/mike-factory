import { createRegistry, defineExtension, type TaskId } from "@earendil-works/pi-durable";
import { createCodingTools } from "@earendil-works/pi-durable/tools";
import type { AgentDeps } from "./harness.ts";
import { createGithubTools } from "./extensions/github.ts";
import { createGuards } from "./extensions/guards.ts";
import { checkedImages } from "./images.ts";
import { createPullRequestTools } from "./extensions/pull-request.ts";
import { createReviewTools } from "./extensions/review.ts";
import { createRepoContext } from "./extensions/repo-context.ts";
import { createSkills } from "./extensions/skills.ts";
import { createIssuePipeline } from "./tasks/issuePipeline.ts";

export function createAgentRegistry(deps: AgentDeps, opts: { crashAt?: string; abortTask: (id: TaskId) => void }) {
  const pipeline = createIssuePipeline({ ...deps, crashAt: opts.crashAt });
  const registry = createRegistry();
  registry.install(createCodingTools({ images: checkedImages() }));
  registry.install(createRepoContext(deps.config.owner));
  registry.install(createSkills(deps.skills ?? []));
  registry.install(createGithubTools(deps.github));
  registry.install(createPullRequestTools(deps.publicUrl));
  registry.install(createReviewTools(deps.github));
  registry.install(
    createGuards({
      config: deps.config,
      abortTask: opts.abortTask,
      attachmentsPath: deps.worktrees.attachmentsPath,
    }),
  );
  registry.install(defineExtension({ name: "issue-pipeline", tasks: [pipeline] }));

  return { registry, pipeline };
}
