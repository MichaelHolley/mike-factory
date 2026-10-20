import { readFile } from "node:fs/promises";
import { parse } from "yaml";

export interface ModelChoice {
  provider: string;
  modelId: string;
}

export interface RepoConfig {
  name: string;
  defaultBranch: string;
  setup?: string;
  test?: string;
  lint?: string;
  model: ModelChoice;
  maxTurns: number;
  maxCostUsd: number;
  maxFixAttempts: number;
}

export interface AppConfig {
  owner: string;
  allowedSenderId: number;
  repos: RepoConfig[];
}

type RepoDefaults = Pick<RepoConfig, "model" | "maxTurns" | "maxCostUsd" | "maxFixAttempts">;

const BUILTIN_DEFAULTS: RepoDefaults = {
  model: { provider: "openai", modelId: "gpt-6.1-sol" },
  maxTurns: 60,
  maxCostUsd: 3,
  maxFixAttempts: 2,
};

export function parseConfig(source: string): AppConfig {
  const raw = parse(source) as {
    owner?: unknown;
    allowedSenderId?: unknown;
    defaults?: Partial<RepoDefaults>;
    repos?: Array<Partial<RepoConfig> & { name?: unknown }>;
  };
  if (typeof raw?.owner !== "string") throw new Error("repos.yaml: owner must be a string");
  if (typeof raw.allowedSenderId !== "number") throw new Error("repos.yaml: allowedSenderId must be a number");
  const defaults = { ...BUILTIN_DEFAULTS, ...raw.defaults };
  const repos = (raw.repos ?? []).map((repo): RepoConfig => {
    if (typeof repo.name !== "string") throw new Error("repos.yaml: every repo needs a name");
    return { defaultBranch: "main", ...defaults, ...repo, name: repo.name };
  });
  return { owner: raw.owner, allowedSenderId: raw.allowedSenderId, repos };
}

export async function loadConfig(path: string): Promise<AppConfig> {
  return parseConfig(await readFile(path, "utf8"));
}

export function findRepo(config: AppConfig, name: string): RepoConfig | undefined {
  return config.repos.find((repo) => repo.name === name);
}
