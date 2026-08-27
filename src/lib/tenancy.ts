import { db } from '@/lib/db';
import type { Tenancy } from '@/types';

function todayISO() { return new Date().toISOString().slice(0, 10); }
function daysUntil(iso: string) {
  return Math.ceil((new Date(iso).getTime() - new Date().setHours(0, 0, 0, 0)) / 86400000);
}

/** The tenancy currently in force for a flat (occupancyStatus 'active'), if any - used to auto-fill rent on new bills/payments and to drive the Rent Roll report. */
export async function getActiveTenancyForFlat(flatId: number): Promise<Tenancy | undefined> {
  const tenancies = await db.tenancies.where('flatId').equals(flatId).toArray();
  return tenancies.find((t) => t.occupancyStatus === 'active');
}

export async function getActiveTenancyForResident(residentId: number): Promise<Tenancy | undefined> {
  const tenancies = await db.tenancies.where('residentId').equals(residentId).toArray();
  return tenancies.find((t) => t.occupancyStatus === 'active');
}

/**
 * Suggests a starting rent amount for a new Tenancy: the flat's active
 * tenancy rent if one already exists (renewal), otherwise the flat's
 * standardRent, otherwise 0. Never overwrites a value the person already
 * typed - purely a form default.
 */
export async function suggestRentForFlat(flatId: number): Promise<number> {
  const active = await getActiveTenancyForFlat(flatId);
  if (active) return active.monthlyRent;
  const flat = await db.flats.get(flatId);
  return flat?.standardRent ?? 0;
}

/** Tenancies whose lease ends within `withinDays` (default 60) and haven't already ended - feeds the Dashboard alert and the Lease Expiration report. */
export async function getExpiringTenancies(withinDays = 60, buildingId?: number): Promise<Tenancy[]> {
  const all = buildingId ? await db.tenancies.where('buildingId').equals(buildingId).toArray() : await db.tenancies.toArray();
  return all.filter((t) => t.occupancyStatus === 'active' && t.leaseEnd && daysUntil(t.leaseEnd) <= withinDays);
}

/** Marks any tenancy whose leaseEnd has already passed as 'ended', so occupancy/rent-roll reports stay accurate without requiring the person to manually close out every expired lease. Safe to call often (e.g. on app load) - it's a no-op once everything is already up to date. */
export async function closeExpiredTenancies(): Promise<number> {
  const today = todayISO();
  let closed = 0;
  await db.tenancies
    .where('occupancyStatus').equals('active')
    .filter((t) => !!t.leaseEnd && t.leaseEnd < today)
    .modify((t) => { t.occupancyStatus = 'ended'; closed++; });
  return closed;
}
