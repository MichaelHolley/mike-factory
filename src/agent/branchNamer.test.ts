import { createModels } from "@earendil-works/pi-ai/models";
import { fauxAssistantMessage, fauxProvider } from "@earendil-works/pi-ai/providers/faux";
import { describe, expect, it } from "vitest";
import { createBranchNamer } from "./branchNamer.ts";

const issue = {
  number: 7,
  title: "Crash when the config is empty!",
  body: "Steps...",
  labels: [],
  state: "open" as const,
};

function namer() {
  const faux = fauxProvider();
  const models = createModels();
  models.setProvider(faux.provider);
  return { faux, name: createBranchNamer({ models, model: faux.getModel() }) };
}

describe("createBranchNamer", () => {
  it("slugs the model's reply", async () => {
    const { faux, name } = namer();
    faux.setResponses([fauxAssistantMessage("`Fix-Empty-Config crash`\n")]);
    expect(await name(issue)).toBe("fix-empty-config-crash");
  });

  it.each([
    ["an error", fauxAssistantMessage("", { stopReason: "error", errorMessage: "rate limited" })],
    ["an empty reply", fauxAssistantMessage("   ")],
  ])("falls back to the issue title on %s", async (_name, reply) => {
    const { faux, name } = namer();
    faux.setResponses([reply]);
    expect(await name(issue)).toBe("crash-when-the-config-is-empty");
  });
});
