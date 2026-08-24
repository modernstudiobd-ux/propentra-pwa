import { IMPORT_ENTITIES, type ImportEntityKey } from './schemas';

function csvCell(v: string): string {
  const s = v ?? '';
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

function downloadCsv(filename: string, rows: string[][]) {
  const csv = rows.map((row) => row.map(csvCell).join(',')).join('\r\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Downloads a starter CSV for an entity: header row (using the friendly field labels) plus one filled-in example row. */
export function downloadCsvTemplate(entityKey: ImportEntityKey) {
  const def = IMPORT_ENTITIES[entityKey];
  const headers = def.fields.map((f) => f.label);
  const example = def.fields.map((f) => f.example);
  downloadCsv(`propentra-${entityKey}-template.csv`, [headers, example]);
}

export interface ErrorReportRow {
  rowNumber: number; // 1-based, matches what the preview table shows
  status: string;
  message: string;
}

/** Downloads a CSV listing every row that was skipped/errored, for the person to fix and re-import. */
export function downloadErrorReport(entityKey: ImportEntityKey, rows: ErrorReportRow[]) {
  const header = ['Row', 'Status', 'Reason'];
  const body = rows.map((r) => [String(r.rowNumber), r.status, r.message]);
  downloadCsv(`propentra-${entityKey}-import-errors.csv`, [header, ...body]);
}
