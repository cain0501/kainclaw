import type { IProviderAdapter } from "../agent/providers/IProviderAdapter";
import type { BackgroundTaskRecord } from "../tasks/types";
import type { SkillStore } from "./skillStore";

const DISTILLATION_OUTPUT_TAIL_LIMIT = 4000;

export function meetsDistillationThreshold(task: BackgroundTaskRecord): boolean {
  const toolCallCount = (task.output.match(/\[tool:start\]/g) ?? []).length;
  return toolCallCount >= 5 || task.output.length >= 3000;
}

export function buildDistillationPrompt(task: BackgroundTaskRecord): string {
  const agentType = task.agentType ?? "agent";
  const originalTask =
    typeof task.metadata?.originalTask === "string" && task.metadata.originalTask.trim()
      ? task.metadata.originalTask.trim()
      : typeof task.prompt === "string" && task.prompt.trim()
        ? task.prompt.trim()
        : "(task description not available)";

  const outputTail =
    task.output.length > DISTILLATION_OUTPUT_TAIL_LIMIT
      ? task.output.slice(-DISTILLATION_OUTPUT_TAIL_LIMIT)
      : task.output;

  return [
    "You are an expert at distilling AI agent experience into reusable SKILL.md files.",
    "",
    "A built-in agent just completed a task. Extract the key learnings and produce a single",
    "SKILL.md file that encodes the approach so it can be reused on similar tasks later.",
    "",
    `Agent type: ${agentType}`,
    `Task: ${originalTask}`,
    "",
    "=== Task output (tail) ===",
    outputTail,
    "=== End of output ===",
    "",
    "Produce EXACTLY ONE SKILL.md file using the format below. Output ONLY the SKILL.md content,",
    "starting with --- and ending with the markdown body. Do not include any other text, explanation,",
    "or markdown code fences.",
    "",
    "Required format:",
    "---",
    "name: <kebab-case-skill-name>",
    "description: <one sentence: when to use this skill>",
    "version: 1.0.0",
    "author: KainClaw Auto",
    "tags: [<tag1>, <tag2>]",
    "created_at: \"" + new Date().toISOString() + "\"",
    "source: auto",
    `task_type: ${agentType}`,
    "---",
    "",
    "# <Title>",
    "",
    "## When to use",
    "- <condition 1>",
    "",
    "## Steps",
    "1. <step 1>",
    "",
    "## Pitfalls",
    "- <what NOT to do>",
    "",
    "## Verification",
    "- <how to confirm success>",
  ].join("\n");
}

export type DistillationResult =
  | { ok: true; content: string; name: string }
  | { ok: false; reason: string };

export async function distillSkillFromTask(
  task: BackgroundTaskRecord,
  provider: IProviderAdapter,
): Promise<DistillationResult> {
  const prompt = buildDistillationPrompt(task);

  let responseText = "";

  try {
    const step = await provider.runStep(
      [{ role: "user", content: prompt }],
      [],
      token => {
        responseText += token;
      },
    );

    if (step.text) {
      responseText = step.text;
    }
  } catch (err) {
    return {
      ok: false,
      reason: `Provider call failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  if (!responseText.includes("---")) {
    return { ok: false, reason: "invalid format: no frontmatter boundary found" };
  }

  const frontmatterMatch = /^---\n([\s\S]*?)\n---/.exec(responseText.trim());
  if (!frontmatterMatch) {
    return { ok: false, reason: "invalid format: could not parse frontmatter" };
  }

  let name = "";
  for (const line of frontmatterMatch[1].split("\n")) {
    const colonIdx = line.indexOf(":");
    if (colonIdx < 0) {
      continue;
    }

    const key = line.slice(0, colonIdx).trim();
    const value = line.slice(colonIdx + 1).trim().replace(/^["']|["']$/g, "");

    if (key === "name" && value) {
      name = value;
      break;
    }
  }

  if (!name) {
    return { ok: false, reason: "invalid format: frontmatter missing 'name' field" };
  }

  return { ok: true, content: responseText.trim(), name };
}

export async function distillAndSaveSkill(
  task: BackgroundTaskRecord,
  skillStore: SkillStore,
  provider: IProviderAdapter,
): Promise<void> {
  try {
    const result = await distillSkillFromTask(task, provider);

    if (!result.ok) {
      console.warn(`[skill-distiller] Distillation failed: ${result.reason}`);
      return;
    }

    let name = result.name;

    try {
      await skillStore.create({ name, content: result.content });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("already exists")) {
        const suffix = Date.now().toString(36);
        name = `${name}-${suffix}`;
        await skillStore.create({ name, content: result.content });
      } else {
        throw err;
      }
    }

    console.info(`[skill-distiller] Saved skill: ${name}`);
  } catch (err) {
    console.warn(
      `[skill-distiller] Failed to save skill: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}
