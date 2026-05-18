import {
  buildSelectedWordDocumentContextResult,
  buildSelectedWordDocumentContext,
  buildWordDocumentContext,
  buildWordDocumentSnapshot,
  type WordSelectedContext,
  type WordDocumentSnapshot,
  type WordQuestionMode,
} from "../../../src/officeBridge/wordDocumentContext";

declare const Word:
  | {
      run: <T>(callback: (context: {
        document: {
          body: {
            paragraphs: {
              items: Array<{ text: string; style?: string; select?: () => void }>;
              load: (props: string[]) => void;
            };
          };
        };
        sync: () => Promise<void>;
      }) => Promise<T>) => Promise<T>;
    }
  | undefined;

export async function readDocumentSnapshot(): Promise<WordDocumentSnapshot> {
  if (!Word?.run) {
    throw new Error("Word runtime is unavailable");
  }

  return await Word.run(async context => {
    const paragraphs = context.document.body.paragraphs;
    paragraphs.load(["text", "style"]);
    await context.sync();

    return buildWordDocumentSnapshot(paragraphs.items);
  });
}

export async function readDocumentContext(): Promise<string> {
  const snapshot = await readDocumentSnapshot();
  return buildWordDocumentContext(snapshot);
}

export async function readDocumentContextBundle(): Promise<{
  snapshot: WordDocumentSnapshot;
  contextText: string;
}> {
  const snapshot = await readDocumentSnapshot();
  return {
    snapshot,
    contextText: buildWordDocumentContext(snapshot),
  };
}

export async function readSelectedDocumentContext(
  query: string,
  maxParagraphs?: number,
): Promise<string> {
  const snapshot = await readDocumentSnapshot();
  return buildSelectedWordDocumentContext(snapshot, query, maxParagraphs);
}

export async function readSelectedDocumentContextBundle(
  query: string,
  options?: {
    maxParagraphs?: number;
    maxTokens?: number;
    questionMode?: WordQuestionMode;
  },
): Promise<{
  snapshot: WordDocumentSnapshot;
  selectedContext: WordSelectedContext;
}> {
  const snapshot = await readDocumentSnapshot();
  return {
    snapshot,
    selectedContext: buildSelectedWordDocumentContextResult(
      snapshot,
      query,
      options,
    ),
  };
}

export async function navigateToParagraph(paragraphId: string): Promise<void> {
  if (!Word?.run) {
    throw new Error("Word runtime is unavailable");
  }

  const index = Number.parseInt(paragraphId.replace(/^p/, ""), 10);
  if (!Number.isFinite(index) || index < 0) {
    throw new Error(`Invalid paragraph id: ${paragraphId}`);
  }

  await Word.run(async context => {
    const paragraphs = context.document.body.paragraphs;
    paragraphs.load(["items"]);
    await context.sync();

    const target = paragraphs.items[index];
    const select = target?.select;
    if (typeof select !== "function") {
      throw new Error(`Paragraph not found: ${paragraphId}`);
    }

    select.call(target);
    await context.sync();
  });
}
