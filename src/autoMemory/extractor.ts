import type { IProviderAdapter, NormalizedMessage } from "../agent/providers/IProviderAdapter";
import {
  buildAutoMemoryExtractionPrompt,
  buildAutoMemoryExtractionSystemPrompt,
} from "./prompt";
import {
  type MemorySuggestion,
  ensureAutoMemoryDir,
  saveAutoMemorySuggestions,
  scanAutoMemoryManifest,
} from "./paths";

type ExtractionRequest = {
  conversationKey: string;
  workspaceRoot: string;
  history: NormalizedMessage[];
  createProvider(systemPrompt: string): IProviderAdapter;
};

type MemoryExtractionResponse = {
  memories?: Array<Partial<MemorySuggestion>>;
};

const EXTRACTION_CONTEXT_OVERLAP = 4;
const MAX_MEMORIES_PER_RUN = 3;
const VALID_MEMORY_TYPES = new Set(["user", "feedback", "project", "reference"]);

export function extractJsonPayload(rawText: string): MemoryExtractionResponse | null {
  const fencedMatch = rawText.match(/```json\s*([\s\S]*?)```/i);
  const candidate = fencedMatch?.[1]?.trim() ?? rawText.trim();
  const firstBraceIndex = candidate.indexOf("{");
  const lastBraceIndex = candidate.lastIndexOf("}");
  if (firstBraceIndex === -1 || lastBraceIndex === -1 || lastBraceIndex <= firstBraceIndex) {
    return null;
  }

  try {
    return JSON.parse(candidate.slice(firstBraceIndex, lastBraceIndex + 1)) as MemoryExtractionResponse;
  } catch {
    return null;
  }
}

export function normalizeSuggestion(rawSuggestion: Partial<MemorySuggestion>): MemorySuggestion | null {
  if (
    typeof rawSuggestion.slug !== "string" ||
    typeof rawSuggestion.name !== "string" ||
    typeof rawSuggestion.description !== "string" ||
    typeof rawSuggestion.type !== "string" ||
    typeof rawSuggestion.hook !== "string" ||
    typeof rawSuggestion.body !== "string"
  ) {
    return null;
  }

  const type = rawSuggestion.type.trim().toLowerCase();
  if (!VALID_MEMORY_TYPES.has(type)) {
    return null;
  }

  const slug = rawSuggestion.slug.trim();
  const name = rawSuggestion.name.trim();
  const description = rawSuggestion.description.trim();
  const hook = rawSuggestion.hook.trim();
  const body = rawSuggestion.body.trim();

  if (!slug || !name || !description || !hook || !body) {
    return null;
  }

  return {
    slug,
    name,
    description,
    type: type as MemorySuggestion["type"],
    hook,
    body,
  };
}

export class AutoMemoryExtractor {
  private readonly pendingByConversation = new Map<string, ExtractionRequest>();
  private readonly runningConversations = new Set<string>();
  private readonly processedMessageCountByConversation = new Map<string, number>();

  markConversationBaseline(conversationKey: string, messageCount: number): void {
    this.processedMessageCountByConversation.set(conversationKey, messageCount);
  }

  resetConversation(conversationKey: string): void {
    this.pendingByConversation.delete(conversationKey);
    this.processedMessageCountByConversation.delete(conversationKey);
  }

  queueExtraction(request: ExtractionRequest): void {
    this.pendingByConversation.set(request.conversationKey, request);
    if (this.runningConversations.has(request.conversationKey)) {
      return;
    }
    void this.drainConversation(request.conversationKey);
  }

  private async drainConversation(conversationKey: string): Promise<void> {
    this.runningConversations.add(conversationKey);

    try {
      while (true) {
        const request = this.pendingByConversation.get(conversationKey);
        if (!request) {
          break;
        }
        this.pendingByConversation.delete(conversationKey);
        await this.executeExtraction(request);
      }
    } finally {
      this.runningConversations.delete(conversationKey);
    }
  }

  private async executeExtraction(request: ExtractionRequest): Promise<void> {
    const lastProcessedCount = this.processedMessageCountByConversation.get(request.conversationKey) ?? 0;
    const currentMessageCount = request.history.length;
    const newMessageCount = currentMessageCount - lastProcessedCount;

    if (newMessageCount <= 0) {
      return;
    }

    await ensureAutoMemoryDir(request.workspaceRoot);
    const existingManifest = await scanAutoMemoryManifest(request.workspaceRoot);
    const provider = request.createProvider(buildAutoMemoryExtractionSystemPrompt());
    const extractionPrompt = buildAutoMemoryExtractionPrompt({
      existingManifest,
      newMessageCount,
      todayIsoDate: new Date().toISOString().slice(0, 10),
    });

    const historyStartIndex = Math.max(0, lastProcessedCount - EXTRACTION_CONTEXT_OVERLAP);
    const extractionHistory: NormalizedMessage[] = [
      ...request.history.slice(historyStartIndex),
      { role: "user", content: extractionPrompt },
    ];

    const step = await provider.runStep(extractionHistory, [], () => {});
    const payload = extractJsonPayload(step.text);
    if (!payload) {
      return;
    }

    const suggestions = (payload.memories ?? [])
      .map(normalizeSuggestion)
      .filter((suggestion): suggestion is MemorySuggestion => suggestion !== null)
      .slice(0, MAX_MEMORIES_PER_RUN);

    await saveAutoMemorySuggestions(request.workspaceRoot, suggestions);
    this.processedMessageCountByConversation.set(request.conversationKey, currentMessageCount);
  }
}
