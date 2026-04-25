export type DocumentComment = {
  id: string;
  content: string;
  anchoredText: string;
};

declare const Word:
  | {
      run: <T>(callback: (context: {
        document: {
          body: {
            getComments: () => {
              load: (props: string[]) => void;
              items: Array<{
                id: string;
                content: {
                  load: (props: string[]) => void;
                  items: Array<{ text: string }>;
                };
                contentRange: {
                  load: (prop: string) => void;
                  text: string;
                  insertText: (text: string, location: string) => void;
                };
                reply: (text: string) => void;
              }>;
            };
          };
        };
        sync: () => Promise<void>;
      }) => Promise<T>) => Promise<T>;
      InsertLocation: { replace: string };
    }
  | undefined;

/** Return all open (unresolved) comments in the document. */
export async function getOpenComments(): Promise<DocumentComment[]> {
  if (!Word?.run) {
    throw new Error("Word runtime is unavailable");
  }

  return Word.run(async context => {
    const comments = context.document.body.getComments();
    comments.load(["id", "content", "contentRange"]);
    await context.sync();

    const result: DocumentComment[] = [];
    for (const c of comments.items) {
      c.content.load(["items"]);
      c.contentRange.load("text");
      await context.sync();

      result.push({
        id: c.id,
        content: c.content.items.map(i => i.text).join(""),
        anchoredText: c.contentRange.text,
      });
    }
    return result;
  });
}

/**
 * Edit the text anchored to a comment and post a reply, then keep the comment
 * open for the author to resolve manually (non-destructive workflow).
 */
export async function resolveComment(
  commentId: string,
  editedText: string,
  replyText: string,
): Promise<void> {
  if (!Word?.run) {
    throw new Error("Word runtime is unavailable");
  }

  await Word.run(async context => {
    const comments = context.document.body.getComments();
    comments.load(["id", "contentRange"]);
    await context.sync();

    const target = comments.items.find(c => c.id === commentId);
    if (!target) {
      return;
    }

    target.contentRange.load("text");
    await context.sync();

    target.contentRange.insertText(editedText, Word.InsertLocation.replace);
    target.reply(replyText);
    await context.sync();
  });
}
