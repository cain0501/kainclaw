import { describe, expect, it } from "vitest";
import { getBuiltInSkill, listBuiltInSkills } from "./skillsRegistry";

describe("skillsRegistry", () => {
  it("lists built-in skills and resolves them by id", () => {
    const skills = listBuiltInSkills();

    expect(skills.map(skill => skill.id)).toEqual([
      "verify",
      "review",
      "plan",
      "compact",
      "memory",
      "tools",
      "todo",
    ]);

    expect(getBuiltInSkill("review")).toMatchObject({
      id: "review",
      entrypoint: "/review",
    });
    expect(getBuiltInSkill("missing")).toBeUndefined();
  });
});
