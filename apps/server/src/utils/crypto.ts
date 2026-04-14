import crypto from "node:crypto";
import { env } from "../config/env.js";

/**
 * Symmetric encryption for storing API keys and other sensitive config
 * in the database. Uses AES-256-GCM with a key derived from ENCRYPTION_KEY.
 *
 * Format of encrypted string: <iv_hex>:<authTag_hex>:<ciphertext_hex>
 */

function getKey(): Buffer {
  const keySource = env.ENCRYPTION_KEY || "dev-encryption-key-change-this";
  // Derive a stable 32-byte key from whatever the user provided
  return crypto.createHash("sha256").update(keySource).digest();
}

export function encryptString(plaintext: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted.toString("hex")}`;
}

export function decryptString(encrypted: string): string {
  try {
    const [ivHex, authTagHex, cipherHex] = encrypted.split(":");
    if (!ivHex || !authTagHex || !cipherHex) {
      throw new Error("Malformed encrypted string");
    }
    const decipher = crypto.createDecipheriv(
      "aes-256-gcm",
      getKey(),
      Buffer.from(ivHex, "hex")
    );
    decipher.setAuthTag(Buffer.from(authTagHex, "hex"));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(cipherHex, "hex")),
      decipher.final()
    ]);
    return decrypted.toString("utf8");
  } catch (err) {
    console.error("[crypto] Decryption failed:", (err as Error).message);
    return "";
  }
}

export function encryptJson<T>(obj: T): string {
  return encryptString(JSON.stringify(obj));
}

export function decryptJson<T>(encrypted: string): T | null {
  const plain = decryptString(encrypted);
  if (!plain) return null;
  try {
    return JSON.parse(plain) as T;
  } catch {
    return null;
  }
}
