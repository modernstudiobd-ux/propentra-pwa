import { describe, it, expect } from 'vitest';
import {
  validateFile, validateImageFile, validateFileContent, sniffFileType,
  blobToBase64, base64ToBlob, maskIdNumber,
} from '@/lib/fileValidation';

const PNG_HEADER = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG_HEADER = [0xff, 0xd8, 0xff, 0xe0];
const PDF_HEADER = [0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34];

function makeFile(bytes: number[], name: string, type: string, padTo = 0): File {
  const arr = new Uint8Array(Math.max(bytes.length, padTo));
  arr.set(bytes);
  return new File([arr], name, { type });
}

describe('validateFile (size + declared type only)', () => {
  it('rejects empty files', () => {
    const f = new File([], 'empty.png', { type: 'image/png' });
    expect(validateFile(f)).toMatch(/empty/i);
  });

  it('rejects files over the size limit', () => {
    const big = new File([new Uint8Array(2 * 1024 * 1024)], 'big.png', { type: 'image/png' });
    expect(validateFile(big, { maxSizeMB: 1 })).toMatch(/too large/i);
  });

  it('rejects disallowed declared types', () => {
    const f = makeFile(PNG_HEADER, 'file.exe', 'application/x-msdownload');
    expect(validateFile(f)).toMatch(/unsupported/i);
  });

  it('accepts a valid, in-limit, allowed-type file', () => {
    const f = makeFile(PNG_HEADER, 'photo.png', 'image/png');
    expect(validateFile(f)).toBeNull();
  });
});

describe('sniffFileType (magic bytes)', () => {
  it('identifies PNG, JPEG and PDF by their actual byte signature', async () => {
    expect(await sniffFileType(makeFile(PNG_HEADER, 'a.png', 'image/png'))).toBe('image/png');
    expect(await sniffFileType(makeFile(JPEG_HEADER, 'a.jpg', 'image/jpeg'))).toBe('image/jpeg');
    expect(await sniffFileType(makeFile(PDF_HEADER, 'a.pdf', 'application/pdf'))).toBe('application/pdf');
  });

  it('returns null for unrecognized content', async () => {
    const f = makeFile([0x00, 0x01, 0x02, 0x03], 'mystery.bin', 'application/octet-stream');
    expect(await sniffFileType(f)).toBeNull();
  });
});

describe('validateFileContent (real content validation)', () => {
  it('accepts a file whose content genuinely matches its declared type', async () => {
    const f = makeFile(PNG_HEADER, 'id-scan.png', 'image/png');
    expect(await validateFileContent(f)).toBeNull();
  });

  it('rejects a disguised file: real content is an executable-ish blob labeled as an image', async () => {
    // Declared as image/png but the actual bytes don't match any known
    // image/PDF signature - this is exactly the "renamed .exe to photo.png"
    // attack that extension/MIME-only validation misses.
    const disguised = makeFile([0x4d, 0x5a, 0x90, 0x00], 'photo.png', 'image/png'); // MZ = Windows executable header
    const err = await validateFileContent(disguised);
    expect(err).toBeTruthy();
    expect(err).toMatch(/content/i);
  });

  it('rejects a file whose real content is a different-but-otherwise-allowed type than declared', async () => {
    // Actual bytes are a real PDF, but the browser/input reports image/png -
    // still a mismatch worth flagging even though PDFs are otherwise allowed.
    const mislabeled = makeFile(PDF_HEADER, 'contract.png', 'image/png');
    const err = await validateFileContent(mislabeled, { allowedTypes: ['image/png', 'application/pdf'] });
    expect(err).toMatch(/mislabeled|corrupted|content/i);
  });

  it('rejects sniffed content that is outright disallowed even if declared type lies', async () => {
    const pdfAsImage = makeFile(PDF_HEADER, 'scan.jpg', 'image/jpeg');
    const err = await validateFileContent(pdfAsImage, { allowedTypes: ['image/png', 'image/jpeg'] });
    expect(err).toBeTruthy();
  });
});

describe('validateImageFile', () => {
  it('rejects non-image declared types', () => {
    const f = makeFile(PDF_HEADER, 'doc.pdf', 'application/pdf');
    expect(validateImageFile(f)).toMatch(/unsupported/i);
  });
});

describe('base64 <-> Blob round-trip', () => {
  it('preserves bytes and mime type through blobToBase64 -> base64ToBlob', async () => {
    const original = new Blob([new Uint8Array(PNG_HEADER)], { type: 'image/png' });
    const base64 = await blobToBase64(original);
    const restored = base64ToBlob(base64);

    expect(restored.type).toBe('image/png');
    const restoredBytes = new Uint8Array(await restored.arrayBuffer());
    expect(Array.from(restoredBytes)).toEqual(PNG_HEADER);
  });
});

describe('maskIdNumber', () => {
  it('shows only the last 4 characters, masking the rest', () => {
    expect(maskIdNumber('AB1234567')).toBe('•••••4567');
  });

  it('fully masks values of 4 characters or fewer', () => {
    expect(maskIdNumber('123')).toBe('•••');
  });

  it('returns an empty string for empty/undefined input', () => {
    expect(maskIdNumber(undefined)).toBe('');
    expect(maskIdNumber('')).toBe('');
  });
});
