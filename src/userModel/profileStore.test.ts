import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ProfileStore, applyProfileDelta } from "./profileStore";

let tmpDir: string;
let store: ProfileStore;

beforeEach(async () => {
  tmpDir = path.join(os.tmpdir(), `profile-store-test-${Math.random().toString(36).slice(2)}`);
  await fs.mkdir(tmpDir, { recursive: true });
  store = new ProfileStore(tmpDir);
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe("applyProfileDelta", () => {
  it("adds an item to an existing section", () => {
    const profile = "# Profile\n\n## 技术栈\n\n- TypeScript";
    const result = applyProfileDelta(profile, "ADD: 技术栈 | Rust");
    expect(result).toContain("- Rust");
    expect(result).toContain("- TypeScript");
  });

  it("creates a new section if it does not exist", () => {
    const result = applyProfileDelta("# Profile", "ADD: 新分区 | 新条目");
    expect(result).toContain("## 新分区");
    expect(result).toContain("- 新条目");
  });

  it("modifies text via MODIFY directive", () => {
    const profile = "# Profile\n\n- TypeScript：熟练";
    const result = applyProfileDelta(profile, "MODIFY: 技术栈 | TypeScript：熟练 → TypeScript：精通");
    expect(result).toContain("TypeScript：精通");
    expect(result).not.toContain("TypeScript：熟练");
  });

  it("removes a matching line via REMOVE directive", () => {
    const profile = "# Profile\n\n- 待删除条目\n- 保留条目";
    const result = applyProfileDelta(profile, "REMOVE: 技术栈 | 待删除条目");
    expect(result).not.toContain("待删除条目");
    expect(result).toContain("保留条目");
  });

  it("skips lines without pipe separator", () => {
    const profile = "# Profile";
    expect(() => applyProfileDelta(profile, "ADD: 没有竖线")).not.toThrow();
  });
});

describe("ProfileStore basic operations", () => {
  it("load returns null when file does not exist", async () => {
    expect(await store.load()).toBeNull();
  });

  it("save and load round-trips content", async () => {
    await store.save("# My Profile");
    expect(await store.load()).toBe("# My Profile");
  });

  it("clear removes the file", async () => {
    await store.save("some content");
    await store.clear();
    expect(await store.load()).toBeNull();
  });

  it("clear is a no-op when file does not exist", async () => {
    await expect(store.clear()).resolves.toBeUndefined();
  });

  it("applyDelta does nothing for NO_CHANGES", async () => {
    await store.save("# Profile");
    await store.applyDelta("NO_CHANGES");
    expect(await store.load()).toBe("# Profile");
  });

  it("applyDelta saves full profile when no delta directives", async () => {
    await store.applyDelta("# New Profile\n\n## 技术栈\n\n- Go");
    expect(await store.load()).toContain("## 技术栈");
  });

  it("applyDelta applies delta directives to existing profile", async () => {
    await store.save("# Profile\n\n## 技术栈\n\n- TypeScript");
    await store.applyDelta("ADD: 技术栈 | Rust");
    const content = await store.load();
    expect(content).toContain("- Rust");
    expect(content).toContain("- TypeScript");
  });
});

describe("ProfileStore version history", () => {
  it("listBackups returns empty array when no backups exist", async () => {
    expect(await store.listBackups()).toEqual([]);
  });

  it("backup() is a no-op when no profile exists", async () => {
    await store.backup();
    expect(await store.listBackups()).toEqual([]);
  });

  it("backup() creates a backup file when profile exists", async () => {
    await store.save("# Profile v1");
    // Save itself creates a backup only if existing content was there first.
    // Explicit backup() on the freshly-saved file:
    await store.backup();
    const backups = await store.listBackups();
    expect(backups.length).toBeGreaterThanOrEqual(1);
  });

  it("save() auto-backups existing content before overwriting", async () => {
    // Write initial content directly (no backup yet)
    const profilePath = path.join(tmpDir, "user-profile.md");
    await fs.writeFile(profilePath, "# Profile v1", "utf8");

    // Now save via store — should auto-backup "v1"
    await store.save("# Profile v2");

    const backups = await store.listBackups();
    expect(backups.length).toBe(1);

    // Backup should contain the old content
    const backupContent = await fs.readFile(
      path.join(tmpDir, "user-profile-backups", backups[0]),
      "utf8",
    );
    expect(backupContent).toBe("# Profile v1");
  });

  it("save() does not create backup on first write (no existing file)", async () => {
    await store.save("# Profile v1");
    expect(await store.listBackups()).toEqual([]);
  });

  it("listBackups returns backups sorted newest first", async () => {
    const profilePath = path.join(tmpDir, "user-profile.md");

    // Write two saves with a small delay to get different timestamps
    await fs.writeFile(profilePath, "v1", "utf8");
    await store.save("v2");
    await new Promise(r => setTimeout(r, 10));
    await store.save("v3");

    const backups = await store.listBackups();
    expect(backups.length).toBe(2);
    // Newest (higher timestamp) should be first
    expect(backups[0] > backups[1]).toBe(true);
  });

  it("restore() puts backup content back as the active profile", async () => {
    const profilePath = path.join(tmpDir, "user-profile.md");
    await fs.writeFile(profilePath, "# Original", "utf8");
    await store.save("# Updated");

    const backups = await store.listBackups();
    expect(backups.length).toBe(1);

    await store.restore(backups[0]);
    expect(await store.load()).toBe("# Original");
  });

  it("restore() throws when backup file does not exist", async () => {
    await expect(store.restore("nonexistent.md")).rejects.toThrow();
  });

  it("pruning keeps at most 5 backups after repeated saves", async () => {
    const profilePath = path.join(tmpDir, "user-profile.md");
    await fs.writeFile(profilePath, "initial", "utf8");

    // Perform 7 saves — each triggers a backup of the previous content
    for (let i = 1; i <= 7; i++) {
      await new Promise(r => setTimeout(r, 5));
      await store.save(`version ${i}`);
    }

    const backups = await store.listBackups();
    expect(backups.length).toBeLessThanOrEqual(5);
  });

  it("applyDelta auto-backups via save()", async () => {
    const profilePath = path.join(tmpDir, "user-profile.md");
    await fs.writeFile(profilePath, "# Profile\n\n## 技术栈\n\n- TypeScript", "utf8");

    await store.applyDelta("ADD: 技术栈 | Rust");

    const backups = await store.listBackups();
    expect(backups.length).toBe(1);
    const backupContent = await fs.readFile(
      path.join(tmpDir, "user-profile-backups", backups[0]),
      "utf8",
    );
    expect(backupContent).toContain("- TypeScript");
    expect(backupContent).not.toContain("- Rust");
  });
});
