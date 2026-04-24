import { describe, expect, it, vi } from "vitest";
import {
  createLicenseHostBindings,
  restoreStoredLicenseFlags,
} from "./licenseHost";

describe("licenseHost", () => {
  it("skips restore when flags are already loaded", async () => {
    const log = vi.fn();
    const getSecret = vi.fn(async () => "unused");

    await restoreStoredLicenseFlags({
      getCurrentLicenseFlags: () => ({
        sessionPersistence: true,
        multiSession: true,
        swarm: false,
      }),
      getSecret,
      verifyLicense: () => ({ valid: false, reason: "unused" }),
      setLicenseFlags: vi.fn(),
      log,
      warn: vi.fn(),
    });

    expect(getSecret).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith(
      "[Cain License] restore skipped: flags already loaded",
    );
  });

  it("skips restore when there is no stored key", async () => {
    const log = vi.fn();

    await restoreStoredLicenseFlags({
      getCurrentLicenseFlags: () => undefined,
      getSecret: async () => undefined,
      verifyLicense: () => ({ valid: false, reason: "unused" }),
      setLicenseFlags: vi.fn(),
      log,
      warn: vi.fn(),
    });

    expect(log).toHaveBeenCalledWith(
      "[Cain License] restore skipped: no stored license key",
    );
  });

  it("warns on invalid stored keys and restores valid flags", async () => {
    const warn = vi.fn();
    const log = vi.fn();
    const setLicenseFlags = vi.fn();

    await restoreStoredLicenseFlags({
      getCurrentLicenseFlags: () => undefined,
      getSecret: async () => "invalid-key",
      verifyLicense: () => ({ valid: false, reason: "bad key" }),
      setLicenseFlags,
      log,
      warn,
    });

    expect(warn).toHaveBeenCalledWith(
      "[Cain License] restore failed:",
      "bad key",
    );
    expect(setLicenseFlags).not.toHaveBeenCalled();

    warn.mockClear();
    log.mockClear();

    await restoreStoredLicenseFlags({
      getCurrentLicenseFlags: () => undefined,
      getSecret: async () => "valid-key",
      verifyLicense: () => ({
        valid: true,
        flags: {
          sessionPersistence: true,
          multiSession: true,
          swarm: true,
        },
        expiresAt: new Date("2026-04-14T00:00:00.000Z"),
      }),
      setLicenseFlags,
      log,
      warn,
    });

    expect(setLicenseFlags).toHaveBeenCalledWith({
      sessionPersistence: true,
      multiSession: true,
      swarm: true,
    });
    expect(log).toHaveBeenCalledWith(
      "[Cain License] restored flags",
      JSON.stringify({
        sessionPersistence: true,
        multiSession: true,
        swarm: true,
      }),
      "expiresAt=",
      "2026-04-14T00:00:00.000Z",
    );
  });

  it("creates bindings for postLicenseRequired and restore", async () => {
    const postLicenseRequired = vi.fn();
    const restore = vi.fn(async () => undefined);

    const bindings = createLicenseHostBindings({
      getCurrentLicenseFlags: () => undefined,
      getSecret: async () => undefined,
      verifyLicense: () => ({ valid: false, reason: "unused" }),
      setLicenseFlags: vi.fn(),
      postLicenseRequired,
      log: restore,
      warn: vi.fn(),
    });

    bindings.postLicenseRequired("swarm");
    await bindings.restoreLicenseFlags();

    expect(postLicenseRequired).toHaveBeenCalledWith("swarm");
    expect(restore).toHaveBeenCalled();
  });
});
