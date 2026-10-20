import { createPrivateKey } from "node:crypto";
import { readFileSync } from "node:fs";

export interface Secrets {
  appId: string;
  privateKey: string;
  webhookSecret: string;
  openaiApiKey?: string;
}

const SCRUBBED = ["GITHUB_PRIVATE_KEY", "GITHUB_PRIVATE_KEY_FILE", "GITHUB_WEBHOOK_SECRET", "OPENAI_API_KEY"] as const;

function required(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

/** Accepts the PEM as is, on one line with literal `\\n`, wrapped in quotes, or base64-encoded. */
export function parsePrivateKey(raw: string): string {
  let value = raw.trim().replace(/^(["'])([\s\S]*)\1$/, "$2").trim();
  if (!value.includes("-----BEGIN")) value = Buffer.from(value, "base64").toString("utf8").trim();
  value = value.replaceAll("\\n", "\n");
  try {
    createPrivateKey(value);
  } catch {
    const firstLine = value.split("\n", 1)[0] ?? "";
    // Describe only the shape, never the key material.
    const start = firstLine.startsWith("-----") ? `starts with "${firstLine}"` : "does not start with -----BEGIN";
    throw new Error(`GITHUB_PRIVATE_KEY is not a valid PEM private key (${value.split("\n").length} lines, ${value.length} chars, ${start})`);
  }
  return value;
}

function readPrivateKey(env: NodeJS.ProcessEnv): string {
  const file = env.GITHUB_PRIVATE_KEY_FILE;
  return parsePrivateKey(file ? readFileSync(file, "utf8") : required(env, "GITHUB_PRIVATE_KEY"));
}

/** Reads secrets, then removes them from `env` so tool shells (which inherit process.env) never see them. */
export function takeSecrets(env: NodeJS.ProcessEnv = process.env): Secrets {
  const secrets: Secrets = {
    appId: required(env, "GITHUB_APP_ID"),
    privateKey: readPrivateKey(env),
    webhookSecret: required(env, "GITHUB_WEBHOOK_SECRET"),
    openaiApiKey: env.OPENAI_API_KEY || undefined,
  };
  for (const name of SCRUBBED) delete env[name];
  return secrets;
}
