import { readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

describe("Electron renderer settings", () => {
  it("keeps the add-provider entry point visible in the settings provider section", async () => {
    const rendererPath = path.join(__dirname, "renderer", "index.html");
    const html = await readFile(rendererPath, "utf8");

    expect(html).toContain('onclick="showAddProvider()"');
    expect(html).toContain('<option value="claude-cli">Claude CLI</option>');
  });

  it("renders the interface language card through a dedicated advanced slot", async () => {
    const rendererPath = path.join(__dirname, "renderer", "index.html");
    const html = await readFile(rendererPath, "utf8");

    expect(html).toContain('id="settings-language-card-slot"');
    expect(html).toContain('data-settings-language-card="true"');
    expect(html).toContain("languageCardSlot.replaceChildren(languageSection)");
  });

  it("routes chat shell copy through the shared Electron shell language table", async () => {
    const rendererPath = path.join(__dirname, "renderer", "index.html");
    const html = await readFile(rendererPath, "utf8");

    expect(html).toContain("const DEFAULT_SHELL_STRINGS = {");
    expect(html).toContain("function localizeChatSurface()");
    expect(html).toContain("function localizeSecondarySurfaces()");
    expect(html).toContain("currentShellStrings.surfaceTextMap");
    expect(html).toContain("shellText('sessionSectionTitle')");
    expect(html).toContain("shellText('composerPlaceholder')");
  });

  it("routes native dialogs and shell status surfaces through the shared translation helper", async () => {
    const rendererPath = path.join(__dirname, "renderer", "index.html");
    const html = await readFile(rendererPath, "utf8");

    expect(html).toContain("function translateSurfaceText(value)");
    expect(html).toContain("function localizedAlert(message)");
    expect(html).toContain("function localizedConfirm(message)");
    expect(html).toContain("toast.textContent = translateSurfaceText(message);");
    expect(html).toContain("status.textContent = translateSurfaceText(message);");
    expect(html).toContain("document.getElementById('win-controls')");
    expect(html).toContain("document.getElementById('artifacts-panel-deep-edit')");
  });

  it("recognizes active worktree sessions in the workspace status surface", async () => {
    const rendererPath = path.join(__dirname, "renderer", "index.html");
    const html = await readFile(rendererPath, "utf8");

    expect(html).toContain("case 'active_worktree_session':");
    expect(html).toContain("shellText('workspaceStatusWorktree')");
  });

  it("includes the KainClaw Design bridge surface and artifact handoff wiring", async () => {
    const rendererPath = path.join(__dirname, "renderer", "index.html");
    const html = await readFile(rendererPath, "utf8");
    const patchableSrcdocMatches = html.match(/function buildDesignPatchableSrcdoc\(/g) ?? [];

    expect(html).toContain("function openDesignHub()");
    expect(html).toContain("function showDesignPage()");
    expect(html).toContain("openMidtai({");
    expect(html).toContain('id="page-midtai"');
    expect(html).toContain('id="midtai-state-chip"');
    expect(html).toContain('id="mtbar-img"');
    expect(html).toContain('id="mtbar-design"');
    expect(html).toContain('id="canvas-toolbar"');
    expect(html).toContain("const promptInput = document.getElementById('midtai-design-prompt');");
    expect(html).toContain("const outputTypeSelect = document.getElementById('midtai-output-type');");
    expect(html).toContain("const midtaiProjectNameEl = document.getElementById('midtai-design-chat-project-name');");
    expect(html).toContain("const midtaiProjectMetaEl = document.getElementById('midtai-design-chat-project-meta');");
    expect(html).toContain("const slidersPanel = document.getElementById('midtai-sliders-panel');");
    expect(html).toContain("const midtaiCanvasTweaksBtn = document.getElementById('midtai-canvas-tweak-btn');");
    expect(html).toContain("function updateStateChip()");
    expect(html).toContain("function openCanvas(projectName)");
    expect(html).toContain("function exitCanvas()");
    expect(html).toContain('id="midtai-canvas-tweak-btn"');
    expect(html).toContain('id="midtai-sliders-panel"');
    expect(html).toContain('id="mnp-image-actions"');
    expect(html).toContain('id="mnp-patch-comment"');
    expect(html).toContain('id="mnp-patch-status"');
    expect(html).toContain('id="mnp-patch-apply-btn"');
    expect(html).toContain('id="midtai-versions-panel"');
    expect(html).toContain('id="view-design-versions"');
    expect(html).toContain('id="midtai-design-versions-list"');
    expect(html).toContain('id="midtai-export-menu"');
    expect(html).toContain("function showMidtaiNodePanel(node, isImg)");
    expect(html).toContain("function hideMidtaiNodePanel()");
    expect(html).toContain("function applyMidtaiCanvasPatch()");
    expect(html).toContain("function setMidtaiCanvasMode(mode)");
    expect(html).toContain("function generateDesignWorkbench()");
    expect(html).toContain("midtaiState.replaceCtx = {");
    expect(html).toContain("replaceCtx: midtaiState.replaceCtx");
    expect(html).toContain("resolveInferredImageRatio");
    expect(html).toContain("applyInferredImageRatio");
    expect(html).toContain("function loadDesignVersions()");
    expect(html).toContain("function renderMidtaiVersionsPanel(panel)");
    expect(html).toContain("function toggleMidtaiVersionsPanel()");
    expect(html).toContain("function restoreDesignVersion(versionId)");
    expect(html).toContain("function toggleMidtaiExportMenu(forceOpen)");
    expect(html).toContain("function exportDesign(format)");
    expect(html).toContain("function exportDesignWorkbench(format)");
    expect(html).toContain("function chooseDesignDirection(directionId)");
    expect(html).toContain("function skipDesignDirectionSuggestions()");
    expect(html).toContain("function inferDesignChatLanguage()");
    expect(html).toContain("function localizeQuestionLabel(question)");
    expect(html).toContain('id="midtai-showcase-panel"');
    expect(html).toContain("const SHOWCASE_TEMPLATES = [");
    expect(html).toContain("function toggleShowcase(");
    expect(html).toContain("function applyShowcaseTemplate(id)");
    expect(html).toContain('id="midtai-guide-form"');
    expect(html).toContain("const GUIDE_FORM_CONFIG = {");
    expect(html).toContain("function openGuideForm()");
    expect(html).toContain("function submitGuideForm()");
    expect(html).toContain("designBridgeState.userContext");
    expect(html).toContain('id="tab-brand"');
    expect(html).toContain('id="midtai-brand-picker"');
    expect(html).toContain("const BRAND_SYSTEMS = [");
    expect(html).toContain("function switchDirectionTab(tab)");
    expect(html).toContain("function renderBrandPicker()");
    expect(html).toContain("function selectBrand(id)");
    expect(html).toContain("brandContext:");
    expect(html).toContain("function renderDesignReferencePanel(metaEl, previewEl)");
    expect(html).toContain("function handleDesignReferenceUpload(event)");
    expect(html).toContain("function clearDesignReference()");
    expect(patchableSrcdocMatches).toHaveLength(1);
    expect(html).toContain("const hasSliders = (designBridgeState.sliders?.length ?? 0) > 0;");
    expect(html).toContain("const tweaksAvailable = designBridgeState.editModeAvailable || hasSliders;");
    expect(html).toContain("This artifact does not expose tweak mode yet.");
    expect(html).toContain("tagName: el.tagName.toLowerCase()");
    expect(html).toContain("alt: el.getAttribute('alt') || ''");
    expect(html).toContain("ariaLabel: el.getAttribute('aria-label') || ''");
    expect(html).toContain("type: '__kc_apply_slider_values'");
    expect(html).toContain("targetWindow.postMessage({");
    expect(html).not.toContain("const doc = frameEl?.contentWindow?.document;");
    expect(html).toContain("openMidtai({");
    expect(html).toContain("contentType: 'img'");
    expect(html).toContain("send({ type: 'image:loadState' });");
    expect(html).toContain("inferredRatio");
    expect(html).toContain("function applyInferredImageRatio(inferredRatio)");
    expect(html).toContain("sizeByRatio[inferredRatio] || '1024x1024'");
    expect(html).toContain("function insertImageChatResultToDesign(imageId, imageUrl)");
    expect(html).toContain("insertToDesign(imageId, imageUrl)");
    expect(html).toContain("design:patchImageNode");
    expect(html).toContain("referenceImageDataUrl");
    expect(html).toContain("referenceImageMimeType");
    expect(html).toContain("window.electronAPI.exportDesignPptx");
    expect(html).toContain("window.electronAPI.exportDesignHtml");
    expect(html).toContain("window.electronAPI.exportDesignZip");
    expect(html).not.toContain("type: 'design:export'");
    expect(html).toContain("case 'design:patchResult':");
    expect(html).toContain("case 'design:result':");
    expect(html).toContain("case 'design:versions':");
    expect(html).toContain("case 'design:directions':");
    expect(html).toContain("case 'design:exportDone':");
    expect(html).toContain("question.zhLabel");
    expect(html).toContain("card.zhSummary");
    expect(html).toContain("form.zhDescription");
    expect(html).toContain("artifact:openKainClawDesign");
    expect(html).toContain("kainclawDesign:open");
  });

  it("hydrates Midtai design payloads into the shared design bridge state before switching views", async () => {
    const rendererPath = path.join(__dirname, "renderer", "index.html");
    const html = await readFile(rendererPath, "utf8");

    expect(html).toContain("function syncMidtaiDesignPayload(payload)");
    expect(html).toContain("designBridgeState.html = activeVersion?.html || artifact?.content || designBridgeState.html || '';");
    expect(html).toContain("designBridgeState.sliders = Array.isArray(activeVersion?.sliders) ? activeVersion.sliders : [];");
    expect(html).toContain("designBridgeState.sliderValues = activeVersion?.sliderValues && typeof activeVersion.sliderValues === 'object'");
    expect(html).toContain("syncMidtaiDesignPayload(payload);");
  });

  it("keeps Midtai version history scoped to the active project and refreshes it on first canvas entry", async () => {
    const rendererPath = path.join(__dirname, "renderer", "index.html");
    const html = await readFile(rendererPath, "utf8");

    expect(html).toContain("return versions.filter(version => version?.projectId === currentProjectId);");
    expect(html).toContain("loadDesignVersions();");
    expect(html).toContain("function renderMidtaiVersionsPanel(panel)");
    expect(html).toContain("panel.id === 'midtai-design-versions-list'");
  });

  it("uses the Midtai design tab as a project workbench instead of the legacy preview and works tabs", async () => {
    const rendererPath = path.join(__dirname, "renderer", "index.html");
    const html = await readFile(rendererPath, "utf8");

    expect(html).toContain('data-view="design-chat"');
    expect(html).toContain('id="view-design-chat"');
    expect(html).toContain('id="view-design-versions"');
    expect(html).toContain('id="view-canvas"');
    expect(html).toContain('id="midtai-design-chat-project-name"');
    expect(html).toContain('id="midtai-design-versions-list"');
    expect(html).toContain("function handleMidtaiDesignTabOpen()");
    expect(html).toContain("function syncMidtaiDesignWorkspaceHeader()");
    expect(html).toContain("showDesignView('design-chat')");
  });

  it("keeps MCP configuration actions in the existing MCP page and routes them through IPC", async () => {
    const rendererPath = path.join(__dirname, "renderer", "index.html");
    const html = await readFile(rendererPath, "utf8");

    expect(html).toContain('id="mcp-add-form"');
    expect(html).toContain('onclick="showMcpAddForm()"');
    expect(html).toContain("function submitMcpServer()");
    expect(html).toContain("type: 'mcp:add'");
    expect(html).toContain("type: 'mcp:set-enabled'");
    expect(html).toContain("type: 'mcp:remove'");
    expect(html).toContain("type: 'mcp:login'");
    expect(html).toContain("type: 'mcp:logout'");
    expect(html).toContain("case 'mcp:auth':");
    expect(html).toContain("function renderMcpServers(servers, registryServers, error)");
    expect(html).toContain("const escapedName = escapeHtml(JSON.stringify(String(entry.name || '')));");
    expect(html).toContain("if (id === 'mcp') {\n    refreshMcp();");
  });

  it("preserves design-chat question-form scroll position unless the user was already near the bottom", async () => {
    const rendererPath = path.join(__dirname, "renderer", "index.html");
    const html = await readFile(rendererPath, "utf8");

    expect(html).toContain("const previousScrollTop = wrap.scrollTop;");
    expect(html).toContain("const previousScrollHeight = wrap.scrollHeight;");
    expect(html).toContain("const wasNearBottom = previousScrollHeight - previousScrollTop - wrap.clientHeight <= 40;");
    expect(html).toContain("const heightDelta = wrap.scrollHeight - previousScrollHeight;");
    expect(html).toContain("wrap.scrollTop = Math.max(0, previousScrollTop + heightDelta);");
  });

  it("uses a unified image editor with overall and touch modes instead of a separate legacy text-only modal", async () => {
    const rendererPath = path.join(__dirname, "renderer", "index.html");
    const html = await readFile(rendererPath, "utf8");

    expect(html).toContain('id="chat-image-editor-mode-overall"');
    expect(html).toContain('id="chat-image-editor-mode-touch"');
    expect(html).toContain("function setChatImageEditorMode(mode)");
    expect(html).toContain("chatImageEditorState.mode === 'touch'");
    expect(html).toContain("type: 'image:touchEdit'");
    expect(html).toContain("type: 'chat:imageRun'");
    expect(html).toContain("openMidtaiImageEdit(id, srcOverride, resultOverride)");
    expect(html).toContain("openChatImageEditor(messageIndex, imageIndex);");
    expect(html).not.toContain('id="midtai-img-edit-overlay"');
  });

  it("exports brush-mask edits with an opaque black background and opaque white paint", async () => {
    const rendererPath = path.join(__dirname, "renderer", "index.html");
    const html = await readFile(rendererPath, "utf8");

    expect(html).toContain("const maskData = ctx.getImageData(0, 0, sourceWidth, sourceHeight);");
    expect(html).toContain("maskData.data[index] = 255;");
    expect(html).toContain("maskData.data[index + 3] = 255;");
    expect(html).not.toContain("ctx.putImageData(imageData, 0, 0);");
  });

  it("renders Midtai inside the unified workbench shell structure from jzu", async () => {
    const rendererPath = path.join(__dirname, "renderer", "index.html");
    const html = await readFile(rendererPath, "utf8");

    expect(html).toContain('class="midtai-app"');
    expect(html).toContain('class="midtai-shell"');
    expect(html).toContain('class="midtai-workspace"');
    expect(html).toContain('id="midtai-topbar-headline"');
    expect(html).toContain('id="midtai-goal-text"');
    expect(html).toContain('id="midtai-shell-context"');
    expect(html).toContain("midtai-board-image");
    expect(html).toContain("midtai-board-design");
    expect(html).toContain("midtai-board-library");
    expect(html).toContain("function renderShellContext()");
    expect(html).toContain("const BOARD_META = {");
    expect(html).toContain("function showMidtaiTab(boardName)");
  });

  it("returns image replacement success back to Midtai canvas instead of the legacy design page", async () => {
    const rendererPath = path.join(__dirname, "renderer", "index.html");
    const html = await readFile(rendererPath, "utf8");
    const patchResultIndex = html.indexOf("case 'design:patchImageNode:result':");
    const patchResultSlice = patchResultIndex >= 0
      ? html.slice(patchResultIndex, patchResultIndex + 500)
      : "";

    expect(patchResultSlice).toContain("case 'design:patchImageNode:result':");
    expect(patchResultSlice).toContain("cancelReplace();");
    expect(patchResultSlice).toContain("switchMidtaiType('design');");
    expect(patchResultSlice).toContain("openCanvas(projectLabel);");
    expect(patchResultSlice).not.toContain("showDesignPage();");
  });

  it("keeps design entry state project-driven instead of letting chat history or tab-open heuristics override it", async () => {
    const rendererPath = path.join(__dirname, "renderer", "index.html");
    const html = await readFile(rendererPath, "utf8");
    const historyStart = html.indexOf("case 'design:chat:history':");
    const historyEnd = html.indexOf("case 'design:chat:append':", historyStart);
    const historyBlock = historyStart >= 0 && historyEnd > historyStart ? html.slice(historyStart, historyEnd) : "";
    const tabStart = html.indexOf("function handleMidtaiDesignTabOpen() {");
    const tabEnd = html.indexOf("function chooseDesignEntryPath(path)", tabStart);
    const tabBlock = tabStart >= 0 && tabEnd > tabStart ? html.slice(tabStart, tabEnd) : "";

    expect(html).toContain("function hasDesignChatHistory()");
    expect(html).toContain("function shouldKeepDesignEntryDialog()");
    expect(html).toContain("let designEntryCurrentSelection = null;");
    expect(html).toContain("let designEntryCurrentPending = false;");
    expect(html).toContain("type: 'design:entry-choice'");
    expect(historyBlock).toContain("designChatMessages = Array.isArray(msg.messages) ? msg.messages : [];");
    expect(historyBlock).not.toContain("showDesignView('design-chat');");
    expect(html).toContain("designEntryCurrentPending = !!msg.entryPending;");
    expect(html).toContain("designEntryCurrentSelection = msg.entryPath === 'quick' || msg.entryPath === 'detailed'");
    expect(html).toContain("if (designEntryCurrentPending && !hasDesignEntrySelection() && midtaiState.type === 'design' && midtaiState.shellTab === 'design') {");
    expect(tabBlock).toContain("showDesignView(midtaiState.designTabView || 'design-chat');");
    expect(tabBlock).toContain("if (designEntryAwaitingProjectCreation) {");
    expect(tabBlock).toContain("if (!midtaiState.currentDesignProjectId && !pendingProjectSwitch && !designResumeLookupAttempted) {");
    expect(tabBlock).toContain("if (shouldKeepDesignEntryDialog()) {");
  });

  it("isolates repeated design-chat question forms by message instance instead of reusing one discovery state bucket", async () => {
    const rendererPath = path.join(__dirname, "renderer", "index.html");
    const html = await readFile(rendererPath, "utf8");

    expect(html).toContain("let designChatActiveFormMessageId = null;");
    expect(html).toContain("let designChatPendingFormKey = null;");
    expect(html).toContain("function getDesignChatLatestFormRuntime(formId, preferredMessageId)");
    expect(html).toContain("return `design-chat:${normalizedMessageId || 'active'}:${normalizedFormId}`;");
    expect(html).toContain("return renderQuestionFormMessage(text, -1, messageId);");
    expect(html).toContain("body = formatDesignChatText(message.content || '', String(message?.messageId || ''));");
    expect(html).toContain("designChatActiveFormMessageId = latestFormRuntime.messageId || null;");
    expect(html).toContain("const formRuntime = getDesignChatLatestFormRuntime(formId, designChatActiveFormMessageId);");
    expect(html).toContain("designChatPendingFormKey = getDesignChatFormStateKey(formId, formRuntime.messageId || designChatActiveFormMessageId || '');");
    expect(html).not.toContain("designChatPendingFormId = formId;");
  });

  it("shows a design-chat working state before the first streamed token arrives", async () => {
    const rendererPath = path.join(__dirname, "renderer", "index.html");
    const html = await readFile(rendererPath, "utf8");

    expect(html).toContain("let designChatBuildStatus = {");
    expect(html).toContain("case 'design:chat:build-start':");
    expect(html).toContain("case 'design:chat:build-tool-start':");
    expect(html).toContain("case 'design:chat:build-tool-end':");
    expect(html).toContain("function renderDesignChatBuildStatusBubble()");
    expect(html).toContain("if (!designChatStreamingText && designChatBuildStatus?.active) {");
    expect(html).toContain("parts.push(renderDesignChatBuildStatusBubble());");
    expect(html).toContain("AI 正在工作");
  });

  it("wires image-chat under the image tab without embedding image generation in design-chat", async () => {
    const rendererPath = path.join(__dirname, "renderer", "index.html");
    const html = await readFile(rendererPath, "utf8");

    expect(html).toContain('id="image-chat-thread-panel"');
    const imageFormIndex = html.indexOf('id="midtai-form-img"');
    const imageThreadPanelIndex = html.indexOf('id="image-chat-thread-panel"');
    const imagePreviewIndex = html.indexOf('id="view-img-preview"');
    const imagePreviewBodyIndex = html.indexOf('id="image-chat-preview-body"');
    expect(imageFormIndex).toBeGreaterThanOrEqual(0);
    expect(imageThreadPanelIndex).toBeGreaterThan(imageFormIndex);
    expect(imageThreadPanelIndex).toBeLessThan(imagePreviewIndex);
    expect(imagePreviewBodyIndex).toBeGreaterThan(imagePreviewIndex);
    expect(html.slice(imagePreviewIndex, imagePreviewBodyIndex)).not.toContain('id="image-chat-thread-panel"');
    expect(html).toContain('class="image-chat-composer"');
    expect(html).toContain('class="image-chat-input"');
    expect(html).toContain("function createImageChatThread()");
    expect(html).toContain("function renderImageChatThreadPanel()");
    expect(html).toContain("function renderImageChatThreadMessages()");
    expect(html).toContain("function runImageChatFromComposer()");
    expect(html).toContain("function handleImageChatComposerKey(event)");
    expect(html).toContain("function refreshImageChatThreads()");
    expect(html).toContain("function applyImageChatThreadState(msg)");
    expect(html).toContain("function beginImageChatPendingRun(prompt, options = {})");
    expect(html).toContain("function completeImageChatPendingRun(status, options = {})");
    expect(html).toContain("function renderImageChatStageSection(stageImage)");
    expect(html).toContain("function openImageChatStageImage(imageId)");
    expect(html).toContain("function insertImageChatResultToDesign(imageId, imageUrl)");
    expect(html).toContain("type: 'image:run'");
    expect(html).toContain("type: 'image:listThreads'");
    expect(html).toContain("type: 'image:loadThread'");
    expect(html).toContain("case 'image:threads':");
    expect(html).toContain("case 'image:threadState':");
    expect(html).toContain("case 'image:result':");
    expect(html).toContain("case 'image:caption':");
    expect(html).toContain("case 'image:error':");
    expect(html).toContain("case 'image:aborted':");
    expect(html).toContain("ownerSurface: 'image-chat'");
    expect(html).toContain("captionsByBatchId: {}");
    expect(html).toContain("optimisticMessages: []");
    expect(html).toContain("pendingRun: null");
    expect(html).toContain("activeStageImageId: null");
    expect(html).toContain('class="image-chat-caption"');
    expect(html).toContain('class="image-chat-stage-card"');
    expect(html).toContain("openImageChatStageImage(decodeURIComponent('${encodedImageId}'))");
    expect(html).toContain("insertImageChatResultToDesign(decodeURIComponent('${encodedImageId}'), decodeURIComponent('${encodedImageSrc}'))");
    expect(html).toContain('id="design-chat-input"');
    expect(html).not.toContain('id="design-image-thread-panel"');
    expect(html).not.toContain("function runDesignImageFromChat()");
    expect(html).not.toContain("type: 'design:imageRun'");
    expect(html).toContain("不写入主 Chat");
  });
});
