import type { LicenseFlags } from "./license/licenseManager";

export type LicenseVerificationResult =
  | { valid: true; flags: LicenseFlags; expiresAt: Date | null }
  | { valid: false; reason: string };

export type LicenseHostBindings = {
  postLicenseRequired: (feature: keyof LicenseFlags) => void;
  restoreLicenseFlags: () => Promise<void>;
};

export type LicenseHostBindingFactory = (options: {
  getCurrentLicenseFlags: () => LicenseFlags | undefined;
  setLicenseFlags: (flags: LicenseFlags | undefined) => void;
}) => LicenseHostBindings;

export async function restoreStoredLicenseFlags(options: {
  getCurrentLicenseFlags: () => LicenseFlags | undefined;
  getSecret: (key: string) => Promise<string | undefined>;
  verifyLicense: (rawKey: string) => LicenseVerificationResult;
  setLicenseFlags: (flags: LicenseFlags) => void;
  log: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
}): Promise<void> {
  if (options.getCurrentLicenseFlags()) {
    options.log("[Cain License] restore skipped: flags already loaded");
    return;
  }

  const rawKey = await options.getSecret("cain.licenseKey");
  if (!rawKey) {
    options.log("[Cain License] restore skipped: no stored license key");
    return;
  }

  const result = options.verifyLicense(rawKey);
  if (!result.valid) {
    options.warn("[Cain License] restore failed:", result.reason);
    return;
  }

  options.setLicenseFlags(result.flags);
  options.log(
    "[Cain License] restored flags",
    JSON.stringify(result.flags),
    "expiresAt=",
    result.expiresAt ? result.expiresAt.toISOString() : "never",
  );
}

export function createLicenseHostBindings(options: {
  getCurrentLicenseFlags: () => LicenseFlags | undefined;
  getSecret: (key: string) => Promise<string | undefined>;
  verifyLicense: (rawKey: string) => LicenseVerificationResult;
  setLicenseFlags: (flags: LicenseFlags) => void;
  postLicenseRequired: (feature: keyof LicenseFlags) => void;
  log: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
}): LicenseHostBindings {
  return {
    postLicenseRequired: feature => {
      options.postLicenseRequired(feature);
    },
    restoreLicenseFlags: () =>
      restoreStoredLicenseFlags({
        getCurrentLicenseFlags: options.getCurrentLicenseFlags,
        getSecret: options.getSecret,
        verifyLicense: options.verifyLicense,
        setLicenseFlags: options.setLicenseFlags,
        log: options.log,
        warn: options.warn,
      }),
  };
}

export function createLicenseHostBindingsFactory(options: {
  getSecret: (key: string) => Promise<string | undefined>;
  verifyLicense: (rawKey: string) => LicenseVerificationResult;
  postLicenseRequired: (feature: keyof LicenseFlags) => void;
  log: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
}): LicenseHostBindingFactory {
  return state =>
    createLicenseHostBindings({
      getCurrentLicenseFlags: state.getCurrentLicenseFlags,
      getSecret: options.getSecret,
      verifyLicense: options.verifyLicense,
      setLicenseFlags: flags => {
        if (flags) {
          state.setLicenseFlags(flags);
        }
      },
      postLicenseRequired: options.postLicenseRequired,
      log: options.log,
      warn: options.warn,
    });
}
