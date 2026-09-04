// --- Resident/Owner role helpers ------------------------------------------
//
// A Resident DB record is really a "Person". Ownership and residency are
// independent relationships - a person can be a Resident only, an Owner
// only, or both at once. `isResident`/`isOwner` are the source of truth
// going forward; the legacy `type` field ('Tenant' | 'Owner') is kept only
// for backward compatibility and is used here purely as a fallback for any
// record that predates the two boolean fields (pre-migration data, or a
// record restored from an old backup). Never read `r.type` directly to
// decide whether someone is a resident/owner elsewhere in the app - use
// these two functions instead, so old and new records behave identically.

import { db } from '@/lib/db';
import type { Resident, Ownership } from '@/types';

type RoleFields = Pick<Resident, 'isResident' | 'type'>;
type OwnerRoleFields = Pick<Resident, 'isOwner' | 'type'>;

/** True if this person currently occupies/rents a unit (a Resident relationship). */
export function residentIsResident(r: RoleFields): boolean {
  return r.isResident ?? r.type !== 'Owner';
}

/** True if this person owns (at least) one flat (an Owner relationship). Independent of residency. */
export function residentIsOwner(r: OwnerRoleFields): boolean {
  return r.isOwner ?? r.type === 'Owner';
}

/** Short label for badges/lists: "Resident", "Owner", or "Owner + Resident". */
export function roleLabel(r: RoleFields & OwnerRoleFields): string {
  const isRes = residentIsResident(r);
  const isOwn = residentIsOwner(r);
  if (isOwn && isRes) return 'Owner + Resident';
  if (isOwn) return 'Owner';
  return 'Resident';
}

/** Every active-or-not Ownership relationship for this person, most recent purchase first. */
export async function getOwnershipsForResident(residentId: number): Promise<Ownership[]> {
  const rows = await db.ownerships.where('residentId').equals(residentId).toArray();
  return rows.sort((a, b) => (b.purchaseDate || '').localeCompare(a.purchaseDate || ''));
}
