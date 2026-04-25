declare const Word:
  | {
      run: <T>(callback: (context: {
        document: {
          getSelection: () => {
            load: (property: string) => void;
            text: string;
            style: string;
            insertText: (text: string, location: string) => void;
          };
          changeTrackingMode: string;
        };
        sync: () => Promise<void>;
      }) => Promise<T>) => Promise<T>;
      InsertLocation: { replace: string };
      ChangeTrackingMode: { trackMineOnly: string; off: string };
    }
  | undefined;

/** Replace the current selection with newText, inheriting surrounding style. */
export async function replaceSelection(newText: string): Promise<void> {
  if (!Word?.run) {
    throw new Error("Word runtime is unavailable");
  }

  await Word.run(async context => {
    const selection = context.document.getSelection();
    selection.load("text");
    await context.sync();

    selection.insertText(newText, Word.InsertLocation.replace);
    await context.sync();
  });
}

/** Replace the current selection inside a Track Changes session. */
export async function replaceSelectionWithTracking(newText: string): Promise<void> {
  if (!Word?.run) {
    throw new Error("Word runtime is unavailable");
  }

  await Word.run(async context => {
    context.document.changeTrackingMode = Word.ChangeTrackingMode.trackMineOnly;
    await context.sync();

    const selection = context.document.getSelection();
    selection.insertText(newText, Word.InsertLocation.replace);
    await context.sync();

    context.document.changeTrackingMode = Word.ChangeTrackingMode.off;
    await context.sync();
  });
}

/** Return the text currently selected in the document. */
export async function getSelectedText(): Promise<string> {
  if (!Word?.run) {
    throw new Error("Word runtime is unavailable");
  }

  return Word.run(async context => {
    const selection = context.document.getSelection();
    selection.load("text");
    await context.sync();
    return selection.text;
  });
}
