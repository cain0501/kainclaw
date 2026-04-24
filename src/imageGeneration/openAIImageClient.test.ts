import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildImageEndpointUrl,
  editImages,
  generateImages,
} from "./openAIImageClient";

describe("openAIImageClient", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("builds image endpoints from an OpenAI-compatible base URL", () => {
    expect(buildImageEndpointUrl("https://example.com/v1", "generations")).toBe(
      "https://example.com/v1/images/generations",
    );
    expect(buildImageEndpointUrl("https://example.com/v1", "edits")).toBe(
      "https://example.com/v1/images/edits",
    );
  });

  it("returns multiple image urls from the provider response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        text: async () =>
          JSON.stringify({
            created: 1,
            data: [{ url: "https://example.com/1.png" }, { url: "https://example.com/2.png" }],
          }),
      }),
    );

    await expect(
      generateImages({
        config: {
          apiKey: "secret",
          model: "gpt-image-2",
          baseUrl: "https://example.com/v1",
          authMode: "raw",
        },
        prompt: "draw a cat",
        count: 2,
        responseFormat: "url",
      }),
    ).resolves.toEqual({
      created: 1,
      data: [
        { src: "https://example.com/1.png", revisedPrompt: undefined },
        { src: "https://example.com/2.png", revisedPrompt: undefined },
      ],
    });
  });

  it("tops up image batches when the provider ignores the requested count", async () => {
    const fetchSpy = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        text: async () =>
          JSON.stringify({
            created: 1,
            data: [{ url: "https://example.com/1.png" }],
          }),
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () =>
          JSON.stringify({
            created: 2,
            data: [{ url: "https://example.com/2.png" }],
          }),
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () =>
          JSON.stringify({
            created: 3,
            data: [{ url: "https://example.com/3.png" }],
          }),
      });
    vi.stubGlobal("fetch", fetchSpy);

    await expect(
      generateImages({
        config: {
          apiKey: "secret",
          model: "gpt-image-2",
          baseUrl: "https://example.com/v1",
          authMode: "raw",
        },
        prompt: "draw three cats",
        count: 3,
        responseFormat: "url",
      }),
    ).resolves.toEqual({
      created: 1,
      data: [
        { src: "https://example.com/1.png", revisedPrompt: undefined },
        { src: "https://example.com/2.png", revisedPrompt: undefined },
        { src: "https://example.com/3.png", revisedPrompt: undefined },
      ],
    });

    expect(fetchSpy).toHaveBeenCalledTimes(3);
    const firstBody = JSON.parse(fetchSpy.mock.calls[0]![1].body as string) as { n?: number };
    const secondBody = JSON.parse(fetchSpy.mock.calls[1]![1].body as string) as { n?: number };
    const thirdBody = JSON.parse(fetchSpy.mock.calls[2]![1].body as string) as { n?: number };
    expect(firstBody.n).toBe(3);
    expect(secondBody.n).toBeUndefined();
    expect(thirdBody.n).toBeUndefined();
  });

  it("sends edits as multipart form-data", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      text: async () =>
        JSON.stringify({
          data: [{ b64_json: "aGVsbG8=", mime_type: "image/png" }],
        }),
    });
    vi.stubGlobal("fetch", fetchSpy);

    await expect(
      editImages({
        config: {
          apiKey: "secret",
          model: "gpt-image-2",
          baseUrl: "https://example.com/v1",
        },
        prompt: "turn this cat into a bronze statue",
        images: [{
          data: Buffer.from("hello"),
          mimeType: "image/png",
          name: "reference.png",
        }],
      }),
    ).resolves.toEqual({
      created: undefined,
      data: [{ src: "data:image/png;base64,aGVsbG8=", revisedPrompt: undefined }],
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [, request] = fetchSpy.mock.calls[0]!;
    expect(request.headers.Authorization).toBe("Bearer secret");
    expect(request.body).toBeInstanceOf(FormData);
  });

  it("sends multiple reference images as repeated image[] fields", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      text: async () =>
        JSON.stringify({
          data: [{ b64_json: "aGVsbG8=", mime_type: "image/png" }],
        }),
    });
    vi.stubGlobal("fetch", fetchSpy);

    await editImages({
      config: {
        apiKey: "secret",
        model: "gpt-image-2",
        baseUrl: "https://example.com/v1",
      },
      prompt: "merge these two references",
      images: [
        {
          data: Buffer.from("hello"),
          mimeType: "image/png",
          name: "reference-a.png",
        },
        {
          data: Buffer.from("world"),
          mimeType: "image/png",
          name: "reference-b.png",
        },
      ],
    });

    const [, request] = fetchSpy.mock.calls[0]!;
    const formEntries = Array.from((request.body as FormData).entries());
    expect(formEntries.filter(([key]) => key === "image[]")).toHaveLength(2);
  });

  it("supports aborting image requests with an external signal", async () => {
    const controller = new AbortController();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (_url, request: RequestInit) => {
        return await new Promise((_resolve, reject) => {
          request.signal?.addEventListener(
            "abort",
            () => reject(new DOMException("The operation was aborted", "AbortError")),
            { once: true },
          );
        });
      }),
    );

    const requestPromise = generateImages({
      config: {
        apiKey: "secret",
        model: "gpt-image-2",
      },
      prompt: "draw a cat",
      signal: controller.signal,
    });

    controller.abort();

    await expect(requestPromise).rejects.toThrow("The operation was aborted");
  });

  it("surfaces provider error messages when the request fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        text: async () =>
          JSON.stringify({
            error: { message: "model_not_found" },
          }),
      }),
    );

    await expect(
      generateImages({
        config: {
          apiKey: "secret",
          model: "gpt-image-2",
        },
        prompt: "draw a cat",
      }),
    ).rejects.toThrow("model_not_found");
  });

  it("rewrites fetch timeout failures into a friendlier image timeout message", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("The operation was aborted due to timeout")),
    );

    await expect(
      generateImages({
        config: {
          apiKey: "secret",
          model: "gpt-image-2",
        },
        prompt: "draw a cat",
      }),
    ).rejects.toThrow("图片生成超时");
  });
  it("rewrites Cloudflare 524 HTML pages into a friendly image service error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 524,
        text: async () => "<!DOCTYPE html><html><head><title>openclaudecode.cn | 524: A timeout occurred</title></head><body>Cloudflare Error code 524</body></html>",
      }),
    );

    await expect(
      generateImages({
        config: {
          apiKey: "secret",
          model: "gpt-image-2",
        },
        prompt: "draw a cat",
      }),
    ).rejects.toThrow("Cloudflare 524");
  });
});
