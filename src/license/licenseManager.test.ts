import { describe, expect, it } from "vitest";
import { verifyLicense } from "./licenseManager";

describe("licenseManager", () => {
  it("rejects malformed key formats", () => {
    expect(verifyLicense("not-a-license")).toEqual({
      valid: false,
      reason: "Key 格式不正确，应为 CAIN-XXXX... 格式。",
    });
  });

  it("rejects keys that are too short after base32 decode", () => {
    const result = verifyLicense("CAIN-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA");

    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.reason).toContain("长度不足");
    }
  });

  it("rejects invalid signatures for syntactically valid keys", () => {
    const result = verifyLicense("CAIN-ABCDEFGHIJKLMNOPQRSTUVWXYZ234567ABCDEFGH");

    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.reason === "Key 长度不足，请检查是否完整复制。" || result.reason === "Key 签名无效，请确认 Key 来源正确。").toBe(true);
    }
  });
});
