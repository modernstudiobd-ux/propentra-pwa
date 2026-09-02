// Human-readable record IDs, in the same style as an industry-standard
// property management export (e.g. "BLDG-0001", "P-00001", "TEN-00001").
// Kept in its own module (no dependency on db.ts) so both db.ts - which
// needs it during the v8 migration/backfill - and lib/ids.ts - which needs
// it at runtime to hand out new IDs - can import it without a circular
// dependency between the two.

export const ID_PREFIXES = {
  buildings: { prefix: 'BLDG', digits: 4 },
  flats: { prefix: 'UNIT', digits: 4 },
  residents: { prefix: 'P', digits: 5 },
  tenancies: { prefix: 'TEN', digits: 5 },
  ownerships: { prefix: 'OWN', digits: 5 },
  contacts: { prefix: 'CONT', digits: 5 },
  emergencyContacts: { prefix: 'EC', digits: 5 },
  vehicles: { prefix: 'VEH', digits: 5 },
  parkingSpaces: { prefix: 'PK', digits: 5 },
  payments: { prefix: 'PAY', digits: 5 },
  depositTransactions: { prefix: 'DEP', digits: 5 },
  maintenanceRequests: { prefix: 'MAINT', digits: 5 },
  expenses: { prefix: 'EXP', digits: 5 },
  reminders: { prefix: 'REM', digits: 5 },
  documents: { prefix: 'DOC', digits: 5 },
} as const;

export type SequencedEntity = keyof typeof ID_PREFIXES;

/** Builds the zero-padded display ID for entity `n`, e.g. formatDisplayId('residents', 42) -> "P-00042". */
export function formatDisplayId(entity: SequencedEntity, n: number): string {
  const { prefix, digits } = ID_PREFIXES[entity];
  return `${prefix}-${String(Math.max(0, Math.trunc(n))).padStart(digits, '0')}`;
}

/** Extracts the trailing numeric run from a display/external ID string (e.g. "P-00042" -> 42, "TEN-00001" -> 1). */
export function trailingNumber(displayId: string | undefined | null): number | undefined {
  if (!displayId) return undefined;
  const m = String(displayId).match(/(\d+)\s*$/);
  return m ? parseInt(m[1], 10) : undefined;
}
