export type MidtaiView = "preview" | "works" | "plib";

export type MidtaiContentType = "img" | "design";

export type MidtaiReplaceContext = {
  project: string;
  element: string;
  inferredRatio?: string;
};

export type MidtaiOpenPayload = {
  contentType: MidtaiContentType;
  view?: MidtaiView;
  designTargetView?: "design-chat" | "canvas";
  projectId?: string;
  artifactId?: string;
  designChat?: boolean;
  sessionType?: "design" | "default";
  replaceCtx?: MidtaiReplaceContext | null;
};
