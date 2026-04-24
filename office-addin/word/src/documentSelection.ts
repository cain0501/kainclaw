import {
  buildWordSelectionState,
  type WordSelectionState,
} from "../../../src/officeBridge/wordSelectionContext";

declare const Word:
  | {
      run: <T>(callback: (context: {
        document: {
          getSelection: () => {
            load: (property: string) => void;
            text: string;
          };
        };
        sync: () => Promise<void>;
      }) => Promise<T>) => Promise<T>;
    }
  | undefined;

export async function readSelectionState(): Promise<WordSelectionState> {
  if (!Word?.run) {
    throw new Error("Word runtime is unavailable");
  }

  return await Word.run(async context => {
    const selection = context.document.getSelection();
    selection.load("text");
    await context.sync();
    return buildWordSelectionState(selection.text);
  });
}
