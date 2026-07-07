import type {
  DesignProjectRecord,
  DesignProjectSource,
} from "./design/designProjectStore";
import type {
  ImageLabResultSummary,
  ImageLabResultSummaryPage,
} from "./imageGeneration/imageLabGalleryStore";
import type { ImageLabResultItem } from "./imageGeneration/imageLabRuntime";

export type MidtaiLibraryContentType = "image" | "design";
export type MidtaiLibrarySource = "chat" | "midtai" | "blank";
export type MidtaiLibraryFilter =
  | "all"
  | MidtaiLibraryContentType
  | Exclude<MidtaiLibrarySource, "blank">;

export type MidtaiLibraryItem = {
  id: string;
  name: string;
  contentType: MidtaiLibraryContentType;
  source: MidtaiLibrarySource;
  thumbnail?: string;
  createdAt: number;
  updatedAt: number;
  projectId?: string;
  version?: string;
  dimensions?: { w: number; h: number };
};

export type MidtaiLibraryImagePage = {
  items: MidtaiLibraryItem[];
  offset: number;
  limit: number;
  total: number;
  hasMore: boolean;
  nextOffset?: number;
};

function normalizeThumbnail(
  thumbnail?: string,
  options: { allowDataUrl?: boolean } = { allowDataUrl: true },
): string | undefined {
  const trimmed = thumbnail?.trim();
  if (!trimmed) {
    return undefined;
  }
  if ((options.allowDataUrl && trimmed.startsWith("data:")) || /^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }
  return undefined;
}

export function mapImageResultToMidtaiItem(
  result: ImageLabResultSummary | ImageLabResultItem,
): MidtaiLibraryItem {
  const thumbnail =
    normalizeThumbnail(result.thumbnail) ??
    normalizeThumbnail(result.src, { allowDataUrl: false });

  return {
    id: result.id,
    name: result.prompt.trim() || "Untitled Image",
    contentType: "image",
    source: result.source === "generate" ? "chat" : "midtai",
    ...(thumbnail ? { thumbnail } : {}),
    createdAt: result.createdAt,
    updatedAt: result.createdAt,
  };
}

function mapDesignSourceToMidtaiSource(
  source: DesignProjectSource,
): MidtaiLibrarySource {
  switch (source) {
    case "artifact":
      return "chat";
    case "blank":
    default:
      return "blank";
  }
}

export function mapDesignProjectToMidtaiItem(
  project: DesignProjectRecord,
  thumbnail?: string,
): MidtaiLibraryItem {
  return {
    id: project.projectId,
    name: project.name.trim() || "Untitled Design",
    contentType: "design",
    source: mapDesignSourceToMidtaiSource(project.source),
    ...(normalizeThumbnail(thumbnail) ? { thumbnail: normalizeThumbnail(thumbnail) } : {}),
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
    projectId: project.projectId,
    ...(project.versionCount !== undefined
      ? { version: `v${Math.max(1, project.versionCount)}` }
      : {}),
  };
}

function normalizeFilter(
  filter?: MidtaiLibraryFilter | null,
): MidtaiLibraryFilter {
  if (
    filter === "image" ||
    filter === "design" ||
    filter === "chat" ||
    filter === "midtai"
  ) {
    return filter;
  }
  return "all";
}

export function filterMidtaiLibraryItems(
  items: MidtaiLibraryItem[],
  filter?: MidtaiLibraryFilter | null,
): MidtaiLibraryItem[] {
  const normalized = normalizeFilter(filter);
  if (normalized === "all") {
    return [...items];
  }

  if (normalized === "image" || normalized === "design") {
    return items.filter(item => item.contentType === normalized);
  }

  return items.filter(item => item.source === normalized);
}

export class MidtaiLibraryHost {
  constructor(
    private readonly loadImageResults: () => Promise<Array<ImageLabResultSummary | ImageLabResultItem>>,
    private readonly loadDesignProjects: () => Promise<DesignProjectRecord[]>,
    private readonly loadDesignPreviews?: (projects: DesignProjectRecord[]) => Promise<Map<string, string>>,
    private readonly loadImageResultPage?: (options: {
      offset?: number;
      limit?: number;
    }) => Promise<ImageLabResultSummaryPage>,
  ) {}

  async getLibraryItems(filter?: MidtaiLibraryFilter | null): Promise<MidtaiLibraryItem[]> {
    const normalized = normalizeFilter(filter);
    const imageResults = normalized === "design"
      ? []
      : await this.loadImageResults();
    const designProjects = normalized === "image"
      ? []
      : await this.loadDesignProjects();

    const imageItems = imageResults.map(result => mapImageResultToMidtaiItem(result));
    const designPreviews = this.loadDesignPreviews && designProjects.length > 0
      ? await this.loadDesignPreviews(designProjects)
      : new Map<string, string>();
    const designItems = designProjects.map(project =>
      mapDesignProjectToMidtaiItem(project, designPreviews.get(project.projectId)));

    const merged = [...imageItems, ...designItems].sort(
      (left, right) => right.updatedAt - left.updatedAt,
    );
    return filterMidtaiLibraryItems(merged, normalized);
  }

  async getImageLibraryPage(options: {
    offset?: number;
    limit?: number;
  } = {}): Promise<MidtaiLibraryImagePage> {
    if (this.loadImageResultPage) {
      const page = await this.loadImageResultPage(options);
      return {
        items: page.items.map(result => mapImageResultToMidtaiItem(result)),
        offset: page.offset,
        limit: page.limit,
        total: page.total,
        hasMore: page.hasMore,
        ...(page.nextOffset !== undefined ? { nextOffset: page.nextOffset } : {}),
      };
    }

    const imageItems = (await this.loadImageResults())
      .map(result => mapImageResultToMidtaiItem(result))
      .sort((left, right) => right.updatedAt - left.updatedAt);
    const offset = normalizePageOffset(options.offset);
    const limit = normalizePageLimit(options.limit);
    const pageItems = imageItems.slice(offset, offset + limit);
    const nextOffset = offset + pageItems.length;

    return {
      items: pageItems,
      offset,
      limit,
      total: imageItems.length,
      hasMore: nextOffset < imageItems.length,
      ...(nextOffset < imageItems.length ? { nextOffset } : {}),
    };
  }
}

function normalizePageOffset(value: unknown): number {
  const offset = Number(value);
  return Number.isFinite(offset) && offset > 0 ? Math.floor(offset) : 0;
}

function normalizePageLimit(value: unknown): number {
  const limit = Number(value);
  if (!Number.isFinite(limit) || limit <= 0) {
    return 36;
  }
  return Math.max(1, Math.min(96, Math.floor(limit)));
}
