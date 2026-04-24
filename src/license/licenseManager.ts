import { verify as cryptoVerify } from "node:crypto";

/**
 * License Key verification (Spec §6.4)
 *
 * Format:
 *   CAIN-{BASE32(Ed25519_Sign(private_key, payload) + payload)}
 *
 * payload = version_byte(1) || expiry_uint32_be(4) || flags_uint16_be(2)
 *         = 7 bytes total
 *
 * The public key is embedded in the client as DER/SPKI hex.
 * The private key must never appear here and is only used by scripts/generateLicense.ts.
 */

const PUBLIC_KEY_HEX =
  "302a300506032b65700321003d3ea98a9b43ed30937645eeee014fb552c870a3308f3f9d79ce58910220e9a4";

const BASE32_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function base32Decode(input: string): Buffer {
  const str = input.toUpperCase().replace(/=+$/, "");
  let bits = 0;
  let value = 0;
  const output: number[] = [];

  for (const char of str) {
    const idx = BASE32_CHARS.indexOf(char);
    if (idx === -1) {
      throw new Error(`Invalid base32 character: ${char}`);
    }
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      output.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }

  return Buffer.from(output);
}

export type LicenseFlags = {
  sessionPersistence: boolean;
  multiSession: boolean;
  swarm: boolean;
};

export type LicenseResult =
  | { valid: true; flags: LicenseFlags; expiresAt: Date | null }
  | { valid: false; reason: string };

/**
 * Verify a license key and return the unlocked feature flags.
 * This check is fully offline and does not require network access.
 */
export function verifyLicense(rawKey: string): LicenseResult {
  const match = rawKey.trim().toUpperCase().match(/^CAIN-([A-Z2-7]{40,})$/);
  if (!match) {
    return { valid: false, reason: "Key 格式不正确，应为 CAIN-XXXX... 格式。" };
  }

  let decoded: Buffer;
  try {
    decoded = base32Decode(match[1]);
  } catch {
    return { valid: false, reason: "Key 解码失败，请检查是否完整复制。" };
  }

  if (decoded.length < 71) {
    return { valid: false, reason: "Key 长度不足，请检查是否完整复制。" };
  }

  const signature = decoded.subarray(0, 64);
  const payload = decoded.subarray(64, 71);

  try {
    const publicKeyDer = Buffer.from(PUBLIC_KEY_HEX, "hex");
    const ok = cryptoVerify(
      null,
      payload,
      { key: publicKeyDer, format: "der", type: "spki" },
      signature,
    );
    if (!ok) {
      return { valid: false, reason: "Key 签名无效，请确认 Key 来源正确。" };
    }
  } catch {
    return { valid: false, reason: "Key 验证过程出错，请联系支持。" };
  }

  const version = payload[0];
  if (version !== 1) {
    return { valid: false, reason: `不支持的 Key 版本 v${version}，请更新软件后重试。` };
  }

  const expiryTimestamp = payload.readUInt32BE(1);
  const flags = payload.readUInt16BE(5);

  const now = Math.floor(Date.now() / 1000);
  if (expiryTimestamp !== 0 && expiryTimestamp < now) {
    return { valid: false, reason: "License Key 已过期。" };
  }

  const expiresAt = expiryTimestamp === 0 ? null : new Date(expiryTimestamp * 1000);

  return {
    valid: true,
    expiresAt,
    flags: {
      sessionPersistence: (flags & 0x0001) !== 0,
      multiSession: (flags & 0x0002) !== 0,
      swarm: (flags & 0x0004) !== 0,
    },
  };
}
