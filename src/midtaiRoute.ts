export type MidtaiView = "preview" | "works" | "plib";

export type MidtaiContentType = "img" | "design";

export type MidtaiReplaceContext = {
  project: string;
  element: string;
};

export type MidtaiOpenPayload = {
  contentType: MidtaiContentType;
  view?: MidtaiView;
  projectId?: string;
  artifactId?: string;
  replaceCtx?: MidtaiReplaceContext | null;
};
