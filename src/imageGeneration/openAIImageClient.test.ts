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

  it("accepts image payloads wrapped inside markdown json fences", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        text: async () => [
          "```json",
          JSON.stringify({
            created: 1,
            data: [{ url: "https://example.com/fenced.png" }],
          }),
          "```",
        ].join("\n"),
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
        prompt: "draw a fenced cat",
      }),
    ).resolves.toEqual({
      created: 1,
      data: [{ src: "https://example.com/fenced.png", revisedPrompt: undefined }],
    });
  });

  it("accepts image payloads returned as SSE-style data lines", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        text: async () => [
          "data: " + JSON.stringify({
            created: 2,
            data: [{ url: "https://example.com/sse.png" }],
          }),
          "",
          "data: [DONE]",
        ].join("\n"),
      }),
    );

    await expect(
      generateImages({
        config: {
          apiKey: "secret",
          model: "gpt-image-2",
        },
        prompt: "draw an sse cat",
      }),
    ).resolves.toEqual({
      created: 2,
      data: [{ src: "https://example.com/sse.png", revisedPrompt: undefined }],
    });
  });

  it("accepts nested image payload wrappers from compatible gateways", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        text: async () =>
          JSON.stringify({
            result: {
              created: 3,
              data: [{ url: "https://example.com/nested.png" }],
            },
          }),
      }),
    );

    await expect(
      generateImages({
        config: {
          apiKey: "secret",
          model: "gpt-image-2",
        },
        prompt: "draw a nested cat",
      }),
    ).resolves.toEqual({
      created: 3,
      data: [{ src: "https://example.com/nested.png", revisedPrompt: undefined }],
    });
  });

  it("accepts direct image binary success bodies from compatible gateways", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        headers: {
          get: (name: string) => name.toLowerCase() === "content-type" ? "image/png" : null,
        },
        arrayBuffer: async () => Uint8Array.from([0xde, 0xad, 0xbe, 0xef]).buffer,
      }),
    );

    await expect(
      generateImages({
        config: {
          apiKey: "secret",
          model: "gpt-image-2",
        },
        prompt: "draw a binary cat",
      }),
    ).resolves.toEqual({
      data: [{ src: "data:image/png;base64,3q2+7w==", revisedPrompt: undefined }],
    });
  });

  it("accepts direct image urls returned as plain text success bodies", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        headers: {
          get: () => "text/plain",
        },
        text: async () => "https://example.com/plain-url.png\n",
      }),
    );

    await expect(
      generateImages({
        config: {
          apiKey: "secret",
          model: "gpt-image-2",
        },
        prompt: "draw a plain-url cat",
      }),
    ).resolves.toEqual({
      data: [{ src: "https://example.com/plain-url.png", revisedPrompt: undefined }],
    });
  });

  it("retries a /v1 image endpoint when a root-level compatible endpoint returns html", async () => {
    const fetchSpy = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        headers: {
          get: (name: string) => name.toLowerCase() === "content-type" ? "text/html; charset=utf-8" : null,
        },
        text: async () => "<!doctype html><html><body>homepage</body></html>",
      })
      .mockResolvedValueOnce({
        ok: true,
        headers: {
          get: (name: string) => name.toLowerCase() === "content-type" ? "application/json" : null,
        },
        text: async () =>
          JSON.stringify({
            created: 9,
            data: [{ url: "https://example.com/v1-fallback.png" }],
          }),
      });
    vi.stubGlobal("fetch", fetchSpy);

    await expect(
      generateImages({
        config: {
          apiKey: "secret",
          model: "gpt-image-2",
          baseUrl: "https://example.com",
          authMode: "raw",
        },
        prompt: "draw a fallback cat",
      }),
    ).resolves.toEqual({
      created: 9,
      data: [{ src: "https://example.com/v1-fallback.png", revisedPrompt: undefined }],
    });

    expect(fetchSpy).toHaveBeenNthCalledWith(
      1,
      "https://example.com/images/generations",
      expect.any(Object),
    );
    expect(fetchSpy).toHaveBeenNthCalledWith(
      2,
      "https://example.com/v1/images/generations",
      expect.any(Object),
    );
  });

  it("does not retry a fallback endpoint after a 200 success with an unparsable body", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      headers: {
        get: (name: string) => name.toLowerCase() === "content-type" ? "application/json" : null,
      },
      text: async () => "not-json-but-also-not-an-image",
    });
    vi.stubGlobal("fetch", fetchSpy);

    await expect(
      generateImages({
        config: {
          apiKey: "secret",
          model: "gpt-image-2",
          baseUrl: "https://example.com",
          authMode: "raw",
        },
        prompt: "draw a parse-failure cat",
      }),
    ).rejects.toThrow("invalid JSON response");

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy).toHaveBeenCalledWith(
      "https://example.com/images/generations",
      expect.any(Object),
    );
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

  it("does not retry edit fallbacks after a 200 success with an unparsable body", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      headers: {
        get: (name: string) => name.toLowerCase() === "content-type" ? "application/json" : null,
      },
      text: async () => "not-json-but-also-not-an-image",
    });
    vi.stubGlobal("fetch", fetchSpy);

    await expect(
      editImages({
        config: {
          apiKey: "secret",
          model: "gpt-image-2",
          baseUrl: "https://example.com",
        },
        prompt: "turn this cat into a bronze statue",
        images: [{
          data: Buffer.from("hello"),
          mimeType: "image/png",
          name: "reference.png",
        }],
      }),
    ).rejects.toThrow("invalid JSON response");

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy).toHaveBeenCalledWith(
      "https://example.com/images/edits",
      expect.any(Object),
    );
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
