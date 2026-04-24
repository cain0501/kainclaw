import { chromium } from "playwright";

export type ImageMaterialResult = {
  id: string;
  query: string;
  title: string;
  thumbnailUrl: string;
  fullUrl: string;
  pageUrl: string;
  sourceLabel: string;
};

type BaiduImageSearchCard = {
  detailUrl: string;
  title: string;
  thumbnailUrl: string;
};

function normalizeSearchQuery(query: string): string {
  return query.trim().replace(/\s+/g, " ");
}

function decodeBaiduUrlParam(value: string | null): string {
  if (!value) {
    return "";
  }

  let current = value;
  for (let index = 0; index < 3; index += 1) {
    try {
      const decoded = decodeURIComponent(current);
      if (decoded === current) {
        return decoded;
      }
      current = decoded;
    } catch {
      break;
    }
  }

  return current;
}

function hostLabelFromUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "百度图片";
  }
}

export function normalizeBaiduImageSearchCards(
  query: string,
  cards: BaiduImageSearchCard[],
): ImageMaterialResult[] {
  return cards
    .map(card => {
      const detailUrl = card.detailUrl.trim();
      if (!detailUrl || !card.thumbnailUrl.trim()) {
        return null;
      }

      const parsed = new URL(detailUrl);
      const fullUrl = decodeBaiduUrlParam(parsed.searchParams.get("objurl"));
      const pageUrl = decodeBaiduUrlParam(parsed.searchParams.get("fromurl")) || detailUrl;
      if (!fullUrl) {
        return null;
      }

      return {
        id: `${query}:${fullUrl}`,
        query,
        title: card.title.trim() || "Untitled",
        thumbnailUrl: card.thumbnailUrl.trim(),
        fullUrl,
        pageUrl,
        sourceLabel: hostLabelFromUrl(pageUrl),
      } satisfies ImageMaterialResult;
    })
    .filter((result): result is ImageMaterialResult => result !== null);
}

async function searchBaiduImageResults(options: {
  query: string;
  maxResults: number;
  timeoutMs: number;
}): Promise<ImageMaterialResult[]> {
  const browser = await chromium.launch({
    headless: true,
  });

  try {
    const context = await browser.newContext({
      locale: "zh-CN",
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36",
      viewport: { width: 1440, height: 1100 },
    });
    const page = await context.newPage();
    const searchUrl = `https://image.baidu.com/search/index?tn=baiduimage&word=${encodeURIComponent(options.query)}`;

    await page.goto(searchUrl, {
      waitUntil: "domcontentloaded",
      timeout: options.timeoutMs,
    });

    const title = await page.title();
    if (title.includes("安全验证")) {
      throw new Error("百度图片当前触发了安全验证，暂时无法自动抓取结果。");
    }

    await page.waitForSelector('a[href*="/search/detail?"] img', {
      timeout: options.timeoutMs,
    });

    const cards = await page.evaluate((maxResults: number) => {
      const doc = (globalThis as unknown as {
        document?: {
          querySelectorAll: (selector: string) => unknown[];
        };
      }).document;
      if (!doc) {
        return [];
      }

      return Array.from(doc.querySelectorAll('a[href*="/search/detail?"]'))
        .slice(0, maxResults)
        .map(anchorNode => {
          const anchor = anchorNode as {
            href?: string;
            querySelector: (selector: string) => { alt?: string; src?: string } | null;
          };
          const image = anchor.querySelector("img");
          return {
            detailUrl: typeof anchor.href === "string" ? anchor.href : "",
            title: image?.alt || "",
            thumbnailUrl: image?.src || "",
          };
        })
        .filter(card => card.thumbnailUrl);
    }, options.maxResults);

    await context.close();
    return normalizeBaiduImageSearchCards(options.query, cards);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("Timeout") || message.includes("timeout")) {
      throw new Error("百度图片搜索超时，可能是当前网络环境不可达或响应较慢。");
    }
    throw error instanceof Error ? error : new Error(message);
  } finally {
    await browser.close();
  }
}

export async function searchPublicReferenceImages(options: {
  queries: string[];
  maxResultsPerQuery?: number;
  timeoutMs?: number;
  searchImpl?: (query: string, maxResults: number, timeoutMs: number) => Promise<ImageMaterialResult[]>;
}): Promise<ImageMaterialResult[]> {
  const searchImpl = options.searchImpl ?? ((query, maxResults, timeoutMs) =>
    searchBaiduImageResults({
      query,
      maxResults,
      timeoutMs,
    }));
  const maxResultsPerQuery = Math.max(1, Math.min(6, options.maxResultsPerQuery ?? 3));
  const timeoutMs = Math.max(5_000, Math.min(30_000, options.timeoutMs ?? 18_000));
  const queries = options.queries
    .map(normalizeSearchQuery)
    .filter(Boolean)
    .slice(0, 3);

  if (queries.length === 0) {
    return [];
  }

  const pages = await Promise.all(
    queries.map(query => searchImpl(query, maxResultsPerQuery, timeoutMs)),
  );

  const deduped: ImageMaterialResult[] = [];
  const seen = new Set<string>();
  for (const pageResults of pages) {
    for (const result of pageResults) {
      if (seen.has(result.fullUrl)) {
        continue;
      }
      seen.add(result.fullUrl);
      deduped.push(result);
    }
  }

  return deduped;
}
