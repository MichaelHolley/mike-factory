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

function readPrivateKey(env: NodeJS.ProcessEnv): string {
  const file = env.GITHUB_PRIVATE_KEY_FILE;
  if (file) return readFileSync(file, "utf8");
  return required(env, "GITHUB_PRIVATE_KEY").replaceAll("\\n", "\n");
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
