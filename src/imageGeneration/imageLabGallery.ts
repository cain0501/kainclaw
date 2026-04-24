import type { ImageLabResultItem } from "./imageLabRuntime";

export type ImageLabResultBatch = {
  id: string;
  prompt: string;
  createdAt: number;
  source: ImageLabResultItem["source"];
  itemCount: number;
  items: ImageLabResultItem[];
};

export function prependImageLabResults(
  existingResults: ImageLabResultItem[],
  incomingResults: ImageLabResultItem[],
): ImageLabResultItem[] {
  if (incomingResults.length === 0) {
    return existingResults;
  }

  return [...incomingResults, ...existingResults];
}

export function removeImageLabResult(
  existingResults: ImageLabResultItem[],
  resultId: string,
): ImageLabResultItem[] {
  const trimmedId = resultId.trim();
  if (!trimmedId) {
    return existingResults;
  }

  return existingResults.filter(result => result.id !== trimmedId);
}

export function buildImageLabResultBatches(
  results: ImageLabResultItem[],
): ImageLabResultBatch[] {
  const orderedBatches: ImageLabResultBatch[] = [];
  const batchesById = new Map<string, ImageLabResultBatch>();

  for (const result of results) {
    let batch = batchesById.get(result.batchId);
    if (!batch) {
      batch = {
        id: result.batchId,
        prompt: result.prompt,
        createdAt: result.createdAt,
        source: result.source,
        itemCount: 0,
        items: [],
      };
      batchesById.set(result.batchId, batch);
      orderedBatches.push(batch);
    }

    batch.items.push(result);
    batch.itemCount = batch.items.length;
  }

  return orderedBatches;
}
