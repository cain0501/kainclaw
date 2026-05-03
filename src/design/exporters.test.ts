import os from "node:os";
import path from "node:path";
import { promises as fs } from "node:fs";

import { afterEach, describe, expect, it } from "vitest";

import { buildDesignExportPath, exportDesignHtml, exportDesignPptx } from "./exporters";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map(dir => fs.rm(dir, { recursive: true, force: true })),
  );
});

describe("design exporters", () => {
  it("builds export paths under the design exports directory", () => {
    const exportPath = buildDesignExportPath({
      storageRoot: "E:\\repo\\.tmp",
      format: "html",
      projectLabel: "landing page",
    });

    expect(exportPath).toContain(path.join("exports", "landing-page-"));
    expect(exportPath.endsWith(".html")).toBe(true);
  });

  it("writes HTML exports with slider defaults inlined into :root", async () => {
    const storageRoot = await fs.mkdtemp(path.join(os.tmpdir(), "kc-design-export-"));
    tempDirs.push(storageRoot);

    const exportPath = await exportDesignHtml({
      storageRoot,
      html: "<!DOCTYPE html><html><head><style>:root{--color-primary:#000;}</style></head><body><main>Hello</main></body></html>",
      sliders: [
        {
          id: "primary",
          label: "Primary",
          type: "color",
          cssVar: "--color-primary",
          default: "#111111",
        },
        {
          id: "spacing",
          label: "Spacing",
          type: "range",
          cssVar: "--spacing-base",
          default: 16,
          min: 8,
          max: 32,
          unit: "px",
        },
      ],
      projectLabel: "design-a",
    });

    const exported = await fs.readFile(exportPath, "utf8");
    expect(exported).toContain("--color-primary: #111111;");
    expect(exported).toContain("--spacing-base: 16px;");
    expect(exported).toContain("<!DOCTYPE html>");
  });

  it("writes a pptx export package for slide-like html", async () => {
    const storageRoot = await fs.mkdtemp(path.join(os.tmpdir(), "kc-design-export-"));
    tempDirs.push(storageRoot);

    const exportPath = await exportDesignPptx({
      storageRoot,
      html: `<!DOCTYPE html><html><body><section class="slide"><main>Slide A</main></section><section class="slide"><main>Slide B</main></section></body></html>`,
      sliders: [],
      projectLabel: "deck-a",
      renderSlideImage: async (_html, index) => Buffer.from(`png-${index}`),
    });

    const exported = await fs.readFile(exportPath);
    expect(exportPath.endsWith(".pptx")).toBe(true);
    expect(exported.slice(0, 2).toString("binary")).toBe("PK");
    expect(exported.includes(Buffer.from("[Content_Types].xml"))).toBe(true);
    expect(exported.includes(Buffer.from("ppt/presentation.xml"))).toBe(true);
    expect(exported.includes(Buffer.from("ppt/slides/slide1.xml"))).toBe(true);
    expect(exported.includes(Buffer.from("ppt/slides/slide2.xml"))).toBe(true);
    expect(exported.includes(Buffer.from("ppt/media/slide-1.png"))).toBe(true);
    expect(exported.includes(Buffer.from("ppt/media/slide-2.png"))).toBe(true);
  });
});
