import {
  createOfficeBridgeClient,
  toOfficeBridgeProxyMessages,
  type OfficeBridgeContext,
  type OfficeBridgeContextMessage,
  type OfficeBridgeSession,
  type OfficeBridgeSource,
  type OfficeBridgeSseEvent,
} from "../../../../src/officeBridge/bridgeClient";
import {
  buildWordParagraphIndex,
  splitWordReplyIntoSegments,
  type WordSelectedContext,
  type WordDocumentSnapshot,
} from "../../../../src/officeBridge/wordDocumentContext";
import {
  buildWordQuestionPrompt,
  detectWordQuestionMode,
  finalizeWordAssistantReply,
} from "../../../../src/officeBridge/wordQuestionAnswer";
import {
  formatWordSelectedContextSummary,
  mapWordSelectedContextPreviews,
} from "../../../../src/officeBridge/wordSelectedContextView";
import {
  buildWordSelectionContext,
  formatWordSelectionSummary,
  truncateWordSelectionPreview,
  type WordSelectionState,
} from "../../../../src/officeBridge/wordSelectionContext";
import {
  navigateToParagraph,
  readDocumentContextBundle,
  readSelectedDocumentContextBundle,
} from "../documentReader";
import { readSelectionState } from "../documentSelection";

declare const Office:
  | {
      onReady?: () => Promise<unknown>;
    }
  | undefined;

const SOURCE: OfficeBridgeSource = "word-addin";
const bridgeClient = createOfficeBridgeClient();

let session: OfficeBridgeSession | null = null;
let pendingAssistantText = "";
let currentDocumentContext = "";
let currentDocumentSnapshot: WordDocumentSnapshot | null = null;
let currentSelectedContext: WordSelectedContext | null = null;
let currentSelectionState: WordSelectionState | null = null;

function requireElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`Missing element: ${id}`);
  }

  return element as T;
}

function setStatus(text: string): void {
  requireElement<HTMLElement>("bridge-status").textContent = text;
}

function setProvider(text: string): void {
  requireElement<HTMLElement>("provider-status").textContent = text;
}

function setSessionId(text: string): void {
  requireElement<HTMLElement>("session-status").textContent = text;
}

function setDocumentStatus(text: string): void {
  requireElement<HTMLElement>("document-status").textContent = text;
}

function formatContextStatus(options: {
  selectedContext: WordSelectedContext;
  selectionState: WordSelectionState | null;
  selectionModeEnabled: boolean;
}): string {
  const paragraphCount = options.selectedContext.paragraphs.length;
  const tokenText = `~${options.selectedContext.estimatedTokens} tokens`;
  const truncatedText = options.selectedContext.truncated ? " / truncated" : "";

  if (options.selectionModeEnabled && options.selectionState?.hasSelection) {
    return `Selection focus + ${paragraphCount} paragraphs / ${tokenText}${truncatedText}`;
  }

  if (paragraphCount > 0) {
    return `${paragraphCount} paragraphs / ${tokenText}${truncatedText}`;
  }

  return "Document is empty";
}

function renderSelectionState(selectionState: WordSelectionState | null): void {
  requireElement<HTMLElement>("selection-summary").textContent =
    formatWordSelectionSummary(selectionState);
  requireElement<HTMLElement>("selection-preview").textContent =
    selectionState?.hasSelection
      ? truncateWordSelectionPreview(selectionState.text)
      : "";
}

function renderSelectedContext(selectedContext: WordSelectedContext | null): void {
  const summaryEl = requireElement<HTMLElement>("selected-context-summary");
  const listEl = requireElement<HTMLElement>("selected-context-list");

  summaryEl.textContent = formatWordSelectedContextSummary(selectedContext);
  listEl.innerHTML = "";

  if (!selectedContext || selectedContext.paragraphs.length === 0) {
    return;
  }

  for (const item of mapWordSelectedContextPreviews(selectedContext.paragraphs)) {
    const itemEl = document.createElement("article");
    itemEl.className = "selected-context-item";

    const idEl = document.createElement("div");
    idEl.className = "selected-context-id";
    idEl.textContent = `[${item.id}]`;

    const previewEl = document.createElement("div");
    previewEl.className = "selected-context-preview";
    previewEl.textContent = item.preview;

    itemEl.append(idEl, previewEl);
    listEl.append(itemEl);
  }
}

