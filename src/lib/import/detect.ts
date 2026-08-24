import { normalizeHeader, type ImportEntityDef } from './schemas';

export type DetectedColumnType = 'number' | 'date' | 'boolean' | 'string';

const BOOL_RE = /^(true|false|yes|no|y|n)$/i;

// Requires an actual date-like separator or a month name - a bare number
// like "2024" or "100" must never be misread as a date.
function isDateLike(v: any): boolean {
  if (v instanceof Date) return true;
  const s = String(v).trim();
  if (/^\d{4}-\d{1,2}-\d{1,2}/.test(s)) return true; // 2024-01-15
  if (/^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(s)) return true; // 01/15/2024
  if (/^\d{1,2}-\d{1,2}-\d{2,4}$/.test(s)) return true; // 15-01-2024
  if (/^[a-z]{3,9}\.?\s+\d{1,2},?\s+\d{4}$/i.test(s)) return true; // Jan 15, 2024
  if (/^\d{1,2}\s+[a-z]{3,9}\.?\s+\d{4}$/i.test(s)) return true; // 15 Jan 2024
  return false;
}

function isNumberLike(v: any): boolean {
  if (typeof v === 'number') return Number.isFinite(v);
  const s = String(v).trim();
  if (!s) return false;
  const cleaned = s.replace(/[,$\s%]/g, '');
  return cleaned !== '' && !isNaN(Number(cleaned));
}

/** Infers a column's data type from a sample of its values - shown to the user in the mapping step and used to pick a sensible default when nothing else is mapped there. */
export function detectColumnType(sampleValues: any[]): DetectedColumnType {
  const nonEmpty = sampleValues.filter((v) => v !== '' && v !== null && v !== undefined).slice(0, 50);
  if (nonEmpty.length === 0) return 'string';
  if (nonEmpty.every((v) => typeof v === 'boolean' || BOOL_RE.test(String(v).trim()))) return 'boolean';
  if (nonEmpty.every(isDateLike)) return 'date';
  if (nonEmpty.every(isNumberLike)) return 'number';
  return 'string';
}

/**
 * Best-effort mapping from target fields to source column indices, using
 * exact then partial alias matches. Returns -1 for any field that couldn't
 * be confidently auto-mapped (left for the person to map manually).
 */
export function autoMapColumns(headers: string[], def: ImportEntityDef): Record<string, number> {
  const normHeaders = headers.map(normalizeHeader);
  const used = new Set<number>();
  const mapping: Record<string, number> = {};

  for (const field of def.fields) {
    const candidates = [field.key, field.label, ...field.aliases].map(normalizeHeader);
    let found = -1;
    for (const cand of candidates) {
      const idx = normHeaders.findIndex((h, i) => h === cand && !used.has(i));
      if (idx !== -1) { found = idx; break; }
    }
    if (found === -1) {
      const idx = normHeaders.findIndex(
        (h, i) => !used.has(i) && h.length > 0 && candidates.some((c) => c.length > 2 && (h.includes(c) || c.includes(h)))
      );
      if (idx !== -1) found = idx;
    }
    if (found !== -1) used.add(found);
    mapping[field.key] = found;
  }
  return mapping;
}
