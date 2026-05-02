import { readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

describe("Electron renderer settings", () => {
  it("keeps the add-provider entry point visible in the settings provider section", async () => {
    const rendererPath = path.join(__dirname, "renderer", "index.html");
    const html = await readFile(rendererPath, "utf8");

    expect(html).toContain('onclick="showAddProvider()"');
    expect(html).toContain("添加提供商");
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

  it("includes the KainClaw Design bridge surface and artifact handoff wiring", async () => {
    const rendererPath = path.join(__dirname, "renderer", "index.html");
    const html = await readFile(rendererPath, "utf8");

    expect(html).toContain('id="page-design"');
    expect(html).toContain("artifact:openKainClawDesign");
    expect(html).toContain("kainclawDesign:open");
    expect(html).toContain("__edit_mode_available");
  });
});
