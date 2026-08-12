const DEFAULT_MAX_MB = 5;
const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif'];
const DOCUMENT_TYPES = [...IMAGE_TYPES, 'application/pdf'];

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

export function validateImageFile(file: File, maxSizeMB = 3): string | null {
  return validateFile(file, { maxSizeMB, allowedTypes: IMAGE_TYPES });
}

export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Could not read file'));
    reader.readAsDataURL(file);
  });
}