function renderContext(context: OfficeBridgeContext): void {
  const messageList = requireElement<HTMLElement>("message-list");
  messageList.innerHTML = "";
  const paragraphIndex = currentDocumentSnapshot
    ? buildWordParagraphIndex(currentDocumentSnapshot)
    : undefined;

  for (const message of context.messages) {
    messageList.appendChild(createMessageElement(message, paragraphIndex));
  }

  if (pendingAssistantText) {
    messageList.appendChild(
      createMessageElement({
        id: "pending",
        role: "assistant",
        content: pendingAssistantText,
        source: SOURCE,
        timestamp: Date.now(),
      }, paragraphIndex),
    );
  }
}

function createMessageElement(
  message: OfficeBridgeContextMessage,
  paragraphIndex?: Record<string, { text: string }>,
): HTMLElement {
  const messageEl = document.createElement("article");
  messageEl.className = `message ${message.role}`;

  if (message.role !== "assistant") {
    messageEl.textContent = message.content;
    return messageEl;
  }

  for (const paragraphText of message.content.split("\n")) {
    const paragraphEl = document.createElement("p");

    for (const segment of splitWordReplyIntoSegments(paragraphText, paragraphIndex)) {
      if (segment.type === "text") {
        paragraphEl.append(segment.text);
        continue;
      }

      if (!segment.isKnown) {
        paragraphEl.append(segment.raw);
        continue;
      }

      const citationButton = document.createElement("button");
      citationButton.type = "button";
      citationButton.className = "citation-chip";
      citationButton.textContent = segment.raw;
      citationButton.dataset.paragraphId = segment.paragraphId;
      if (segment.previewText) {
        citationButton.title = segment.previewText;
      }
      paragraphEl.append(citationButton);
    }

    messageEl.append(paragraphEl);
  }

  return messageEl;
}

function readTokenFromEvent(event: OfficeBridgeSseEvent): string {
  if (event.event !== "token" || !event.data || typeof event.data !== "object") {
    return "";
  }

  const token = (event.data as { token?: unknown }).token;
  return typeof token === "string" ? token : "";
}

async function refreshContext(): Promise<OfficeBridgeContext | null> {
  if (!session) {
    return null;
  }

  const context = await bridgeClient.fetchContext(session);
  renderContext(context);
  return context;
}

async function initializeBridge(): Promise<void> {
  setStatus("Registering…");

  session = await bridgeClient.register(SOURCE);
  setSessionId(session.sessionId);

  const config = await bridgeClient.fetchConfig(session);
  setStatus("Connected");
  setProvider(`${config.providerType} / ${config.model || "default"}`);

  await refreshContext();
  await refreshDocumentContext();
  await refreshSelectionContext();
}

async function refreshDocumentContext(): Promise<void> {
  try {
    const documentBundle = await readDocumentContextBundle();
    currentDocumentSnapshot = documentBundle.snapshot;
    currentDocumentContext = documentBundle.contextText;
    currentSelectedContext = null;
    renderSelectedContext(null);
    setDocumentStatus(
      currentDocumentContext
        ? `${currentDocumentContext.split("\n").length} paragraphs loaded`
        : "Document is empty",
    );
  } catch (error) {
    currentDocumentContext = "";
    setDocumentStatus(
      error instanceof Error ? error.message : "Document unavailable",
    );
  }
}

async function refreshSelectionContext(): Promise<void> {
  try {
    currentSelectionState = await readSelectionState();
    renderSelectionState(currentSelectionState);
  } catch (error) {
    currentSelectionState = null;
    renderSelectionState(null);
    setStatus(error instanceof Error ? error.message : "Selection unavailable");
  }
}

