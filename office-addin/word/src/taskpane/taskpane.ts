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
  type WordParagraphSnapshot,
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
import {
  replaceSelection,
  replaceSelectionWithTracking,
  getSelectedText,
} from "../documentEditor";
import {
  getOpenComments,
  resolveComment,
  type DocumentComment,
} from "../commentHandler";

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

// Edit mode state
let pendingEditText = "";

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

function setDocumentStatus(text: string): void {
  requireElement<HTMLElement>("document-status").textContent = text;
}

function setEditStatus(text: string): void {
  requireElement<HTMLElement>("edit-status").textContent = text;
}

function setCommentStatus(text: string): void {
  requireElement<HTMLElement>("comment-status").textContent = text;
}

function formatContextStatus(options: {
  selectedContext: WordSelectedContext;
  selectionState: WordSelectionState | null;
  selectionModeEnabled: boolean;
}): string {
  const paragraphCount = options.selectedContext.paragraphs.length;
  const tokenText = `~${options.selectedContext.estimatedTokens} tokens`;
  const truncatedText = options.selectedContext.truncated ? " / 已截断" : "";

  if (options.selectionModeEnabled && options.selectionState?.hasSelection) {
    return `选区优先 + ${paragraphCount} 段落 / ${tokenText}${truncatedText}`;
  }
  if (paragraphCount > 0) {
    return `${paragraphCount} 段落 / ${tokenText}${truncatedText}`;
  }
  return "文档为空";
}

function renderSelectionState(selectionState: WordSelectionState | null): void {
  requireElement<HTMLElement>("selection-summary").textContent =
    formatWordSelectionSummary(selectionState);
  requireElement<HTMLElement>("selection-preview").textContent =
    selectionState?.hasSelection
      ? truncateWordSelectionPreview(selectionState.text)
      : "";
}

function renderEditSelectionState(selectionState: WordSelectionState | null): void {
  requireElement<HTMLElement>("edit-selection-summary").textContent =
    formatWordSelectionSummary(selectionState);
  requireElement<HTMLElement>("edit-selection-preview").textContent =
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
      createMessageElement(
        {
          id: "pending",
          role: "assistant",
          content: pendingAssistantText,
          source: SOURCE,
          timestamp: Date.now(),
        },
        paragraphIndex,
      ),
    );
  }
}

function createMessageElement(
  message: OfficeBridgeContextMessage,
  paragraphIndex?: Record<string, WordParagraphSnapshot>,
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
  setStatus("注册中…");
  session = await bridgeClient.register(SOURCE);
  const config = await bridgeClient.fetchConfig(session);
  setStatus("已连接");
  setProvider(`${config.providerType} / ${config.model || "默认"}`);
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
        ? `已加载 ${currentDocumentContext.split("\n").length} 段落`
        : "文档为空",
    );
  } catch (error) {
    currentDocumentContext = "";
    setDocumentStatus(error instanceof Error ? error.message : "文档不可用");
  }
}

async function refreshSelectionContext(): Promise<void> {
  try {
    currentSelectionState = await readSelectionState();
    renderSelectionState(currentSelectionState);
    renderEditSelectionState(currentSelectionState);
  } catch (error) {
    currentSelectionState = null;
    renderSelectionState(null);
    renderEditSelectionState(null);
  }
}

// ── Q&A mode ──

async function submitPrompt(event: SubmitEvent): Promise<void> {
  event.preventDefault();

  if (!session) {
    setStatus("Bridge 不可用");
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
    }).catch(async () => {
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
      formatContextStatus({
        selectedContext: selectedDocumentBundle.selectedContext,
        selectionState: currentSelectionState,
        selectionModeEnabled,
      }),
    );

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

    setStatus("流式回答中…");

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
    setStatus("已连接");
  } catch (error) {
    pendingAssistantText = "";
    setStatus(error instanceof Error ? error.message : String(error));
  } finally {
    sendButton.disabled = false;
  }
}

// ── Edit mode ──

