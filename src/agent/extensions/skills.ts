import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { Type } from "@earendil-works/pi-ai";
import { defineExtension, defineTool, section } from "@earendil-works/pi-durable";
import { parse } from "yaml";
import { text } from "./text.ts";

export const SKILLS_DIR = ".agents/skills";

export interface Skill {
  name: string;
  description: string;
  body: string;
}

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/;

export function parseSkill(source: string, file: string): Skill {
  const match = FRONTMATTER.exec(source);
  let meta: { name?: unknown; description?: unknown } | null = null;
  try {
    meta = match ? parse(match[1]!) : null;
  } catch (error) {
    throw new Error(`${file}: ${(error as Error).message}`);
  }
  if (!match || typeof meta?.name !== "string" || typeof meta.description !== "string") {
    throw new Error(`${file}: frontmatter needs a name and a description`);
  }
  return { name: meta.name, description: meta.description.trim(), body: source.slice(match[0].length).trim() };
}

/** Reads `<dir>/<skill>/SKILL.md` for every skill folder; a missing `dir` means no skills. */
export async function loadSkills(dir: string): Promise<Skill[]> {
  let names: string[];
  try {
    names = (await readdir(dir, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  return Promise.all(
    names.sort().map(async (name) => {
      const file = join(dir, name, "SKILL.md");
      return parseSkill(await readFile(file, "utf8"), file);
    }),
  );
}

/** Lists the skills in the system prompt and serves their instructions through `load_skill`. */
export function createSkills(skills: readonly Skill[]) {
  const byName = new Map(skills.map((skill) => [skill.name, skill]));
  const listing =
    skills.length === 0
      ? undefined
      : [
          "Skills hold guidance for specific kinds of work. Before starting work a skill covers, call `load_skill` with its name and follow it.",
          "Skills are written for interactive sessions: the issue is your brief, and nobody will answer questions mid-run.",
          ...skills.map((skill) => `- ${skill.name}: ${skill.description}`),
        ].join("\n");

  return defineExtension({
    name: "skills",
    sections: [section("skills", () => listing)],
    tools: [
      defineTool({
        name: "load_skill",
        description: "Load the full instructions of a skill listed in the system prompt.",
        parameters: Type.Object({ name: Type.String({ description: "Skill name, e.g. `frontend-design`." }) }),
        replay: "safe",
        execute: async (args) => {
          const skill = byName.get(args.name);
          if (!skill)
            return {
              output: text(`Unknown skill "${args.name}". Use one listed in the system prompt.`),
              isError: true,
            };
          return { output: text(skill.body) };
        },
      }),
    ],
  });
}
