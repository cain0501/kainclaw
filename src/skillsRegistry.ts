export type BuiltInSkillDefinition = {
  id: string;
  title: string;
  summary: string;
  whenToUse: string;
  entrypoint: string;
};

const BUILT_IN_SKILLS: BuiltInSkillDefinition[] = [
  {
    id: "verify",
    title: "Verification",
    summary: "Run the built-in verifier against the current workspace state.",
    whenToUse: "After non-trivial implementation before claiming completion.",
    entrypoint: "/verify",
  },
  {
    id: "review",
    title: "Review",
    summary: "Run a findings-first review against current workspace changes.",
    whenToUse: "When you want bug/risk review instead of another implementation step.",
    entrypoint: "/review",
  },
  {
    id: "plan",
    title: "Plan Mode",
    summary: "Enter read-only plan mode and capture the implementation plan before coding.",
    whenToUse: "Before large or risky changes that should be planned explicitly.",
    entrypoint: "/plan",
  },
  {
    id: "compact",
    title: "Compact Context",
    summary: "Compact earlier conversation context into a continuation summary.",
    whenToUse: "When the conversation is getting large and you want to preserve room for more work.",
    entrypoint: "/compact",
  },
  {
    id: "memory",
    title: "Memory Inspect",
    summary: "Inspect the current workspace auto-memory directory, entrypoint, and manifest.",
    whenToUse: "When you need to see what memory artifacts already exist for the workspace.",
    entrypoint: "/memory",
  },
  {
    id: "tools",
    title: "Tool Search",
    summary: "Search available built-in and MCP tools in the current runtime.",
    whenToUse: "When you want to discover the right tool before asking the agent to use it.",
    entrypoint: "/tools",
  },
  {
    id: "todo",
    title: "Todo Flow",
    summary: "Inspect or write structured TODO tasks backed by the task runtime.",
    whenToUse: "When work should be tracked as structured tasks instead of free-form notes.",
    entrypoint: "/todo / TodoWriteTool",
  },
];

export function listBuiltInSkills(): BuiltInSkillDefinition[] {
  return [...BUILT_IN_SKILLS];
}

export function getBuiltInSkill(
  id: string,
): BuiltInSkillDefinition | undefined {
  const normalized = id.trim().toLowerCase();
  return BUILT_IN_SKILLS.find(skill => skill.id === normalized);
}

export type AllSkills = {
  builtIn: BuiltInSkillDefinition[];
  user: import("./skills/skillStore").SkillRecord[];
};

export async function listAllSkills(
  skillStore?: import("./skills/skillStore").SkillStore,
): Promise<AllSkills> {
  const builtIn = listBuiltInSkills();
  const user = skillStore ? await skillStore.list() : [];
  return { builtIn, user };
}
