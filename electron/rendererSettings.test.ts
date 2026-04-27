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
});
