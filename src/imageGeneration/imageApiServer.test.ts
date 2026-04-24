import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createImageApiHandler,
  resolveImageRequestConfig,
} from "./imageApiServer";

function createResponseRecorder() {
  return {
    statusCode: 0,
    headers: {} as Record<string, string | number>,
    body: "",
    writeHead(statusCode: number, headers: Record<string, string | number>) {
      this.statusCode = statusCode;
      this.headers = headers;
      return this;
    },
    end(chunk?: string) {
      this.body = chunk ?? "";
    },
  };
}

describe("imageApiServer", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("uses request values first, then env defaults", () => {
    expect(
      resolveImageRequestConfig(
        {
          prompt: "draw a cat",
          model: "custom-model",
          apiKey: "request-key",
        },
        {
          host: "127.0.0.1",
          port: 4123,
          defaultBaseUrl: "https://example.com/v1",
          defaultModel: "openai/gpt-image-2",
          defaultApiKey: "env-key",
          defaultAuthMode: "bearer",
        },
      ),
    ).toEqual({
      prompt: "draw a cat",
      model: "custom-model",
      apiKey: "request-key",
      baseUrl: "https://example.com/v1",
      authMode: "bearer",
    });
  });

  it("requires a prompt and an api key", () => {
    expect(() =>
      resolveImageRequestConfig(
        {},
        {
          host: "127.0.0.1",
          port: 4123,
          defaultModel: "openai/gpt-image-2",
          defaultAuthMode: "bearer",
        },
      ),
    ).toThrow("`prompt` is required.");

    expect(() =>
      resolveImageRequestConfig(
        { prompt: "draw a cat" },
        {
          host: "127.0.0.1",
          port: 4123,
          defaultModel: "openai/gpt-image-2",
          defaultAuthMode: "bearer",
        },
      ),
    ).toThrow("Missing API key.");
  });

  it("renders a browser UI on GET /", async () => {
    const response = createResponseRecorder();

    await createImageApiHandler({
      host: "127.0.0.1",
      port: 4123,
      defaultBaseUrl: "https://example.com/v1",
      defaultModel: "gpt-image-2",
      defaultApiKey: "env-key",
      defaultAuthMode: "raw",
    })(
      {
        method: "GET",
        url: "/",
        [Symbol.asyncIterator]: async function* () {},
      } as never,
      response as never,
    );

    expect(response.statusCode).toBe(200);
    expect(String(response.headers["Content-Type"])).toContain("text/html");
    expect(response.body).toContain("本地图片生成");
    expect(response.body).toContain('"authMode":"raw"');
    expect(response.body).toContain("/v1/images/generations");
  });

  it("returns health metadata", async () => {
    const response = createResponseRecorder();

    await createImageApiHandler({
      host: "127.0.0.1",
      port: 4123,
      defaultModel: "openai/gpt-image-2",
      defaultApiKey: "env-key",
      defaultAuthMode: "raw",
    })(
      {
        method: "GET",
        url: "/health",
        [Symbol.asyncIterator]: async function* () {},
      } as never,
      response as never,
    );

    expect(response.statusCode).toBe(200);
    expect(response.body).toContain('"ok":true');
  });

  it("accepts raw auth mode from the request body", () => {
    expect(
      resolveImageRequestConfig(
        {
          prompt: "draw a cat",
          apiKey: "request-key",
          authMode: "raw",
        },
        {
          host: "127.0.0.1",
          port: 4123,
          defaultModel: "openai/gpt-image-2",
          defaultAuthMode: "bearer",
        },
      ),
    ).toMatchObject({
      prompt: "draw a cat",
      apiKey: "request-key",
      authMode: "raw",
      model: "openai/gpt-image-2",
    });
  });
});
