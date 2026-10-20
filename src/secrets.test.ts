import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import { NodeExecutionEnv } from "@earendil-works/pi-durable/env/node";
import { describe, expect, it } from "vitest";
import { takeSecrets } from "./secrets.ts";

describe("takeSecrets", () => {
  it("returns the secrets and hides them from shells started by tools", async () => {
    process.env.GITHUB_APP_ID = "123";
    process.env.GITHUB_PRIVATE_KEY = "line1\\nline2-SECRET-KEY";
    process.env.GITHUB_WEBHOOK_SECRET = "SECRET-WEBHOOK";
    process.env.OPENAI_API_KEY = "SECRET-OPENAI";

    const secrets = takeSecrets();
    expect(secrets).toEqual({
      appId: "123",
      privateKey: "line1\nline2-SECRET-KEY",
      webhookSecret: "SECRET-WEBHOOK",
      openaiApiKey: "SECRET-OPENAI",
    });

    let output = "";
    const result = await new NodeExecutionEnv({ cwd: process.cwd() }).exec(
      "env",
      {
        onOutput: (text) => {
          output += text;
        },
      },
      BACKGROUND_CONTEXT,
    );
    expect(result.ok).toBe(true);
    expect(output).toContain("PATH=");
    expect(output).not.toMatch(/SECRET|GITHUB_PRIVATE_KEY|GITHUB_WEBHOOK_SECRET|OPENAI_API_KEY/);
  });

  it("fails fast when a required secret is missing", () => {
    expect(() => takeSecrets({ GITHUB_APP_ID: "1" })).toThrow(/GITHUB_PRIVATE_KEY/);
  });
});
