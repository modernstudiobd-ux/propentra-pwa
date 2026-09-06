// Shared helpers for the "Import from File" flow embedded directly in
// BulkAddModal (used by every per-entity Bulk Add screen: Residents,
// Owners, Buildings, Flats, Expenses, Maintenance, Reminders, Parking).
// This is deliberately separate from the full multi-entity engine.ts /
// ImportWizard pipeline (which resolves cross-entity references and
// commits transactionally) - a quick Bulk Add import only ever fills in
// one entity's flat field list, so it just needs cell-level coercion
// before handing rows to the modal's existing review grid and onCommit.

export type QuickImportFieldType = 'text' | 'number' | 'select' | 'date' | 'checkbox';

export interface QuickImportField {
  key: string;
  type: QuickImportFieldType;
  options?: readonly (string | { value: string; label: string })[];
}

const norm = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]/g, '');

const BOOL_TRUE_RE = /^(true|yes|y|1)$/i;

/** Best-effort match of free-text cell content to one of a select field's option values. Tries an exact match first, then the trailing segment of a "Building · Unit"-style label (so a plain unit number cell matches the right flat), then loose containment. Returns '' when nothing is confident enough - callers should surface that as "needs review" rather than guessing. */
function matchSelectOption(raw: string, options: readonly (string | { value: string; label: string })[]): string {
  const target = norm(raw);
  if (!target) return '';

  for (const o of options) {
    const value = typeof o === 'string' ? o : o.value;
    const label = typeof o === 'string' ? o : o.label;
    if (norm(value) === target || norm(label) === target) return value;
  }
  for (const o of options) {
    const label = typeof o === 'string' ? o : o.label;
    const segments = label.split('·').map(norm).filter(Boolean);
    if (segments.includes(target)) return typeof o === 'string' ? o : o.value;
  }
  if (target.length > 2) {
    for (const o of options) {
      const label = typeof o === 'string' ? o : o.label;
      const normLabel = norm(label);
      if (normLabel && (normLabel.includes(target) || target.includes(normLabel))) return typeof o === 'string' ? o : o.value;
    }
  }
  return '';
}

/** Converts one raw spreadsheet cell into the shape a BulkAddModal row field expects, based on that field's type. Unresolvable/blank cells become '' (or false for checkboxes) rather than a guess, so the existing required-field check and review grid catch anything that needs a human look. */
export function coerceImportCell(field: QuickImportField, raw: any): any {
  if (raw === undefined || raw === null) return field.type === 'checkbox' ? false : '';
  if (field.type !== 'date' && typeof raw === 'string' && raw.trim() === '') return field.type === 'checkbox' ? false : '';

  switch (field.type) {
    case 'number': {
      if (typeof raw === 'number') return Number.isFinite(raw) ? raw : '';
      const cleaned = String(raw).trim().replace(/[,$%\s]/g, '');
      if (cleaned === '' || isNaN(Number(cleaned))) return '';
      return Number(cleaned);
    }
    case 'checkbox': {
      if (typeof raw === 'boolean') return raw;
      return BOOL_TRUE_RE.test(String(raw).trim());
    }
    case 'date': {
      if (raw instanceof Date) return isNaN(raw.getTime()) ? '' : raw.toISOString().slice(0, 10);
      const str = String(raw).trim();
      if (!str) return '';
      if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(str)) {
        const [y, m, d] = str.split('-').map((n) => n.padStart(2, '0'));
        return `${y}-${m}-${d}`;
      }
      const parsed = new Date(str);
      return isNaN(parsed.getTime()) ? '' : parsed.toISOString().slice(0, 10);
    }
    case 'select': {
      const str = typeof raw === 'string' ? raw.trim() : String(raw).trim();
      return matchSelectOption(str, field.options ?? []);
    }
    default:
      return typeof raw === 'string' ? raw.trim() : String(raw).trim();
  }
}
