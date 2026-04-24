import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  loadEnvFallbackConfig,
  parseEnvFile,
} from "./legacyEnvFallback";

const tempDirs: string[] = [];
const originalEnv = { ...process.env };

afterEach(async () => {
  process.env = { ...originalEnv };
  await Promise.all(
    tempDirs.splice(0).map(dir => fs.rm(dir, { recursive: true, force: true })),
  );
});

describe("legacy env fallback", () => {
  it("parses .env content with comments and quoted values", () => {
    const parsed = parseEnvFile(`
# comment
OPENAI_API_KEY="secret"
OPENAI_MODEL=gpt-4o-mini
OPENAI_BASE_URL='https://example.test/v1'
INVALID_LINE
`);

    expect(parsed).toEqual({
      OPENAI_API_KEY: "secret",
      OPENAI_MODEL: "gpt-4o-mini",
      OPENAI_BASE_URL: "https://example.test/v1",
    });
  });

  it("returns undefined when no .env file exists in the parent chain", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "cain-env-fallback-"));
    tempDirs.push(root);

    expect(await loadEnvFallbackConfig(root)).toBeUndefined();
  });

  it("loads the nearest parent .env file and resolves openai-compatible config", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "cain-env-fallback-"));
    tempDirs.push(root);
    const nested = path.join(root, "packages", "extension");
    await fs.mkdir(nested, { recursive: true });
    await fs.writeFile(
      path.join(root, ".env"),
      [
        "LLM_PROVIDER=openai",
        "OPENAI_API_KEY=secret",
        "OPENAI_MODEL=gpt-4o-mini",
        "OPENAI_BASE_URL=https://example.test/v1",
        "LLM_TIMEOUT_MS=15000",
      ].join("\n"),
      "utf8",
    );

    const config = await loadEnvFallbackConfig(nested);

    expect(config).toMatchObject({
      provider: "openai",
      apiKey: "secret",
      model: "gpt-4o-mini",
      baseURL: "https://example.test/v1",
      timeoutMs: 15000,
    });
  });

  it("supports claude-cli aliases and optional fields", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "cain-env-fallback-"));
    tempDirs.push(root);
    await fs.writeFile(
      path.join(root, ".env"),
      [
        "LLM_PROVIDER=claude",
        "CLAUDE_MODEL=claude-sonnet",
        "CLAUDE_CLI_PATH=C:\\\\tools\\\\claude.exe",
      ].join("\n"),
      "utf8",
    );

    const config = await loadEnvFallbackConfig(root);

    expect(config).toMatchObject({
      provider: "claude-cli",
      model: "claude-sonnet",
      cliPath: "C:\\\\tools\\\\claude.exe",
    });
  });
});
