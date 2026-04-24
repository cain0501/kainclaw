import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { IProviderAdapter, NormalizedMessage, NormalizedStep } from "../agent/providers/IProviderAdapter";
import { getAutoMemoryDir, scanAutoMemoryManifest } from "./paths";
import { AutoMemoryExtractor } from "./extractor";

const tempDirs: string[] = [];

class FakeProvider implements IProviderAdapter {
  constructor(private readonly text: string) {}

  async runStep(
    _messages: NormalizedMessage[],
    _tools: unknown[],
    _onToken: (token: string) => void,
  ): Promise<NormalizedStep> {
    return {
      text: this.text,
      toolCalls: [],
      done: true,
    };
  }
}

async function waitFor(
  predicate: () => Promise<boolean>,
  timeoutMs = 3000,
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await predicate()) {
      return;
    }
    await new Promise(resolve => setTimeout(resolve, 25));
  }
  throw new Error("Timed out waiting for async auto-memory work.");
}

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map(dir => fs.rm(dir, { recursive: true, force: true })),
  );
});

describe("AutoMemoryExtractor", () => {
  it("skips extraction when no new messages were added after baseline", async () => {
    const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "cain-automemory-"));
    tempDirs.push(workspaceRoot, getAutoMemoryDir(workspaceRoot));
    const extractor = new AutoMemoryExtractor();

    extractor.markConversationBaseline("conv-1", 2);
    extractor.queueExtraction({
      conversationKey: "conv-1",
      workspaceRoot,
      history: [
        { role: "user", content: "one" },
        { role: "assistant", content: "two" },
      ],
      createProvider: () => new FakeProvider('{"memories":[{"slug":"ignored.md","name":"Ignored","description":"Ignored","type":"feedback","hook":"Ignored","body":"Ignored"}]}'),
    });

    await new Promise(resolve => setTimeout(resolve, 100));
    const manifest = await scanAutoMemoryManifest(workspaceRoot);

    expect(manifest).toEqual([]);
  });

  it("extracts valid memories and caps them at three suggestions", async () => {
    const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "cain-automemory-"));
    tempDirs.push(workspaceRoot, getAutoMemoryDir(workspaceRoot));
    const extractor = new AutoMemoryExtractor();

    extractor.queueExtraction({
      conversationKey: "conv-2",
      workspaceRoot,
      history: [
        { role: "user", content: "remember my style" },
        { role: "assistant", content: "will do" },
      ],
      createProvider: () =>
        new FakeProvider(`{"memories":[
          {"slug":"one.md","name":"One","description":"Desc 1","type":"feedback","hook":"Hook 1","body":"Body 1"},
          {"slug":"two.md","name":"Two","description":"Desc 2","type":"project","hook":"Hook 2","body":"Body 2"},
          {"slug":"three.md","name":"Three","description":"Desc 3","type":"reference","hook":"Hook 3","body":"Body 3"},
          {"slug":"four.md","name":"Four","description":"Desc 4","type":"user","hook":"Hook 4","body":"Body 4"}
        ]}`),
    });

    await waitFor(async () => (await scanAutoMemoryManifest(workspaceRoot)).length === 3);
    const manifest = await scanAutoMemoryManifest(workspaceRoot);

    expect(manifest).toHaveLength(3);
    expect(manifest.map(entry => entry.relativePath)).toEqual([
      "one.md",
      "three.md",
      "two.md",
    ]);
  });

  it("ignores malformed payloads and invalid suggestions", async () => {
    const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "cain-automemory-"));
    tempDirs.push(workspaceRoot, getAutoMemoryDir(workspaceRoot));
    const extractor = new AutoMemoryExtractor();

    extractor.queueExtraction({
      conversationKey: "conv-3",
      workspaceRoot,
      history: [
        { role: "user", content: "remember this" },
        { role: "assistant", content: "working on it" },
      ],
      createProvider: () =>
        new FakeProvider(`\`\`\`json
{"memories":[
  {"slug":"valid.md","name":"Valid","description":"Desc","type":"feedback","hook":"Hook","body":"Body"},
  {"slug":"bad-type.md","name":"Bad","description":"Desc","type":"invalid","hook":"Hook","body":"Body"},
  {"slug":"","name":"Empty slug","description":"Desc","type":"feedback","hook":"Hook","body":"Body"}
]}
\`\`\``),
    });

    await waitFor(async () => (await scanAutoMemoryManifest(workspaceRoot)).length === 1);
    const manifest = await scanAutoMemoryManifest(workspaceRoot);

    expect(manifest).toEqual([
      {
        relativePath: "valid.md",
        name: "Valid",
        description: "Desc",
        type: "feedback",
      },
    ]);
  });
});