async function submitPrompt(event: SubmitEvent): Promise<void> {
  event.preventDefault();

  if (!session) {
    setStatus("Bridge unavailable");
    return;
  }

  const promptInput = requireElement<HTMLTextAreaElement>("prompt-input");
  const sendButton = requireElement<HTMLButtonElement>("send-button");
  const prompt = promptInput.value.trim();

  if (!prompt) {
    return;
  }

  sendButton.disabled = true;
  pendingAssistantText = "";

  try {
    const selectionModeToggle = requireElement<HTMLInputElement>("selection-mode-toggle");
    const selectionModeEnabled = selectionModeToggle.checked;
    const questionMode = detectWordQuestionMode(prompt);
    const selectedDocumentBundle = await readSelectedDocumentContextBundle(prompt, {
      maxParagraphs: 8,
      maxTokens: 1500,
      questionMode,
    })
      .catch(async () => {
        if (!currentDocumentContext) {
          await refreshDocumentContext();
        }
        return {
          snapshot: currentDocumentSnapshot,
          selectedContext: {
            paragraphs: [],
            contextText: currentDocumentContext,
            estimatedTokens: 0,
            truncated: false,
          },
        };
      });

    currentDocumentSnapshot = selectedDocumentBundle.snapshot;
    currentDocumentContext = selectedDocumentBundle.selectedContext.contextText;
    currentSelectedContext = selectedDocumentBundle.selectedContext;
    renderSelectedContext(currentSelectedContext);

    if (selectionModeEnabled) {
      await refreshSelectionContext();
    }

    const selectionContext =
      selectionModeEnabled && currentSelectionState?.hasSelection
        ? buildWordSelectionContext(currentSelectionState.text)
        : "";
    setDocumentStatus(
      currentDocumentContext
        ? `${selectedDocumentBundle.selectedContext.paragraphs.length || currentDocumentContext.split("\n").length} paragraphs · ~${selectedDocumentBundle.selectedContext.estimatedTokens} tokens${selectedDocumentBundle.selectedContext.truncated ? " · truncated" : ""}`
        : "Document is empty",
    );

    setDocumentStatus(formatContextStatus({
      selectedContext: selectedDocumentBundle.selectedContext,
      selectionState: currentSelectionState,
      selectionModeEnabled,
    }));

    const composedPrompt = buildWordQuestionPrompt({
      question: prompt,
      documentContext: currentDocumentContext,
      selectionContext,
    });

    await bridgeClient.appendMessage(session, {
      role: "user",
      content: composedPrompt,
    });
    promptInput.value = "";

    const context = await refreshContext();
    if (!context) {
      return;
    }

    setStatus("Streaming reply…");

    for await (const bridgeEvent of bridgeClient.streamProxy(session, {
      messages: toOfficeBridgeProxyMessages(context),
      stream: true,
    })) {
      const token = readTokenFromEvent(bridgeEvent);
      if (!token) {
        continue;
      }

      pendingAssistantText += token;
      renderContext(context);
    }

    if (pendingAssistantText.trim()) {
      await bridgeClient.appendMessage(session, {
        role: "assistant",
        content: finalizeWordAssistantReply({
          reply: pendingAssistantText,
          candidateParagraphs: selectedDocumentBundle.selectedContext.paragraphs,
          availableParagraphs: currentDocumentSnapshot?.paragraphs,
        }),
      });
    }

    pendingAssistantText = "";
    await refreshContext();
    setStatus("Connected");
  } catch (error) {
    pendingAssistantText = "";
    setStatus(error instanceof Error ? error.message : String(error));
  } finally {
    sendButton.disabled = false;
  }
}

async function bootstrap(): Promise<void> {
  const promptForm = requireElement<HTMLFormElement>("prompt-form");
  const refreshButton = requireElement<HTMLButtonElement>("refresh-context-button");
  const refreshSelectionButton = requireElement<HTMLButtonElement>("refresh-selection-button");
  const messageList = requireElement<HTMLElement>("message-list");
  promptForm.addEventListener("submit", event => {
    void submitPrompt(event);
  });
  refreshButton.addEventListener("click", () => {
    void refreshDocumentContext();
  });
  refreshSelectionButton.addEventListener("click", () => {
    void refreshSelectionContext();
  });
  messageList.addEventListener("click", event => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }

    const paragraphId = target.dataset.paragraphId;
    if (!paragraphId) {
      return;
    }

    void navigateToParagraph(paragraphId).catch(error => {
      setStatus(error instanceof Error ? error.message : String(error));
    });
  });

  try {
    if (Office?.onReady) {
      await Office.onReady();
    }

    await initializeBridge();
  } catch (error) {
    setStatus(error instanceof Error ? error.message : "Bridge unavailable");
    setProvider("Unavailable");
  }
}

void bootstrap();
