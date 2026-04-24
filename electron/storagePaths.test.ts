import { mkdtemp, mkdir, rm, writeFile, stat, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  migrateLegacyElectronStorage,
  resolveElectronStoragePath,
  resolveElectronUserDataPath,
} from "../src/platform/electronStoragePaths";

describe("electron storage paths", () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(
      tempDirs.splice(0).map(dir => rm(dir, { recursive: true, force: true })),
    );
  });

  it("resolves the dedicated KainClaw userData path", () => {
    const appDataPath = "C:\\Users\\Administrator\\AppData\\Roaming";

    expect(resolveElectronUserDataPath(appDataPath)).toBe(
      "C:\\Users\\Administrator\\AppData\\Roaming\\KainClaw",
    );
  });

  it("migrates legacy Electron storage into the KainClaw userData path", async () => {
    const appDataPath = await mkdtemp(path.join(os.tmpdir(), "kainclaw-appdata-"));
    tempDirs.push(appDataPath);

    const legacyStoragePath = resolveElectronStoragePath(path.join(appDataPath, "Electron"));
    const nextStoragePath = resolveElectronStoragePath(resolveElectronUserDataPath(appDataPath));
    await mkdir(legacyStoragePath, { recursive: true });
    await writeFile(path.join(legacyStoragePath, "state.json"), '{"ok":true}', "utf8");

    await migrateLegacyElectronStorage(appDataPath);

    await expect(stat(path.join(nextStoragePath, "state.json"))).resolves.toBeDefined();
  });

  it("does not overwrite an existing KainClaw storage directory during migration", async () => {
    const appDataPath = await mkdtemp(path.join(os.tmpdir(), "kainclaw-appdata-"));
    tempDirs.push(appDataPath);

    const legacyStoragePath = resolveElectronStoragePath(path.join(appDataPath, "Electron"));
    const nextStoragePath = resolveElectronStoragePath(resolveElectronUserDataPath(appDataPath));
    await mkdir(legacyStoragePath, { recursive: true });
    await mkdir(nextStoragePath, { recursive: true });
    await writeFile(path.join(legacyStoragePath, "state.json"), '{"from":"legacy"}', "utf8");
    await writeFile(path.join(nextStoragePath, "state.json"), '{"from":"current"}', "utf8");

    await migrateLegacyElectronStorage(appDataPath);

    const migratedState = await stat(path.join(nextStoragePath, "state.json"));
    expect(migratedState.isFile()).toBe(true);
    await expect(readFile(path.join(nextStoragePath, "state.json"), "utf8")).resolves.toBe(
      '{"from":"current"}',
    );
  });
});
