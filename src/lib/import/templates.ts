import { db } from '@/lib/db';
import type { ImportEntityKey } from './schemas';

/**
 * Mapping is stored as field-key -> header LABEL text (not column index),
 * so a saved template still applies correctly if a future file has its
 * columns in a different order. Re-applying looks up each header's current
 * position at apply time (see applyTemplateToHeaders in MappingStep).
 */
export async function saveImportTemplate(name: string, entity: ImportEntityKey, mapping: Record<string, string>) {
  return db.importTemplates.add({ name: name.trim(), entity, mapping, createdAt: new Date().toISOString() });
}

export async function listImportTemplates(entity: ImportEntityKey) {
  return db.importTemplates.where('entity').equals(entity).toArray();
}

export async function deleteImportTemplate(id: number) {
  return db.importTemplates.delete(id);
}
