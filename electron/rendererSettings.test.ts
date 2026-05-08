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

    expect(html).toContain('id="page-design"');
    expect(html).toContain('id="design-prompt-input"');
    expect(html).toContain('id="design-generate-btn"');
    expect(html).toContain('id="design-mode-edit-btn"');
    expect(html).toContain('id="design-mode-new-btn"');
    expect(html).toContain("function openDesignHub()");
    expect(html).toContain('id="page-midtai"');
    expect(html).toContain('id="midtai-state-chip"');
    expect(html).toContain('id="mtbar-img"');
    expect(html).toContain('id="mtbar-design"');
    expect(html).toContain('id="canvas-toolbar"');
    expect(html).toContain("function updateStateChip()");
    expect(html).toContain("function openCanvas(projectName)");
    expect(html).toContain("function exitCanvas()");
    expect(html).toContain('id="design-sliders-panel"');
    expect(html).toContain('id="design-patch-popover"');
    expect(html).toContain('id="design-patch-comment"');
    expect(html).toContain('id="design-image-lab-btn"');
    expect(html).toContain('id="design-versions-panel"');
    expect(html).toContain('id="design-direction-panel"');
    expect(html).toContain('id="design-reference-panel"');
    expect(html).toContain('id="design-reference-input"');
    expect(html).toContain('id="design-export-html-btn"');
    expect(html).toContain('id="design-export-pdf-btn"');
    expect(html).toContain('id="design-export-pptx-btn"');
    expect(html).toContain('id="design-tweaks-btn" class="btn-secondary" onclick="toggleDesignTweaks()"');
    expect(html).toContain("function generateDesignWorkbench()");
    expect(html).toContain("function applyDesignPatchRequest()");
    expect(html).toContain("function buildDesignImageLabPrompt(node, comment)");
    expect(html).toContain("function sendDesignImageNodeToImageLab()");
    expect(html).toContain("midtaiState.replaceCtx = {");
    expect(html).toContain("element: node.selector");
    expect(html).toContain("replaceCtx: midtaiState.replaceCtx");
    expect(html).toContain("resolveInferredImageRatio");
    expect(html).toContain("applyInferredImageRatio");
    expect(html).toContain("function loadDesignVersions()");
    expect(html).toContain("function restoreDesignVersion(versionId)");
    expect(html).toContain("function exportDesignWorkbench(format)");
    expect(html).toContain("function chooseDesignDirection(directionId)");
    expect(html).toContain("function skipDesignDirectionSuggestions()");
    expect(html).toContain("function renderDesignReferencePanel(metaEl, previewEl)");
    expect(html).toContain("function handleDesignReferenceUpload(event)");
    expect(html).toContain("function pickLatestImageLabResultForDesign()");
    expect(html).toContain("function clearDesignReference()");
    expect(patchableSrcdocMatches).toHaveLength(1);
    expect(html).toContain("const hasSliders = (designBridgeState.sliders?.length ?? 0) > 0;");
    expect(html).toContain("const tweaksAvailable = designBridgeState.editModeAvailable || hasSliders;");
    expect(html).toContain("tweaksBtn.disabled = !tweaksAvailable;");
    expect(html).toContain("tweaksBtn.style.display = designBridgeState.html ? 'inline-flex' : 'none';");
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
    expect(html).toContain("生成规格");
    expect(html).toContain("最近支持规格");
    expect(html).toContain("insertToDesign('${result.src}')");
    expect(html).toContain("design:patchImageNode");
    expect(html).toContain("frameEl.onload = () => {");
    expect(html).toContain("applyAllDesignSliderValues(frameEl);");
    expect(html).toContain("designBridgeRenderedToken = 0;");
    expect(html).toContain("referenceImageDataUrl");
    expect(html).toContain("referenceImageMimeType");
    expect(html).toContain("window.electronAPI.exportDesignPptx");
    expect(html).toContain("window.electronAPI.exportDesignHtml");
    expect(html).not.toContain("type: 'design:export'");
    expect(html).toContain("case 'design:patchResult':");
    expect(html).toContain("case 'design:result':");
    expect(html).toContain("case 'design:versions':");
    expect(html).toContain("case 'design:directions':");
    expect(html).toContain("case 'design:exportDone':");
    expect(html).toContain("artifact:openKainClawDesign");
    expect(html).toContain("kainclawDesign:open");
    expect(html).toContain("__edit_mode_available");
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
    expect(html).toContain("正在加载版本记录...");
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
});
