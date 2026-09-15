// Free-text address normalization/comparison, shared by anything that needs
// to decide whether two addresses refer to the same place (currently: the
// Owners Bulk Add flow's owner-occupancy classification - see
// lib/import/ownerClassification.ts). Kept separate/generic on purpose so
// another feature can reuse it later without a second implementation.

// Common street-suffix/direction/unit abbreviations, expanded before
// comparison so "123 Main St., Apt 4B" and "123 main street apartment 4b"
// normalize identically. Deliberately conservative (only well-known,
// unambiguous abbreviations) - guessing wrong here would create false
// matches, which is worse than missing a few real ones.
const ABBREVIATIONS: Record<string, string> = {
  st: 'street', str: 'street', rd: 'road', ave: 'avenue', av: 'avenue',
  blvd: 'boulevard', dr: 'drive', ln: 'lane', ct: 'court', pl: 'place',
  apt: 'apartment', ste: 'suite', bldg: 'building', fl: 'floor',
  no: 'number', num: 'number', hwy: 'highway', pkwy: 'parkway', sq: 'square',
  mt: 'mount', ft: 'fort', n: 'north', s: 'south', e: 'east', w: 'west',
  ne: 'northeast', nw: 'northwest', se: 'southeast', sw: 'southwest',
};

/** Lowercases, strips punctuation/line breaks, collapses whitespace, and expands common address abbreviations - the shared normal form both sides of a comparison are reduced to. */
export function normalizeAddress(raw: string | undefined | null): string {
  const cleaned = (raw ?? '')
    .toLowerCase()
    .replace(/[\r\n]+/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ') // punctuation (commas, periods, #, -, etc.) all become whitespace
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return '';
  return cleaned.split(' ').map((w) => ABBREVIATIONS[w] ?? w).join(' ');
}

function tokens(s: string): string[] {
  return s.split(' ').filter(Boolean);
}

/** Tokens that look like a house/unit number (leading digits, optional trailing letter e.g. "4b") - the strongest, cheapest signal a street address carries. */
function numberTokens(s: string): string[] {
  return tokens(s).filter((w) => /^\d+[a-z]?$/.test(w));
}

export type AddressMatchStatus = 'match' | 'review' | 'none';

/**
 * Classifies how confidently two free-text addresses refer to the same
 * place, after normalization:
 * - 'match'  - confidently the same address (safe to auto-treat as the same place)
 * - 'review' - some real overlap, but not confident enough to assume - a
 *              person should confirm rather than the system guessing
 * - 'none'   - clearly different addresses, or nothing to compare
 *
 * Either input being blank always returns 'none' - never assume a match
 * from missing data.
 */
export function matchAddresses(addressA: string | undefined | null, addressB: string | undefined | null): AddressMatchStatus {
  const a = normalizeAddress(addressA);
  const b = normalizeAddress(addressB);
  if (!a || !b) return 'none';
  if (a === b) return 'match';

  const aTok = tokens(a);
  const bTok = tokens(b);
  const aSet = new Set(aTok);
  const bSet = new Set(bTok);
  const overlap = [...aSet].filter((t) => bSet.has(t)).length;
  const union = new Set([...aSet, ...bSet]).size;
  const jaccard = union === 0 ? 0 : overlap / union;

  // A house/unit number present on both sides that doesn't match at all is
  // treated as a hard "different place", even if the rest of the text
  // overlaps heavily (e.g. two different flats on the same street) - this
  // guard runs before the "confident match" check below so a strong text
  // overlap can never paper over a real number conflict.
  const aNums = numberTokens(a);
  const bNums = numberTokens(b);
  if (aNums.length > 0 && bNums.length > 0 && !aNums.some((n) => bNums.includes(n))) {
    return 'none';
  }

  // Confident match: near-total word overlap (allows one side to carry a
  // trailing city/state/zip the other omits, or a short vs. long form of
  // the same address). Requires the shorter side to carry at least a
  // handful of words - otherwise a bare fragment like "Springfield, IL"
  // would score a perfect "containment" match against any full address in
  // that city, which is exactly the kind of weak/ambiguous case that must
  // never be assumed a match.
  const shorter = Math.min(aSet.size, bSet.size);
  const containment = shorter === 0 ? 0 : overlap / shorter;
  const specificEnough = shorter >= 3;
  if (specificEnough && (jaccard >= 0.8 || containment >= 0.9)) return 'match';

  // Some real overlap (shared street name, shared city, etc.) but not
  // enough to be confident it's the same unit - flag for manual review
  // rather than silently assuming either way.
  if (overlap > 0) return 'review';

  return 'none';
}
