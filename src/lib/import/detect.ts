import { normalizeHeader, type ImportEntityDef } from './schemas';

export type DetectedColumnType = 'number' | 'date' | 'boolean' | 'string';

export const COLUMN_TYPE_LABEL: Record<DetectedColumnType, string> = {
  string: 'Text', number: 'Number', date: 'Date', boolean: 'Yes/No',
};

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

// Small connector words stripped out before comparing header text, so
// "Name of Building" and "Building Name" score the same as "Building".
const STOPWORDS = new Set(['the', 'a', 'an', 'of', 'is', 'for', 'on', 'in', 'to', 'and']);

/** Splits a header into lowercase words - handles camelCase, spaces, underscores, punctuation, and "#"/"No." abbreviations. */
function tokenize(s: string): string[] {
  return s
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/#/g, ' number ')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 0 && !STOPWORDS.has(t));
}

/** Classic edit-distance, used only as a typo-tolerance fallback for close single-word headers. */
function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp = new Array(n + 1);
  for (let j = 0; j <= n; j++) dp[j] = j;
  for (let i = 1; i <= m; i++) {
    let prevDiag = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = dp[j];
      dp[j] = a[i - 1] === b[j - 1] ? prevDiag : 1 + Math.min(prevDiag, dp[j], dp[j - 1]);
      prevDiag = tmp;
    }
  }
  return dp[n];
}

/**
 * Scores how well one sheet header matches one candidate name (a field's
 * key, label, or one of its aliases), from 0 (no match) to 1 (identical).
 * Combines exact match, word-overlap (so word order / extra connector words
 * / synonyms don't matter), substring containment, and typo tolerance -
 * this is what lets "Tenant Full Name" match the "Resident Name" field's
 * "fullname" alias, or "Buildng" still match "Building" despite the typo.
 */
function headerMatchScore(headerNorm: string, headerTokens: string[], candidateRaw: string): number {
  const candNorm = normalizeHeader(candidateRaw);
  if (!candNorm || !headerNorm) return 0;
  if (headerNorm === candNorm) return 1;

  const candTokens = tokenize(candidateRaw);
  if (candTokens.length > 0 && headerTokens.length > 0) {
    const headerSet = new Set(headerTokens);
    const candSet = new Set(candTokens);
    const overlap = [...headerSet].filter((t) => candSet.has(t)).length;
    if (overlap > 0) {
      if (overlap === candSet.size && overlap === headerSet.size) return 0.97; // same words, different order
      if (overlap === candSet.size) return 0.9; // every word in the candidate (e.g. "rent") appears in the header (e.g. "monthly rent amount")
      if (overlap === headerSet.size) return 0.85; // every word in the header appears in the candidate
      const jaccard = overlap / new Set([...headerSet, ...candSet]).size;
      if (jaccard >= 0.5) return 0.55 + jaccard * 0.2;
    }
  }

  if (headerNorm.length > 2 && candNorm.length > 2 && (headerNorm.includes(candNorm) || candNorm.includes(headerNorm))) {
    return 0.65;
  }

  // Typo tolerance: only for headers substantial enough that a coincidental
  // near-match is unlikely (e.g. "Buildng" vs "Building", not "id" vs "od").
  if (headerNorm.length >= 4 && candNorm.length >= 4) {
    const dist = levenshtein(headerNorm, candNorm);
    const ratio = 1 - dist / Math.max(headerNorm.length, candNorm.length);
    if (ratio >= 0.8) return 0.5 + (ratio - 0.8) * 1.5;
  }

  return 0;
}

// Below this score a match is too weak to trust automatically - the person
// maps that field by hand instead of risking a wrong guess.
const MATCH_THRESHOLD = 0.55;

/**
 * Best-effort mapping from target fields to source column indices. Tries
 * every field's key/label/aliases against every unused header and picks the
 * strongest match above MATCH_THRESHOLD, using synonym-aware word overlap
 * and typo tolerance rather than requiring an exact or substring match -
 * this is what lets differently-worded tabs (e.g. "Tenant Name" vs
 * "Resident Full Name" vs "Occupant") all auto-map correctly. Returns -1
 * for any field that couldn't be confidently auto-mapped.
 */
export function autoMapColumns(headers: string[], def: ImportEntityDef): Record<string, number> {
  const normHeaders = headers.map(normalizeHeader);
  const tokenizedHeaders = headers.map(tokenize);
  const used = new Set<number>();
  const mapping: Record<string, number> = {};

  for (const field of def.fields) {
    const candidates = [field.key, field.label, ...field.aliases];
    let bestIdx = -1;
    let bestScore = 0;
    for (let i = 0; i < headers.length; i++) {
      if (used.has(i) || !normHeaders[i]) continue;
      for (const cand of candidates) {
        const score = headerMatchScore(normHeaders[i], tokenizedHeaders[i], cand);
        if (score > bestScore) {
          bestScore = score;
          bestIdx = i;
        }
      }
    }
    if (bestScore >= MATCH_THRESHOLD) {
      used.add(bestIdx);
      mapping[field.key] = bestIdx;
    } else {
      mapping[field.key] = -1;
    }
  }
  return mapping;
}
