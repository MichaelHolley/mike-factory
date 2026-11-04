import { describe, expect, it } from "vitest";
import { loadSkills, parseSkill, SKILLS_DIR } from "./skills.ts";

describe("parseSkill", () => {
  it("splits frontmatter from the body", () => {
    const skill = parseSkill("---\nname: demo\ndescription: >\n  Does a thing.\n---\n\n# Demo\nSteps.\n", "demo/SKILL.md");
    expect(skill).toEqual({ name: "demo", description: "Does a thing.", body: "# Demo\nSteps." });
  });

  it.each(["# No frontmatter", "---\nname: demo\n---\nbody"])("rejects %j", (source) => {
    expect(() => parseSkill(source, "demo/SKILL.md")).toThrow("demo/SKILL.md: frontmatter needs a name and a description");
  });
});

describe("loadSkills", () => {
  it("loads the installed skills", async () => {
    const skills = await loadSkills(SKILLS_DIR);
    expect(skills.map((skill) => skill.name)).toContain("frontend-design");
  });

  it("treats a missing directory as no skills", async () => {
    expect(await loadSkills("does/not/exist")).toEqual([]);
  });
});
