import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '@/lib/db';
import {
  BACKUP_FORMAT_VERSION, TABLES, validateBackupShape, buildBackupData,
  countBackupRows, restoreFromBackupData,
} from '@/lib/backup';
import { resetDb, seedSettings, seedBuildingFlatResident } from '@/test/testUtils';

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
    expect(validateBackupShape({ version: BACKUP_FORMAT_VERSION, residents: { not: 'an array' } })).toMatch(/corrupted/i);
  });

  it('accepts a minimal, well-formed payload, including older format versions', () => {
    expect(validateBackupShape({ version: BACKUP_FORMAT_VERSION })).toBeNull();
    expect(validateBackupShape({ version: 1 })).toBeNull(); // an old backup missing newer tables entirely is fine
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

  it('logs a fresh restore_performed audit entry that survives the very clear() the restore just did', async () => {
    await seedSettings();
    const { data } = await buildBackupData();
    const asJson = JSON.parse(JSON.stringify(data));

    await restoreFromBackupData(asJson);

    const entries = await db.auditLog.where('action').equals('restore_performed').toArray();
    expect(entries).toHaveLength(1);
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
