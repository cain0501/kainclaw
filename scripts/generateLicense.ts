/**
 * License Key 批量生成脚本（Spec §6.4）
 *
 * 用法：
 *   npx ts-node scripts/generateLicense.ts [count] [flags] [expiryDays]
 *
 *   count      — 生成数量，默认 1
 *   flags      — 功能标志位（十进制），默认 7（全部解锁）
 *                  0x01 = sessionPersistence
 *                  0x02 = multiSession
 *                  0x04 = swarm
 *                  7    = 全部解锁
 *   expiryDays — 有效天数，0 = 永不过期，默认 0
 *
 * 示例：
 *   npx ts-node scripts/generateLicense.ts 10 7 0
 *   → 生成 10 个永久全功能 Key
 *
 * ⚠️  私钥只在此脚本中使用，绝不打包进客户端。
 */

import { sign as cryptoSign } from "node:crypto";

// ── 私钥（DER/PKCS8，hex）— 必须从环境变量读取，禁止硬编码 ──
// ⚠️  CAIN_PRIVATE_KEY 环境变量未设置时直接报错，不提供任何默认值。
// 私钥一旦硬编码提交到 git，history 里永久泄露，无法撤回。
const rawPrivateKeyHex = process.env["CAIN_PRIVATE_KEY"];
if (!rawPrivateKeyHex) {
  console.error("错误：必须设置 CAIN_PRIVATE_KEY 环境变量。");
  console.error("示例：CAIN_PRIVATE_KEY=<hex> npx ts-node scripts/generateLicense.ts");
  process.exit(1);
}
const PRIVATE_KEY_HEX = rawPrivateKeyHex;

const BASE32_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = "";
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_CHARS[(value >>> (bits - 5)) & 0x1f];
      bits -= 5;
    }
  }
  if (bits > 0) output += BASE32_CHARS[(value << (5 - bits)) & 0x1f];
  return output;
}

function generateKey(flags: number, expiryDays: number): string {
  // payload: version(1) + expiry_uint32_be(4) + flags_uint16_be(2) = 7 bytes
  const payload = Buffer.alloc(7);
  payload[0] = 1; // version

  const expiryTimestamp = expiryDays === 0
    ? 0
    : Math.floor(Date.now() / 1000) + expiryDays * 86400;
  payload.writeUInt32BE(expiryTimestamp, 1);
  payload.writeUInt16BE(flags, 5);

  const privateKeyDer = Buffer.from(PRIVATE_KEY_HEX, "hex");
  const signature = cryptoSign(null, payload, { key: privateKeyDer, format: "der", type: "pkcs8" });

  // Key = signature(64 bytes) + payload(7 bytes) → Base32 → 前缀 CAIN-
  const combined = Buffer.concat([signature, payload]);
  return "CAIN-" + base32Encode(combined);
}

// ── main ─────────────────────────────────────────────────

const count      = Number(process.argv[2]) || 1;
const flags      = Number(process.argv[3]) ?? 7;
const expiryDays = Number(process.argv[4]) ?? 0;

console.log(`生成 ${count} 个 License Key（flags=${flags}, expiry=${expiryDays === 0 ? "永不过期" : expiryDays + " 天"}）\n`);

for (let i = 0; i < count; i++) {
  console.log(generateKey(flags, expiryDays));
}
