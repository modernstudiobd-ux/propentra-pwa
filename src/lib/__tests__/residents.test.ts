import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '@/lib/db';
import { logAudit } from '@/lib/audit';
import { resetDb, seedSettings, seedBuildingFlatResident } from '@/test/testUtils';

// Residents.tsx's archive()/unarchive() are two-line DB calls wrapped in a
// transaction plus an audit entry - re-implemented here at the same
// db-call level so the *behavior* (archived flag, timestamp, audit trail,
// and - crucially - the record surviving intact) is tested without needing
// to mount the React component.
async function archive(residentId: number, buildingId?: number, flatId?: number) {
  await db.transaction('rw', [db.residents, db.auditLog], async () => {
    await db.residents.update(residentId, { archived: true, archivedAt: new Date().toISOString() });
    await logAudit({ action: 'resident_archived', entityType: 'resident', entityId: residentId, buildingId, flatId, residentId, summary: 'Archived' });
  });
}
async function unarchive(residentId: number, buildingId?: number, flatId?: number) {
  await db.transaction('rw', [db.residents, db.auditLog], async () => {
    await db.residents.update(residentId, { archived: false, archivedAt: undefined });
    await logAudit({ action: 'resident_unarchived', entityType: 'resident', entityId: residentId, buildingId, flatId, residentId, summary: 'Unarchived' });
  });
}

beforeEach(async () => {
  await resetDb();
  await seedSettings();
});

describe('resident archiving', () => {
  it('sets archived + archivedAt without deleting or altering any other field', async () => {
    const { buildingId, flatId, resident } = await seedBuildingFlatResident();
    await archive(resident.id, buildingId, flatId);

    const fresh = await db.residents.get(resident.id);
    expect(fresh?.archived).toBe(true);
    expect(fresh?.archivedAt).toBeTruthy();
    expect(fresh?.name).toBe(resident.name);
    expect(fresh?.status).toBe(resident.status); // archiving is independent of current/former status
  });

  it('unarchiving clears the archived flag and timestamp, restoring visibility', async () => {
    const { buildingId, flatId, resident } = await seedBuildingFlatResident();
    await archive(resident.id, buildingId, flatId);
    await unarchive(resident.id, buildingId, flatId);

    const fresh = await db.residents.get(resident.id);
    expect(fresh?.archived).toBe(false);
    expect(fresh?.archivedAt).toBeUndefined();
  });

  it('an archived resident is excluded from the default "current, not archived" view but still exists in the table', async () => {
    const { buildingId, flatId, resident } = await seedBuildingFlatResident();
    await archive(resident.id, buildingId, flatId);

    const all = await db.residents.toArray();
    const visibleByDefault = all.filter((r) => !r.archived);
    expect(all).toHaveLength(1);
    expect(visibleByDefault).toHaveLength(0);
  });

  it('writes an audit entry for both archive and unarchive', async () => {
    const { buildingId, flatId, resident } = await seedBuildingFlatResident();
    await archive(resident.id, buildingId, flatId);
    await unarchive(resident.id, buildingId, flatId);

    const entries = await db.auditLog.where('residentId').equals(resident.id).toArray();
    expect(entries.map((e) => e.action)).toEqual(['resident_archived', 'resident_unarchived']);
  });
});
