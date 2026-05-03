import type {
  IProviderAdapter,
  NormalizedImageAttachment,
} from "../agent/providers/IProviderAdapter";
import {
  buildKainClawDesignSystemPrompt,
  buildKainClawDesignUserPrompt,
  type DesignOutputType,
} from "./designPrompt";
import {
  parseKainClawDesignOutput,
  type ParsedDesignOutput,
} from "./slidersExtractor";

export type DesignGenerateOptions = {
  prompt: string;
  outputType: DesignOutputType;
  style?: string;
  referenceImageDataUrl?: string;
  referenceImageMimeType?: string;
  customSystemInstructions?: string;
  signal?: AbortSignal;
  onToken?: (token: string) => void;
};

export type DesignGenerateResult = ParsedDesignOutput & {
  rawOutput: string;
  systemPrompt: string;
  userPrompt: string;
};

function toReferenceAttachments(
  options: DesignGenerateOptions,
): NormalizedImageAttachment[] | undefined {
  const dataUrl = options.referenceImageDataUrl?.trim();
  if (!dataUrl) {
    return undefined;
  }

  const commaIndex = dataUrl.indexOf(",");
  if (commaIndex === -1) {
    throw new Error("Design reference image is not a valid data URL.");
  }

  return [{
    data: dataUrl.slice(commaIndex + 1),
    mimeType: options.referenceImageMimeType?.trim() || "image/png",
  }];
}

export async function generateKainClawDesign(
  provider: IProviderAdapter,
  options: DesignGenerateOptions,
): Promise<DesignGenerateResult> {
  const systemPrompt = buildKainClawDesignSystemPrompt({
    customInstructions: options.customSystemInstructions,
  });
  const userPrompt = buildKainClawDesignUserPrompt({
    prompt: options.prompt,
    outputType: options.outputType,
    ...(options.style?.trim() ? { style: options.style.trim() } : {}),
    ...(options.referenceImageDataUrl ? { referenceImageDataUrl: options.referenceImageDataUrl } : {}),
  });

  const attachments = toReferenceAttachments(options);
  let streamedText = "";
  const step = await provider.runStep(
    [{
      role: "user",
      content: userPrompt,
      ...(attachments && attachments.length > 0 ? { attachments } : {}),
    }],
    [],
    token => {
      streamedText += token;
      options.onToken?.(token);
    },
    options.signal,
  );

  const rawOutput = (step.text || streamedText).trim();
  if (!rawOutput) {
    throw new Error("KainClaw Design returned an empty response.");
  }

  const parsed = parseKainClawDesignOutput(rawOutput);
  return {
    ...parsed,
    rawOutput,
    systemPrompt,
    userPrompt,
  };
}
