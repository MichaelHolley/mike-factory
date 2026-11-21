import type { ModelThinkingLevel } from "@earendil-works/pi-ai";
import { parse } from "yaml";

export interface ModelChoice {
  provider: string;
  modelId: string;
}

/** The factory's settings, from env vars; a repo can't change them. */
export interface FactoryConfig {
  owner: string;
  allowedSenderIds: number[];
  model: ModelChoice;
  thinkingLevel: ModelThinkingLevel;
  maxTurns: number;
  maxCostUsd: number;
  maxFixAttempts: number;
}

/** A target repo's own settings, from `.mike.yaml` on its default branch. */
export type RepoSettings = {
  setup: string | null;
  checks: string[];
};

export const REPO_SETTINGS_FILE = ".mike.yaml";

export const DEFAULT_MODEL_ID = "openai/gpt-6.1-sol";

const THINKING_LEVELS = [
  "off",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
] as const satisfies readonly ModelThinkingLevel[];

type Env = Record<string, string | undefined>;

const required = (env: Env, name: string) => {
  const value = env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
};

const positiveNumber = (env: Env, name: string, fallback: number, integer: boolean) => {
  const raw = env[name]?.trim();
  if (!raw) return fallback;

  const value = Number(raw);
  if (!(value > 0) || (integer && !Number.isInteger(value)))
    throw new Error(`${name} must be a positive ${integer ? "integer" : "number"}`);
  return value;
};

const maxFixAttempts = (env: Env) => {
  const raw = env.MAX_FIX_ATTEMPTS?.trim();
  if (!raw) return 2;

  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0) throw new Error("MAX_FIX_ATTEMPTS must be a non-negative integer");
  return value;
};

const senderIds = (env: Env) => {
  const ids = required(env, "ALLOWED_SENDER_IDS")
    .split(",")
    .map((id) => id.trim());

  if (ids.some((id) => !/^\d+$/.test(id)))
    throw new Error("ALLOWED_SENDER_IDS must be comma-separated numeric GitHub user ids");
  return ids.map(Number);
};

const thinkingLevel = (env: Env): ModelThinkingLevel => {
  const value = env.THINKING_LEVEL?.trim() || "high";
  const level = THINKING_LEVELS.find((candidate) => candidate === value);
  if (!level) throw new Error(`THINKING_LEVEL must be one of ${THINKING_LEVELS.join(", ")}`);
  return level;
};

/** Reads the factory's settings from `env`, throwing on a missing required or invalid value. */
export function loadFactoryConfig(env: Env): FactoryConfig {
  return {
    owner: required(env, "OWNER"),
    allowedSenderIds: senderIds(env),
    model: { provider: "openrouter", modelId: env.MODEL?.trim() || DEFAULT_MODEL_ID },
    thinkingLevel: thinkingLevel(env),
    maxTurns: positiveNumber(env, "MAX_TURNS", 60, true),
    maxCostUsd: positiveNumber(env, "MAX_COST_USD", 3, false),
    maxFixAttempts: maxFixAttempts(env),
  };
}

/** Parses `.mike.yaml`; an unknown key or a wrong type throws, naming the key. */
export function parseRepoSettings(source: string): RepoSettings {
  let raw: unknown;
  try {
    raw = parse(source);
  } catch (error) {
    throw new Error(`${REPO_SETTINGS_FILE} is not valid YAML: ${error instanceof Error ? error.message : error}`);
  }

  if (raw == null) return { setup: null, checks: [] };
  if (typeof raw !== "object" || Array.isArray(raw)) throw new Error(`${REPO_SETTINGS_FILE} must be a mapping`);

  const { setup = null, checks = [], ...rest } = raw as Record<string, unknown>;

  const unknown = Object.keys(rest)[0];
  if (unknown !== undefined) throw new Error(`${REPO_SETTINGS_FILE}: unknown key ${unknown}`);

  if (setup !== null && typeof setup !== "string") throw new Error(`${REPO_SETTINGS_FILE}: setup must be a string`);

  if (!Array.isArray(checks) || checks.some((check) => typeof check !== "string"))
    throw new Error(`${REPO_SETTINGS_FILE}: checks must be a list of strings`);

  return { setup: setup || null, checks };
}
