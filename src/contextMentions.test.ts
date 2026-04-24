import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  buildPromptFileMentionContext,
  extractPromptFileMentions,
} from "./contextMentions";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map(dir => fs.rm(dir, { recursive: true, force: true })),
  );
});

describe("contextMentions", () => {
  it("extracts unique @file mentions from a prompt", () => {
    expect(
      extractPromptFileMentions(
        "Review @src/toolRuntime.ts and @docs/guide.md, then revisit @src/toolRuntime.ts.",
      ),
    ).toEqual(["src/toolRuntime.ts", "docs/guide.md"]);
  });

  it("builds supplemental context for referenced workspace files", async () => {
    const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "cain-mentions-"));
    tempDirs.push(workspaceRoot);
    await fs.mkdir(path.join(workspaceRoot, "src"), { recursive: true });
    await fs.writeFile(
      path.join(workspaceRoot, "src", "toolRuntime.ts"),
      "export const value = 1;\n",
      "utf8",
    );

    const result = await buildPromptFileMentionContext({
      prompt: "Please inspect @src/toolRuntime.ts before editing.",
      workspaceRoot,
    });

    expect(result.resolvedFiles).toEqual(["src/toolRuntime.ts"]);
    expect(result.supplementalPrompt).toContain("high-priority context");
    expect(result.supplementalPrompt).toContain("## src/toolRuntime.ts");
    expect(result.supplementalPrompt).toContain("export const value = 1;");
  });
});
