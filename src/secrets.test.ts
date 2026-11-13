import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import { NodeExecutionEnv } from "@earendil-works/pi-durable/env/node";
import { generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import { parsePrivateKey, takeSecrets } from "./secrets.ts";

const pem = generateKeyPairSync("rsa", { modulusLength: 2048 })
  .privateKey.export({ type: "pkcs1", format: "pem" })
  .toString()
  .trim();

describe("takeSecrets", () => {
  it("returns the secrets and hides them from shells started by tools", async () => {
    process.env.GITHUB_APP_ID = "123";
    process.env.GITHUB_PRIVATE_KEY = pem.replaceAll("\n", "\\n");
    process.env.GITHUB_WEBHOOK_SECRET = "SECRET-WEBHOOK";
    process.env.OPENROUTER_API_KEY = "SECRET-OPENROUTER";
    process.env.PROXY_SECRET = "SECRET-PROXY";

    const secrets = takeSecrets();
    expect(secrets).toEqual({
      appId: "123",
      privateKey: pem,
      webhookSecret: "SECRET-WEBHOOK",
      openrouterApiKey: "SECRET-OPENROUTER",
      proxySecret: "SECRET-PROXY",
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
    expect(output).not.toMatch(
      /SECRET|PRIVATE KEY|GITHUB_PRIVATE_KEY|GITHUB_WEBHOOK_SECRET|OPENROUTER_API_KEY|PROXY_SECRET/,
    );
  });

  it("fails fast when a required secret is missing", () => {
    expect(() => takeSecrets({ GITHUB_APP_ID: "1" })).toThrow(/GITHUB_PRIVATE_KEY/);
  });

  it.each([
    ["raw PEM", pem],
    ["one line with \\n", pem.replaceAll("\n", "\\n")],
    ["quoted", `"${pem.replaceAll("\n", "\\n")}"`],
    ["base64", Buffer.from(pem).toString("base64")],
  ])("parses a private key given as %s", (_, raw) => {
    expect(parsePrivateKey(raw)).toBe(pem);
  });

  it("explains a broken key without leaking it", () => {
    const firstLineOnly = pem.split("\n")[0]!;
    expect(() => parsePrivateKey(firstLineOnly)).toThrow(
      '1 lines, 31 chars, starts with "-----BEGIN RSA PRIVATE KEY-----"',
    );
  });
});
