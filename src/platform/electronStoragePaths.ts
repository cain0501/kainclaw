import { cp, mkdir, stat } from "node:fs/promises";
import path from "node:path";

export const ELECTRON_APP_NAME = "KainClaw";
export const ELECTRON_STORAGE_DIRNAME = "kainclaw-storage";

export function resolveElectronUserDataPath(appDataPath: string): string {
  return path.join(appDataPath, ELECTRON_APP_NAME);
}

export function resolveElectronStoragePath(userDataPath: string): string {
  return path.join(userDataPath, ELECTRON_STORAGE_DIRNAME);
}

export async function migrateLegacyElectronStorage(appDataPath: string): Promise<void> {
  const legacyStoragePath = resolveElectronStoragePath(path.join(appDataPath, "Electron"));
  const nextStoragePath = resolveElectronStoragePath(
    resolveElectronUserDataPath(appDataPath),
  );

  try {
    await stat(legacyStoragePath);
  } catch {
    return;
  }

  try {
    await stat(nextStoragePath);
    return;
  } catch {
    // Target does not exist yet. Continue with migration.
  }

  await mkdir(path.dirname(nextStoragePath), { recursive: true });
  await cp(legacyStoragePath, nextStoragePath, {
    recursive: true,
    force: false,
    errorOnExist: false,
  });
}
