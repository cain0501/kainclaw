import { promises as fs } from "node:fs";
import path from "node:path";
import { chromium, type Browser, type BrowserContext, type Locator, type Page } from "playwright";
import type { BrowserToolAdapter, ToolExecutionResult } from "./toolRuntime";

type SnapshotRef = {
  selector: string;
  description: string;
};

export function resolveWorkspacePath(workspaceRoot: string, targetPath: string): string {
  const absolutePath = path.resolve(workspaceRoot, targetPath);
  const relativePath = path.relative(workspaceRoot, absolutePath);

  if (
    relativePath === ".." ||
    relativePath.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relativePath)
  ) {
    throw new Error(`Path escapes the workspace: ${targetPath}`);
  }

  return absolutePath;
}

export function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength)}\n\n[truncated ${value.length - maxLength} chars]`;
}

export function escapeAttributeValue(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

export class BrowserRuntime implements BrowserToolAdapter {
  private browser: Browser | undefined;
  private browserContext: BrowserContext | undefined;
  private page: Page | undefined;
  private readonly refs = new Map<string, SnapshotRef>();

  constructor(private readonly getWorkspaceRoot: () => string) {}

  async navigate(url: string): Promise<ToolExecutionResult> {
    const page = await this.ensurePage();
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });

    try {
      await page.waitForLoadState("networkidle", { timeout: 5_000 });
    } catch {
      // Some sites keep long polling connections alive. DOM content is enough.
    }

    const title = (await page.title()) || "[untitled page]";

    return {
      summary: `Opened ${url}`,
      content: `Title: ${title}\nURL: ${page.url()}`,
    };
  }

  async snapshot(maxLength = 6000): Promise<ToolExecutionResult> {
    const page = await this.getActivePage();
    const title = (await page.title()) || "[untitled page]";
    const visibleText = ((await page.locator("body").innerText({ timeout: 5_000 }).catch(() => "")) || "").trim();
    const interactiveElements = await page.evaluate(() => {
      const browserGlobals = globalThis as unknown as {
        document: any;
        CSS: {
          escape(value: string): string;
        };
      };
      const doc = browserGlobals.document;
      const css = browserGlobals.CSS;

      function buildSelector(element: any): string {
        const parts: string[] = [];
        let current: any = element;

        while (current && parts.length < 6) {
          let part = current.nodeName.toLowerCase();
          const currentAny = current as {
            id?: string;
            className?: string;
          };

          if (currentAny.id) {
            part += `#${css.escape(currentAny.id)}`;
            parts.unshift(part);
            break;
          }

          const className =
            typeof currentAny.className === "string"
              ? currentAny.className.trim().split(/\s+/).filter(Boolean).slice(0, 2)
              : [];

          if (className.length > 0) {
            part += className.map((item: string) => `.${css.escape(item)}`).join("");
          }

          const parent = current.parentElement;

          if (parent) {
            const siblings = (Array.from(parent.children) as any[]).filter(
              (child: any) => child.nodeName === current?.nodeName,
            );
            if (siblings.length > 1) {
              part += `:nth-of-type(${siblings.indexOf(current) + 1})`;
            }
          }

          parts.unshift(part);
          current = parent;
        }

        return parts.join(" > ");
      }

      function describeElement(element: any): string {
        const current = element as {
          innerText?: string;
          getAttribute(name: string): string | null;
        };
        const pieces = [element.nodeName.toLowerCase()];
        const text =
          current.innerText?.trim() ||
          current.getAttribute("aria-label") ||
          current.getAttribute("placeholder") ||
          current.getAttribute("value") ||
          "";

        if (current.getAttribute("type")) {
          pieces.push(`type=${current.getAttribute("type")}`);
        }

        if (text) {
          pieces.push(`"${text.replace(/\s+/g, " ").slice(0, 80)}"`);
        }

        return pieces.join(" ");
      }

      return Array.from(
        doc.querySelectorAll(
          'a, button, input, textarea, select, [role="button"], [contenteditable="true"]',
        ),
      )
        .slice(0, 40)
        .map((element, index) => ({
          ref: `ref-${index + 1}`,
          selector: buildSelector(element),
          description: describeElement(element),
        }));
    });

    this.refs.clear();
    for (const item of interactiveElements) {
      this.refs.set(item.ref, {
        selector: item.selector,
        description: item.description,
      });
    }

    const refsText =
      interactiveElements.length > 0
        ? interactiveElements.map(item => `[${item.ref}] ${item.description}\nselector: ${item.selector}`).join("\n")
        : "[no interactive elements detected]";

    return {
      summary: `Captured page snapshot for ${page.url()}`,
      content: [
        `Title: ${title}`,
        `URL: ${page.url()}`,
        "",
        "Visible text:",
        truncate(visibleText || "[no visible text found]", maxLength),
        "",
        "Interactive elements:",
        refsText,
      ].join("\n"),
    };
  }

  async click(input: {
    ref?: string;
    selector?: string;
    text?: string;
  }): Promise<ToolExecutionResult> {
    const page = await this.getActivePage();
    const locator = await this.resolveActionLocator(page, input);
    await locator.click({ timeout: 15_000 });

    return {
      summary: "Clicked browser element",
      content: `Current URL: ${page.url()}`,
    };
  }

  async type(input: {
    ref?: string;
    selector?: string;
    textTarget?: string;
    value: string;
    submit?: boolean;
  }): Promise<ToolExecutionResult> {
    const page = await this.getActivePage();
    const locator = await this.resolveInputLocator(page, input);
    await locator.fill(input.value, { timeout: 15_000 });

    if (input.submit) {
      await locator.press("Enter");
    }

    return {
      summary: "Typed into browser field",
      content: `Current URL: ${page.url()}`,
    };
  }

  async waitFor(input: { text?: string; timeMs?: number }): Promise<ToolExecutionResult> {
    const page = await this.getActivePage();

    if (input.text) {
      await page.getByText(input.text, { exact: false }).first().waitFor({ timeout: input.timeMs ?? 15_000 });
      return {
        summary: `Observed text on page`,
        content: `Found "${input.text}" on ${page.url()}`,
      };
    }

    await page.waitForTimeout(input.timeMs ?? 1000);
    return {
      summary: "Waited in browser session",
      content: `Waited ${input.timeMs ?? 1000}ms on ${page.url()}`,
    };
  }

  async screenshot(input: { path?: string; fullPage?: boolean }): Promise<ToolExecutionResult> {
    const page = await this.getActivePage();
    const relativePath =
      input.path && input.path.trim() !== ""
        ? input.path
        : `.cain-artifacts/browser/screenshot-${Date.now()}.png`;
    const absolutePath = resolveWorkspacePath(this.getWorkspaceRoot(), relativePath);
    await fs.mkdir(path.dirname(absolutePath), { recursive: true });
    await page.screenshot({
      path: absolutePath,
      fullPage: input.fullPage === true,
    });

    return {
      summary: `Saved browser screenshot`,
      content: `Screenshot path: ${relativePath}`,
    };
  }

  async close(): Promise<ToolExecutionResult> {
    this.refs.clear();

    if (this.page) {
      await this.page.close().catch(() => undefined);
      this.page = undefined;
    }

    if (this.browserContext) {
      await this.browserContext.close().catch(() => undefined);
      this.browserContext = undefined;
    }

    if (this.browser) {
      await this.browser.close().catch(() => undefined);
      this.browser = undefined;
    }

    return {
      summary: "Closed browser session",
      content: "The shared browser session has been reset.",
    };
  }

  async dispose(): Promise<void> {
    await this.close();
  }

  private async ensurePage(): Promise<Page> {
    if (this.page) {
      return this.page;
    }

    if (!this.browser) {
      this.browser = await chromium.launch({
        headless: true,
      });
    }

    if (!this.browserContext) {
      this.browserContext = await this.browser.newContext({
        viewport: {
          width: 1440,
          height: 960,
        },
      });
    }

    this.page = await this.browserContext.newPage();
    return this.page;
  }

  private async getActivePage(): Promise<Page> {
    if (!this.page) {
      throw new Error("Browser is not open yet. Use browser_navigate first.");
    }

    return this.page;
  }

  private async resolveActionLocator(
    page: Page,
    input: { ref?: string; selector?: string; text?: string },
  ): Promise<Locator> {
    if (input.ref) {
      const ref = this.refs.get(input.ref);
      if (!ref) {
        throw new Error(`Unknown browser ref: ${input.ref}. Run browser_snapshot again.`);
      }
      return page.locator(ref.selector).first();
    }

    if (input.selector) {
      return page.locator(input.selector).first();
    }

    if (input.text) {
      return page.getByText(input.text, { exact: false }).first();
    }

    throw new Error("Provide one of ref, selector, or text");
  }

  private async resolveInputLocator(
    page: Page,
    input: {
      ref?: string;
      selector?: string;
      textTarget?: string;
      value: string;
      submit?: boolean;
    },
  ): Promise<Locator> {
    if (input.ref || input.selector) {
      return await this.resolveActionLocator(page, {
        ref: input.ref,
        selector: input.selector,
      });
    }

    if (input.textTarget) {
      const candidates = [
        page.getByLabel(input.textTarget, { exact: false }).first(),
        page.getByPlaceholder(input.textTarget, { exact: false }).first(),
        page.locator(
          `input[aria-label*="${escapeAttributeValue(input.textTarget)}"], textarea[aria-label*="${escapeAttributeValue(input.textTarget)}"], input[placeholder*="${escapeAttributeValue(input.textTarget)}"], textarea[placeholder*="${escapeAttributeValue(input.textTarget)}"]`,
        ).first(),
      ];

      for (const candidate of candidates) {
        if ((await candidate.count()) > 0) {
          return candidate;
        }
      }
    }

    throw new Error("Provide ref, selector, or textTarget for browser_type");
  }
}
