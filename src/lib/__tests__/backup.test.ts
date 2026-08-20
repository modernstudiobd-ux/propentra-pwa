import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '@/lib/db';
import {
  BACKUP_FORMAT_VERSION, TABLES, validateBackupShape, validateBackupRecords, buildBackupData,
  countBackupRows, describeBackupTables, restoreFromBackupData,
} from '@/lib/backup';
import { resetDb, seedSettings, seedBuildingFlatResident, seedBill } from '@/test/testUtils';

// Tables that existed from format v1 onward (everything except documents/auditLog).
const V1_TABLES = TABLES.filter((t) => t !== 'documents' && t !== 'auditLog');

function emptyPayload(version: number, tables: readonly string[] = TABLES): Record<string, any> {
  const data: Record<string, any> = { version };
  for (const t of tables) data[t] = [];
  return data;
}

beforeEach(async () => {
  await resetDb();
});

describe('validateBackupShape', () => {
  it('rejects anything that is not a plain JSON object', () => {
    expect(validateBackupShape(null)).toMatch(/not a valid/i);
    expect(validateBackupShape([1, 2, 3])).toMatch(/not a valid/i);
    expect(validateBackupShape('a string')).toMatch(/not a valid/i);
  });

  it('rejects a payload with no version number', () => {
    expect(validateBackupShape({ buildings: [] })).toMatch(/version/i);
  });

  it('rejects a backup made with a newer format than this app understands', () => {
    expect(validateBackupShape({ version: BACKUP_FORMAT_VERSION + 1 })).toMatch(/newer version/i);
  });

  it('rejects a table section that is not an array', () => {
    const payload = emptyPayload(BACKUP_FORMAT_VERSION);
    payload.residents = { not: 'an array' };
    expect(validateBackupShape(payload)).toMatch(/corrupted/i);
  });

  it('accepts a complete, well-formed payload for the current version', () => {
    expect(validateBackupShape(emptyPayload(BACKUP_FORMAT_VERSION))).toBeNull();
  });

  it('accepts an older-format payload that legitimately omits tables added later', () => {
    // A genuine v1 backup never had "documents" or "auditLog" keys at all -
    // that's fine and must be accepted, not treated as corrupted.
    expect(validateBackupShape(emptyPayload(1, V1_TABLES))).toBeNull();
  });

  it('rejects a backup that claims a version but is missing a table that version requires (corrupted/tampered file)', () => {
    // Claims v2 (which requires "documents") but the key is entirely absent.
    const payload = emptyPayload(2, V1_TABLES);
    const err = validateBackupShape(payload);
    expect(err).toMatch(/missing its "documents" data/i);
  });

  it('rejects a v1-claiming payload that is missing one of the original tables', () => {
    const payload = emptyPayload(1, V1_TABLES.filter((t) => t !== 'residents'));
    expect(validateBackupShape(payload)).toMatch(/missing its "residents" data/i);
  });
});

describe('validateBackupRecords (deep per-record validation)', () => {
  it('accepts a well-formed record set', () => {
    const payload = emptyPayload(BACKUP_FORMAT_VERSION);
    payload.buildings = [{ id: 1, name: 'Sunset Villas', address: '1 Main St', totalFlats: 10 }];
    expect(validateBackupRecords(payload)).toBeNull();
  });

  it('rejects a record that is not an object', () => {
    const payload = emptyPayload(BACKUP_FORMAT_VERSION);
    payload.buildings = ['not an object'];
    expect(validateBackupRecords(payload)).toMatch(/buildings.*corrupted/i);
  });

  it('rejects a record with a field of the wrong type', () => {
    const payload = emptyPayload(BACKUP_FORMAT_VERSION);
    payload.bills = [{ invoiceNo: 'INV-1', buildingId: 1, flatId: 1, residentId: 1, totalAmount: 'not-a-number', paidAmount: 0, status: 'unpaid' }];
    expect(validateBackupRecords(payload)).toMatch(/"totalAmount"/);
  });

  it('rejects a record with an invalid enum value', () => {
    const payload = emptyPayload(BACKUP_FORMAT_VERSION);
    payload.residents = [{ name: 'Jane', flatId: 1, buildingId: 1, type: 'Alien', status: 'current' }];
    expect(validateBackupRecords(payload)).toMatch(/"type"/);
  });

  it('rejects a required string field left blank', () => {
    const payload = emptyPayload(BACKUP_FORMAT_VERSION);
    payload.flats = [{ buildingId: 1, unitNo: '   ', status: 'vacant' }];
    expect(validateBackupRecords(payload)).toMatch(/"unitNo"/);
  });

  it('skips validation entirely for a table that is not included in the backup', () => {
    const payload = emptyPayload(1, V1_TABLES); // no documents/auditLog keys at all
    expect(validateBackupRecords(payload)).toBeNull();
  });
});

