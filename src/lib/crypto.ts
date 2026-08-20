// Password-protected backups, built entirely on the browser's native Web
// Crypto API (no external crypto library, no key ever leaves the device).
//
// Scheme: PBKDF2-SHA256 (250,000 iterations, random 16-byte salt) derives a
// 256-bit AES-GCM key from the password; a random 12-byte IV is used per
// encryption. GCM's built-in authentication tag means a wrong password (or a
// tampered/corrupted file) fails decryption loudly instead of silently
// producing garbage data.

const PBKDF2_ITERATIONS = 250_000;

function bufToBase64(buf: ArrayBuffer): string {
  let binary = '';
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function base64ToBuf(b64: string): ArrayBuffer {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

export interface EncryptedEnvelope {
  encrypted: true;
  envelopeVersion: 1;
  kdf: 'PBKDF2-SHA256';
  iterations: number;
  salt: string; // base64
  iv: string; // base64
  ciphertext: string; // base64
}

/** True if a parsed JSON value looks like one of our encrypted backup envelopes (as opposed to a plain/unencrypted backup or an unrelated file). */
export function isEncryptedEnvelope(data: unknown): data is EncryptedEnvelope {
  return (
    typeof data === 'object' && data !== null &&
    (data as any).encrypted === true &&
    typeof (data as any).ciphertext === 'string' &&
    typeof (data as any).salt === 'string' &&
    typeof (data as any).iv === 'string'
  );
}

export class DecryptionError extends Error {}

async function deriveKey(password: string, salt: Uint8Array, iterations: number): Promise<CryptoKey> {
  const keyMaterial = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function encryptText(plainText: string, password: string): Promise<EncryptedEnvelope> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt, PBKDF2_ITERATIONS);
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv as BufferSource }, key, new TextEncoder().encode(plainText));
  return {
    encrypted: true,
    envelopeVersion: 1,
    kdf: 'PBKDF2-SHA256',
    iterations: PBKDF2_ITERATIONS,
    salt: bufToBase64(salt.buffer),
    iv: bufToBase64(iv.buffer),
    ciphertext: bufToBase64(ciphertext),
  };
}

/** Throws DecryptionError on a wrong password or a corrupted/tampered file - GCM's auth tag makes the two indistinguishable, which is the correct, safe behavior (never silently returns garbage). */
export async function decryptText(envelope: EncryptedEnvelope, password: string): Promise<string> {
  try {
    const salt = new Uint8Array(base64ToBuf(envelope.salt));
    const iv = new Uint8Array(base64ToBuf(envelope.iv));
    const key = await deriveKey(password, salt, envelope.iterations || PBKDF2_ITERATIONS);
    const plainBuf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: iv as BufferSource }, key, base64ToBuf(envelope.ciphertext));
    return new TextDecoder().decode(plainBuf);
  } catch {
    throw new DecryptionError('Incorrect password, or this file is corrupted.');
  }
}
