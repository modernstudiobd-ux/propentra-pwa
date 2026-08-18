const DEFAULT_MAX_MB = 5;
const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif'];
const DOCUMENT_TYPES = [...IMAGE_TYPES, 'application/pdf'];

// Magic-byte ("file signature") sniffing. A file's declared MIME type / its
// extension are just labels the browser trusts from the OS - either can be
// spoofed (e.g. renaming a script to photo.png). Checking the first bytes of
// the actual content is what real content validation means.
const SIGNATURES: { mime: string; bytes: (number | null)[] }[] = [
  { mime: 'image/png', bytes: [0x89, 0x50, 0x4e, 0x47] },
  { mime: 'image/jpeg', bytes: [0xff, 0xd8, 0xff] },
  { mime: 'image/gif', bytes: [0x47, 0x49, 0x46, 0x38] },
  { mime: 'image/webp', bytes: [0x52, 0x49, 0x46, 0x46, null, null, null, null, 0x57, 0x45, 0x42, 0x50] },
  { mime: 'application/pdf', bytes: [0x25, 0x50, 0x44, 0x46] },
];

/** Reads the first bytes of a file and matches them against known file signatures. Returns the sniffed mime type, or null if unrecognized. */
export async function sniffFileType(file: Blob): Promise<string | null> {
  const head = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  for (const sig of SIGNATURES) {
    if (sig.bytes.every((b, i) => b === null || head[i] === b)) return sig.mime;
  }
  return null;
}

export function validateFile(
  file: File,
  opts: { maxSizeMB?: number; allowedTypes?: string[] } = {}
): string | null {
  const maxSizeMB = opts.maxSizeMB ?? DEFAULT_MAX_MB;
  const allowedTypes = opts.allowedTypes ?? DOCUMENT_TYPES;

  if (file.size === 0) return 'This file is empty.';
  if (file.size > maxSizeMB * 1024 * 1024) return `File is too large - max ${maxSizeMB}MB.`;
  if (allowedTypes.length && !allowedTypes.includes(file.type)) {
    return `Unsupported file type. Allowed: ${allowedTypes.map((t) => t.split('/')[1]).join(', ')}.`;
  }
  return null;
}

/**
 * Full validation: size + declared type, PLUS sniffing the actual file
 * content so a mislabeled or disguised file (wrong extension/MIME) is
 * caught before it's stored. Use this for anything user-uploaded; the
 * lighter validateFile/validateImageFile remain for callers that only need
 * the cheap synchronous checks.
 */
export async function validateFileContent(
  file: File,
  opts: { maxSizeMB?: number; allowedTypes?: string[] } = {}
): Promise<string | null> {
  const basic = validateFile(file, opts);
  if (basic) return basic;
  const allowedTypes = opts.allowedTypes ?? DOCUMENT_TYPES;
  const sniffed = await sniffFileType(file);
  if (!sniffed) return "This file's content doesn't match a supported file type (or the file is corrupted).";
  if (!allowedTypes.includes(sniffed)) {
    return `This file's actual content is a ${sniffed.split('/')[1]} file, which isn't allowed here.`;
  }
  // jpeg/jpg are the same signature reported under two MIME strings - don't
  // reject e.g. a browser reporting "image/jpg" against a sniffed "image/jpeg".
  if (sniffed !== file.type && !(sniffed === 'image/jpeg' && file.type === 'image/jpg')) {
    return `This file's content doesn't match its declared type (${file.type || 'unknown'}). It may be mislabeled or corrupted.`;
  }
  return null;
}

export function validateImageFile(file: File, maxSizeMB = 3): string | null {
  return validateFile(file, { maxSizeMB, allowedTypes: IMAGE_TYPES });
}

export async function validateImageFileContent(file: File, maxSizeMB = 3): Promise<string | null> {
  return validateFileContent(file, { maxSizeMB, allowedTypes: IMAGE_TYPES });
}

/**
 * Masks a sensitive ID number for display: shows only the last 4
 * characters, everything else becomes bullets. Used anywhere an ID number
 * might be shown without the person actively choosing to reveal it.
 */
export function maskIdNumber(value?: string | null): string {
  if (!value) return '';
  const trimmed = value.trim();
  if (trimmed.length <= 4) return '•'.repeat(trimmed.length);
  return '•'.repeat(trimmed.length - 4) + trimmed.slice(-4);
}

export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Could not read file'));
    reader.readAsDataURL(file);
  });
}

/** Blob -> base64 data URL, used only when writing a JSON backup file. */
export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Could not read file'));
    reader.readAsDataURL(blob);
  });
}

/** base64 data URL -> Blob, used only when restoring from a JSON backup file. */
export function base64ToBlob(dataUrl: string): Blob {
  const [header, data] = dataUrl.split(',');
  const mime = /data:(.*?);base64/.exec(header)?.[1] || 'application/octet-stream';
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}
