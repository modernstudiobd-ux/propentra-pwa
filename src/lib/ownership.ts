import { db } from '@/lib/db';

/**
 * Ensures the total ownership percentage across all active owners of one
 * flat never exceeds 100%. Pass the id of the record being edited (if any)
 * so it excludes itself from the existing total. Returns null when valid,
 * or a human-readable error otherwise.
 */
export async function validateOwnershipPct(flatId: number, newPct: number, excludeOwnershipId?: number): Promise<string | null> {
  if (!Number.isFinite(newPct) || newPct <= 0) return 'Ownership % must be greater than 0.';
  if (newPct > 100) return 'Ownership % cannot exceed 100.';

  const existing = await db.ownerships.where('flatId').equals(flatId).toArray();
  const otherActiveTotal = existing
    .filter((o) => o.status === 'active' && o.id !== excludeOwnershipId)
    .reduce((sum, o) => sum + o.ownershipPct, 0);

  const total = otherActiveTotal + newPct;
  if (total > 100.0001) {
    return `Total ownership for this flat would be ${total.toFixed(1)}% (existing owners already hold ${otherActiveTotal.toFixed(1)}%). Reduce this owner's share, or mark another owner as former first.`;
  }
  return null;
}