async function submitEditPrompt(event: SubmitEvent): Promise<void> {
  event.preventDefault();

  if (!session) {
    setEditStatus("Bridge 不可用");
    return;
  }

  const promptInput = requireElement<HTMLTextAreaElement>("edit-prompt-input");
  const sendButton = requireElement<HTMLButtonElement>("edit-send-button");
  const prompt = promptInput.value.trim();
  if (!prompt) {
    return;
  }

  sendButton.disabled = true;
  pendingEditText = "";
  setEditStatus("获取选中文字…");

  try {
    const selectedText = await getSelectedText();

    const editRequest = selectedText.trim()
      ? `选中文字：\n${selectedText}\n\n修改要求：${prompt}\n\n请直接输出替换后的文字，不要解释。`
      : `修改要求：${prompt}\n\n请直接输出结果文字，不要解释。`;

    await bridgeClient.appendMessage(session, {
      role: "user",
      content: editRequest,
    });
    promptInput.value = "";

    const context = await bridgeClient.fetchContext(session);
    setEditStatus("AI 生成中…");

    for await (const bridgeEvent of bridgeClient.streamProxy(session, {
      messages: toOfficeBridgeProxyMessages(context),
      stream: true,
    })) {
      const token = readTokenFromEvent(bridgeEvent);
      if (!token) {
        continue;
      }
      pendingEditText += token;
      requireElement<HTMLElement>("edit-result-text").textContent = pendingEditText;
    }

    if (pendingEditText.trim()) {
      await bridgeClient.appendMessage(session, {
        role: "assistant",
        content: pendingEditText,
      });

      const previewEl = requireElement<HTMLElement>("edit-preview");
      previewEl.removeAttribute("hidden");
      requireElement<HTMLElement>("edit-result-text").textContent = pendingEditText;
      setEditStatus("生成完成，请选择操作。");
    } else {
      setEditStatus("AI 未生成有效内容。");
    }
  } catch (error) {
    setEditStatus(error instanceof Error ? error.message : String(error));
  } finally {
    sendButton.disabled = false;
  }
}

async function applyEdit(trackChanges: boolean): Promise<void> {
  if (!pendingEditText.trim()) {
    return;
  }
  try {
    if (trackChanges) {
      await replaceSelectionWithTracking(pendingEditText);
    } else {
      await replaceSelection(pendingEditText);
    }
    discardEdit();
    setEditStatus("已替换。");
  } catch (error) {
    setEditStatus(error instanceof Error ? error.message : "替换失败");
  }
}

function discardEdit(): void {
  pendingEditText = "";
  requireElement<HTMLElement>("edit-result-text").textContent = "";
  requireElement<HTMLElement>("edit-preview").setAttribute("hidden", "");
  setEditStatus("");
}

// ── Comments mode ──

async function loadComments(): Promise<void> {
  setCommentStatus("加载批注中…");
  const listEl = requireElement<HTMLElement>("comments-list");
  listEl.innerHTML = "";

  try {
    const comments = await getOpenComments();
    if (comments.length === 0) {
      listEl.innerHTML = `<p class="comments-empty">文档中没有批注。</p>`;
      setCommentStatus("");
      return;
    }

    for (const comment of comments) {
      listEl.appendChild(createCommentElement(comment));
    }
    setCommentStatus(`共 ${comments.length} 条批注`);
  } catch (error) {
    listEl.innerHTML = `<p class="comments-empty">加载失败：${error instanceof Error ? error.message : String(error)}</p>`;
    setCommentStatus("");
  }
}

function createCommentElement(comment: DocumentComment): HTMLElement {
  const el = document.createElement("article");
  el.className = "comment-item";
  el.dataset.commentId = comment.id;

  const anchoredEl = document.createElement("div");
  anchoredEl.className = "comment-anchored";
  anchoredEl.textContent = comment.anchoredText || "（无锚定文字）";

  const contentEl = document.createElement("div");
  contentEl.className = "comment-content";
  contentEl.textContent = comment.content;

  const actionsEl = document.createElement("div");
  actionsEl.className = "comment-actions";

  const aiResolveBtn = document.createElement("button");
  aiResolveBtn.type = "button";
  aiResolveBtn.className = "btn-primary";
  aiResolveBtn.textContent = "AI 处理";
  aiResolveBtn.addEventListener("click", () => {
    void handleAiResolveComment(comment, el);
  });

  actionsEl.append(aiResolveBtn);
  el.append(anchoredEl, contentEl, actionsEl);
  return el;
}

