import { describe, expect, it } from "vitest";

import {
  mergePendingAttachmentsIntoConversationMessage,
  normalizeWebviewAttachments,
} from "./attachmentHandler";

describe("attachmentHandler", () => {
  it("normalizes webview attachments into provider-ready base64 attachments", () => {
    expect(
      normalizeWebviewAttachments([
        {
          dataUrl: "data:image/png;base64,QUJDRA==",
          mimeType: "image/png",
          name: "shot.png",
        },
      ]),
    ).toEqual([
      {
        data: "QUJDRA==",
        mimeType: "image/png",
      },
    ]);

    expect(normalizeWebviewAttachments()).toBeUndefined();
    expect(normalizeWebviewAttachments([])).toBeUndefined();
  });

  it("merges pending attachments into the next user conversation message", () => {
    const result = mergePendingAttachmentsIntoConversationMessage({
      message: {
        role: "user",
        content: "look at this",
      },
      pendingAttachments: [
        {
          data: "QUJDRA==",
          mimeType: "image/png",
        },
      ],
    });

    expect(result).toEqual({
      message: {
        role: "user",
        content: "look at this",
        attachments: [
          {
            data: "QUJDRA==",
            mimeType: "image/png",
          },
        ],
      },
      remainingPendingAttachments: undefined,
    });
  });

  it("leaves non-user messages unchanged and preserves pending attachments", () => {
    const pendingAttachments = [
      {
        data: "QUJDRA==",
        mimeType: "image/png",
      },
    ];

    const result = mergePendingAttachmentsIntoConversationMessage({
      message: {
        role: "assistant",
        content: "done",
      },
      pendingAttachments,
    });

    expect(result).toEqual({
      message: {
        role: "assistant",
        content: "done",
      },
      remainingPendingAttachments: pendingAttachments,
    });
  });
});
