import { describe, it, expect } from 'vitest';
import { encryptText, decryptText, isEncryptedEnvelope, DecryptionError } from '@/lib/crypto';

describe('encryptText / decryptText (AES-GCM password-protected backups)', () => {
  it('round-trips plaintext through encryption and decryption with the correct password', async () => {
    const plainText = JSON.stringify({ version: 3, buildings: [{ id: 1, name: 'Test' }] });
    const envelope = await encryptText(plainText, 'correct horse battery staple');
    const decrypted = await decryptText(envelope, 'correct horse battery staple');
    expect(decrypted).toBe(plainText);
  });

  it('produces a different salt/IV/ciphertext on every call, even for the same input (no nonce reuse)', async () => {
    const a = await encryptText('same text', 'same password');
    const b = await encryptText('same text', 'same password');
    expect(a.salt).not.toBe(b.salt);
    expect(a.iv).not.toBe(b.iv);
    expect(a.ciphertext).not.toBe(b.ciphertext);
  });

  it('rejects decryption with the wrong password', async () => {
    const envelope = await encryptText('secret data', 'correct-password');
    await expect(decryptText(envelope, 'wrong-password')).rejects.toThrow(DecryptionError);
  });

  it('rejects decryption of a tampered ciphertext (GCM auth tag catches modification)', async () => {
    const envelope = await encryptText('secret data', 'a-password');
    const tampered = { ...envelope, ciphertext: envelope.ciphertext.slice(0, -4) + 'AAAA' };
    await expect(decryptText(tampered, 'a-password')).rejects.toThrow(DecryptionError);
  });

  it('isEncryptedEnvelope correctly identifies an encrypted envelope vs. a plain backup', async () => {
    const envelope = await encryptText('x', 'y');
    expect(isEncryptedEnvelope(envelope)).toBe(true);
    expect(isEncryptedEnvelope({ version: 3, buildings: [] })).toBe(false);
    expect(isEncryptedEnvelope(null)).toBe(false);
    expect(isEncryptedEnvelope('a string')).toBe(false);
  });
});