async function handleAiResolveComment(
  comment: DocumentComment,
  itemEl: HTMLElement,
): Promise<void> {
  if (!session) {
    setCommentStatus("Bridge 不可用");
    return;
  }

  setCommentStatus(`处理批注 ${comment.id}…`);

  try {
    const request =
      `文档中有如下批注：\n` +
      `锚定文字：${comment.anchoredText}\n` +
      `批注内容：${comment.content}\n\n` +
      `请根据批注意见修改锚定文字，并给出简短的回复说明你做了什么修改。` +
      `回复格式：\n修改后文字：<修改后的文字>\n回复：<回复内容>`;

    await bridgeClient.appendMessage(session, { role: "user", content: request });
    const context = await bridgeClient.fetchContext(session);

    let reply = "";
    for await (const event of bridgeClient.streamProxy(session, {
      messages: toOfficeBridgeProxyMessages(context),
      stream: true,
    })) {
      const token = readTokenFromEvent(event);
      if (token) {
        reply += token;
      }
    }

    await bridgeClient.appendMessage(session, { role: "assistant", content: reply });

    const editedMatch = /修改后文字[：:]\s*(.+?)(?:\n|$)/s.exec(reply);
    const replyMatch = /回复[：:]\s*(.+?)(?:\n|$)/s.exec(reply);

    const editedText = editedMatch?.[1]?.trim() ?? "";
    const replyText = replyMatch?.[1]?.trim() ?? "AI 已处理批注";

    if (editedText) {
      await resolveComment(comment.id, editedText, replyText);
      itemEl.remove();
      setCommentStatus(`批注已处理。`);
    } else {
      setCommentStatus(`AI 回复解析失败，请手动处理。`);
    }
  } catch (error) {
    setCommentStatus(error instanceof Error ? error.message : "处理失败");
  }
}

// ── Tab switching ──

function switchTab(tabId: string): void {
  document.querySelectorAll<HTMLElement>(".tab-panel").forEach(panel => {
    panel.hidden = panel.id !== `tab-${tabId}`;
  });
  document.querySelectorAll<HTMLButtonElement>(".tab-btn").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.tab === tabId);
  });
}

// ── Bootstrap ──

async function bootstrap(): Promise<void> {
  // Tab bar
  document.querySelectorAll<HTMLButtonElement>(".tab-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const tab = btn.dataset.tab;
      if (tab) {
        switchTab(tab);
      }
    });
  });

  // Q&A mode
  requireElement<HTMLFormElement>("prompt-form").addEventListener("submit", event => {
    void submitPrompt(event);
  });
  requireElement<HTMLButtonElement>("refresh-context-button").addEventListener("click", () => {
    void refreshDocumentContext();
  });
  requireElement<HTMLButtonElement>("refresh-selection-button").addEventListener("click", () => {
    void refreshSelectionContext();
  });
  requireElement<HTMLElement>("message-list").addEventListener("click", event => {
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

  // Edit mode
  requireElement<HTMLFormElement>("edit-form").addEventListener("submit", event => {
    void submitEditPrompt(event);
  });
  requireElement<HTMLButtonElement>("edit-refresh-selection").addEventListener("click", () => {
    void refreshSelectionContext();
  });
  requireElement<HTMLButtonElement>("apply-edit-button").addEventListener("click", () => {
    void applyEdit(false);
  });
  requireElement<HTMLButtonElement>("apply-edit-track-button").addEventListener("click", () => {
    void applyEdit(true);
  });
  requireElement<HTMLButtonElement>("discard-edit-button").addEventListener("click", () => {
    discardEdit();
  });

  // Comments mode
  requireElement<HTMLButtonElement>("load-comments-button").addEventListener("click", () => {
    void loadComments();
  });

  // Connect to bridge
  try {
    if (Office?.onReady) {
      await Office.onReady();
    }
    await initializeBridge();
  } catch (error) {
    setStatus(error instanceof Error ? error.message : "Bridge 不可用");
    setProvider("不可用");
  }
}

void bootstrap();
