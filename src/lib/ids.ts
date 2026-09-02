import { liveQuery } from 'dexie';
import { db } from '@/lib/db';
import { ID_PREFIXES, formatDisplayId, trailingNumber, setIdFormatOverrides, type SequencedEntity } from '@/lib/idPrefixes';

export type { SequencedEntity };
export { ID_PREFIXES };

let idFormatWatchStarted = false;

/** Call once at app startup to keep every entity's display-ID prefix/padding in sync with Settings -> General -> Record ID Formats. */
export function watchIdFormatSettings(): void {
  if (idFormatWatchStarted) return;
  idFormatWatchStarted = true;
  liveQuery(() => db.settings.toCollection().first()).subscribe((settings) => {
    setIdFormatOverrides(settings?.idFormats as any);
  });
}

/** Allocates and returns the next display ID for one entity (e.g. "P-00043"), atomically bumping its counter. */
export async function nextDisplayId(entity: SequencedEntity): Promise<string> {
  return db.transaction('rw', db.sequences, async () => {
    const rec = await db.sequences.get(entity);
    const next = (rec?.value ?? 0) + 1;
    await db.sequences.put({ entity, value: next });
    return formatDisplayId(entity, next);
  });
}

/** Allocates `count` consecutive display IDs in a single atomic step - used by bulk-add so every new row gets a unique, gapless ID. */
export async function nextDisplayIds(entity: SequencedEntity, count: number): Promise<string[]> {
  if (count <= 0) return [];
  return db.transaction('rw', db.sequences, async () => {
    const rec = await db.sequences.get(entity);
    const start = rec?.value ?? 0;
    await db.sequences.put({ entity, value: start + count });
    return Array.from({ length: count }, (_, i) => formatDisplayId(entity, start + i + 1));
  });
}

/**
 * Makes sure the entity's counter is always ahead of a display ID that came
 * from an external source (e.g. an imported "Person ID"/"Tenancy ID"
 * column), so IDs generated afterwards inside the app never collide with it.
 * Safe to call with an ID that doesn't end in digits - it's a no-op then.
 */
export async function reserveDisplayId(entity: SequencedEntity, displayId: string | undefined | null): Promise<void> {
  const n = trailingNumber(displayId ?? undefined);
  if (n === undefined) return;
  await db.transaction('rw', db.sequences, async () => {
    const rec = await db.sequences.get(entity);
    if ((rec?.value ?? 0) < n) await db.sequences.put({ entity, value: n });
  });
}
