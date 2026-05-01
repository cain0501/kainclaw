export type ArtifactType =
  | "html"
  | "svg"
  | "mermaid"
  | "code"
  | "markdown";

export interface ArtifactObject {
  id: string;
  type: ArtifactType;
  content: string;
  sourceMessageId?: string;
  title: string;
  createdAt: number;
  metadata?: {
    language?: string;
    lineCount?: number;
    [key: string]: unknown;
  };
}

export const DEFAULT_ARTIFACT_TITLES: Readonly<Record<ArtifactType, string>> = Object.freeze({
  html: "HTML 原型",
  svg: "SVG 图形",
  mermaid: "架构图",
  code: "代码",
  markdown: "Markdown 文档",
});

export const DEEP_EDITABLE_ARTIFACT_TYPES: ReadonlySet<ArtifactType> =
  new Set<ArtifactType>(["html"]);

export function canArtifactUseDeepEdit(type: ArtifactType): boolean {
  return DEEP_EDITABLE_ARTIFACT_TYPES.has(type);
}
