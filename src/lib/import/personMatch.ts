import { normalizeMatchValue } from './engine';
import type { Resident } from '@/types';

// Mirrors RESIDENTS_DEF.matchKeyGroups in schemas.ts (Person ID first, then
// government ID number, mobile, email, and finally building+flat+name as a
// last resort) and reuses normalizeMatchValue from the full Import Wizard's
// engine.ts, so a quick Resident/Owner Bulk Import and a full multi-sheet
// Import Wizard run agree on what counts as "the same person".

export type PersonMatchedBy = 'personId' | 'idNumber' | 'mobile' | 'email' | 'buildingFlatName';

export interface PersonMatchInput {
  /** Raw "Person ID" cell from the sheet, if that column was mapped. Compared against each existing resident's displayId/externalId - an imported record's own ID ends up stored as displayId (see engine.ts's commit step), so that's checked first, with externalId as a fallback for older records. */
  personId?: string;
  idNumber?: string;
  mobile?: string;
  email?: string;
  buildingId?: number;
  flatId?: number;
  name?: string;
}

export interface PersonMatchResult {
  residentId?: number;
  matchedBy?: PersonMatchedBy;
  personIdProvided: boolean;
  /** True when a Person ID was given but didn't match any existing record. The row may still resolve via a field below - this only records that the ID itself didn't check out, so it's never silently ignored. */
  personIdInvalid: boolean;
  /** True when two or more existing records collide on the matching field - never guessed at; the row is left unmatched (will import as new) so a person can resolve it manually instead of an auto-merge picking the wrong record. */
  ambiguous?: boolean;
}

function has(v: string | undefined | null): v is string {
  return !!v && v.trim().length > 0;
}

function findUnique(existing: Resident[], predicate: (r: Resident) => boolean): { hit?: Resident; ambiguous?: boolean } {
  const matches = existing.filter(predicate);
  if (matches.length === 1) return { hit: matches[0] };
  if (matches.length > 1) return { ambiguous: true };
  return {};
}

export function matchPerson(input: PersonMatchInput, existing: Resident[]): PersonMatchResult {
  const personId = (input.personId ?? '').trim();
  const personIdProvided = has(personId);

  if (personIdProvided) {
    const target = normalizeMatchValue('externalId', personId);
    const { hit, ambiguous } = findUnique(existing, (r) =>
      (has(r.displayId) && normalizeMatchValue('externalId', r.displayId!) === target) ||
      (has(r.externalId) && normalizeMatchValue('externalId', r.externalId!) === target)
    );
    if (ambiguous) return { personIdProvided, personIdInvalid: false, ambiguous: true };
    if (hit?.id !== undefined) return { residentId: hit.id, matchedBy: 'personId', personIdProvided, personIdInvalid: false };
  }

  const idNumber = (input.idNumber ?? '').trim();
  if (has(idNumber)) {
    const target = normalizeMatchValue('idNumber', idNumber);
    const { hit, ambiguous } = findUnique(existing, (r) => has(r.idNumber) && normalizeMatchValue('idNumber', r.idNumber!) === target);
    if (ambiguous) return { personIdProvided, personIdInvalid: personIdProvided, ambiguous: true };
    if (hit?.id !== undefined) return { residentId: hit.id, matchedBy: 'idNumber', personIdProvided, personIdInvalid: personIdProvided };
  }

  const mobile = (input.mobile ?? '').trim();
  if (has(mobile)) {
    const target = normalizeMatchValue('mobile', mobile);
    const { hit, ambiguous } = findUnique(existing, (r) => has(r.mobile) && normalizeMatchValue('mobile', r.mobile) === target);
    if (ambiguous) return { personIdProvided, personIdInvalid: personIdProvided, ambiguous: true };
    if (hit?.id !== undefined) return { residentId: hit.id, matchedBy: 'mobile', personIdProvided, personIdInvalid: personIdProvided };
  }

  const email = (input.email ?? '').trim();
  if (has(email)) {
    const target = normalizeMatchValue('email', email);
    const { hit, ambiguous } = findUnique(existing, (r) => has(r.email) && normalizeMatchValue('email', r.email) === target);
    if (ambiguous) return { personIdProvided, personIdInvalid: personIdProvided, ambiguous: true };
    if (hit?.id !== undefined) return { residentId: hit.id, matchedBy: 'email', personIdProvided, personIdInvalid: personIdProvided };
  }

  if (input.buildingId !== undefined && input.flatId !== undefined && has(input.name)) {
    const target = normalizeMatchValue('name', input.name!);
    const { hit, ambiguous } = findUnique(existing, (r) =>
      r.buildingId === input.buildingId && r.flatId === input.flatId && has(r.name) && normalizeMatchValue('name', r.name) === target
    );
    if (ambiguous) return { personIdProvided, personIdInvalid: personIdProvided, ambiguous: true };
    if (hit?.id !== undefined) return { residentId: hit.id, matchedBy: 'buildingFlatName', personIdProvided, personIdInvalid: personIdProvided };
  }

  return { personIdProvided, personIdInvalid: personIdProvided };
}
