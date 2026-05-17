import type {
  DesignProjectRecord,
  DesignProjectSource,
} from "./design/designProjectStore";
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

function normalizeThumbnail(thumbnail?: string): string | undefined {
  const trimmed = thumbnail?.trim();
  if (!trimmed) {
    return undefined;
  }
  if (trimmed.startsWith("data:") || /^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }
  return undefined;
}

export function mapImageResultToMidtaiItem(
  result: ImageLabResultItem,
): MidtaiLibraryItem {
  return {
    id: result.id,
    name: result.prompt.trim() || "Untitled Image",
    contentType: "image",
    source: result.source === "generate" ? "chat" : "midtai",
    thumbnail: result.src,
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
    private readonly loadImageResults: () => Promise<ImageLabResultItem[]>,
    private readonly loadDesignProjects: () => Promise<DesignProjectRecord[]>,
    private readonly loadDesignPreview?: (project: DesignProjectRecord) => Promise<string | undefined>,
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
    const designItems = await Promise.all(
      designProjects.map(async project =>
        mapDesignProjectToMidtaiItem(
          project,
          this.loadDesignPreview ? await this.loadDesignPreview(project) : undefined,
        )),
    );

    const merged = [...imageItems, ...designItems].sort(
      (left, right) => right.updatedAt - left.updatedAt,
    );
    return filterMidtaiLibraryItems(merged, normalized);
  }
}