describe('buildBackupData / restoreFromBackupData round-trip', () => {
  it('round-trips every table, including a resident ID document Blob through base64 and back', async () => {
    await seedSettings();
    const { resident } = await seedBuildingFlatResident();
    const originalBytes = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a];
    const idBlob = new Blob([new Uint8Array(originalBytes)], { type: 'image/png' });
    await db.residents.update(resident.id, { idNumber: 'X123456', idDocumentBlob: idBlob, idDocumentFileType: 'image/png' });

    const { data, counts } = await buildBackupData();
    expect(counts.residents).toBe(1);
    // Inside the exported payload the Blob must have become a base64 string - JSON.stringify would otherwise silently drop it.
    expect(typeof (data.residents as any[])[0].idDocumentBlob).toBe('string');
    const asJson = JSON.parse(JSON.stringify(data)); // simulate the actual file round-trip

    await resetDb(); // simulate restoring onto a different/wiped install
    const importedCounts = await restoreFromBackupData(asJson);
    expect(importedCounts.residents).toBe(1);

    const restored = (await db.residents.toArray())[0];
    expect(restored.idNumber).toBe('X123456');
    expect(restored.idDocumentBlob).toBeInstanceOf(Blob);
    const restoredBytes = Array.from(new Uint8Array(await (restored.idDocumentBlob as Blob).arrayBuffer()));
    expect(restoredBytes).toEqual(originalBytes);
  });

  it('countBackupRows reports zero for tables missing from an older-format backup', () => {
    const counts = countBackupRows({ version: 1, buildings: [{ id: 1 }] });
    expect(counts.buildings).toBe(1);
    expect(counts.auditLog).toBe(0); // v1 backups predate the audit log entirely
  });

  it('describeBackupTables distinguishes "genuinely empty" from "not included at all"', () => {
    const info = describeBackupTables({ version: 1, buildings: [], auditLog: undefined });
    expect(info.buildings).toEqual({ included: true, count: 0 });
    expect(info.auditLog).toEqual({ included: false, count: 0 });
  });

  it('logs a fresh restore_performed audit entry that survives the very clear() the restore just did', async () => {
    await seedSettings();
    const { data } = await buildBackupData();
    const asJson = JSON.parse(JSON.stringify(data));

    await restoreFromBackupData(asJson);

    const entries = await db.auditLog.where('action').equals('restore_performed').toArray();
    expect(entries).toHaveLength(1);
  });
});

describe('restore never silently empties a table missing from the backup', () => {
  it('leaves an existing table completely untouched when the backup omits its key entirely', async () => {
    await seedSettings();
    const { buildingId, flatId, resident } = await seedBuildingFlatResident();
    const bill = await seedBill({ buildingId, flatId, residentId: resident.id, totalAmount: 100 });
    expect(bill).toBeTruthy();

    const before = await db.bills.toArray();
    expect(before).toHaveLength(1);

    // An old-format v1 backup with real data for residents/buildings/flats,
    // but with "bills" (and documents/auditLog) never mentioned at all -
    // simulating a backup taken before bills existed, or a partial export.
    const payload = emptyPayload(1, V1_TABLES.filter((t) => t !== 'bills'));
    payload.buildings = await db.buildings.toArray();
    payload.flats = await db.flats.toArray();
    payload.residents = await db.residents.toArray();
    payload.settings = await db.settings.toArray();

    await restoreFromBackupData(payload);

    // "bills" was never in the payload -> must be untouched, not wiped to empty.
    const after = await db.bills.toArray();
    expect(after).toHaveLength(1);
    expect(after[0].id).toBe(bill!.id);
  });

  it('DOES clear a table that is present in the backup as an empty array (genuine "I have zero records" case)', async () => {
    await seedSettings();
    const { buildingId, flatId, resident } = await seedBuildingFlatResident();
    await seedBill({ buildingId, flatId, residentId: resident.id, totalAmount: 50 });
    expect(await db.bills.count()).toBe(1);

    const payload = emptyPayload(BACKUP_FORMAT_VERSION); // "bills": [] present explicitly
    payload.buildings = await db.buildings.toArray();
    payload.flats = await db.flats.toArray();
    payload.residents = await db.residents.toArray();
    payload.settings = await db.settings.toArray();

    await restoreFromBackupData(payload);
    expect(await db.bills.count()).toBe(0);
  });
});

describe('restore atomicity', () => {
  it('rolls back entirely if any table insert fails partway through, leaving prior data untouched', async () => {
    await seedSettings();
    const { resident } = await seedBuildingFlatResident();

    // A corrupted "residents" section (wrong shape for a required field)
    // that will fail bulkAdd partway through the transaction.
    const badData: Record<string, any> = { version: BACKUP_FORMAT_VERSION };
    for (const t of TABLES) badData[t] = [];
    badData.residents = [{ id: 'not-a-valid-numeric-key', name: 123 as any }, { id: 'not-a-valid-numeric-key', name: 456 as any }];

    await expect(restoreFromBackupData(badData)).rejects.toThrow();

    // Original data must be intact - Dexie rolled the whole transaction back.
    const residents = await db.residents.toArray();
    expect(residents).toHaveLength(1);
    expect(residents[0].id).toBe(resident.id);
  });
});
