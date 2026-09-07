import { useEffect, useRef, useState } from 'react';
import { Plus, Trash2, Upload, FileSpreadsheet, ArrowLeft } from 'lucide-react';
import Modal from '@/components/Modal';
import ConfirmDialog from '@/components/ConfirmDialog';
import BulkToolbar from '@/components/BulkToolbar';
import { useBulkSelection } from '@/hooks/useBulkSelection';
import { parseImportFile, type ParsedWorkbook } from '@/lib/import/parseFile';
import { autoMapColumns } from '@/lib/import/detect';
import { coerceImportCell } from '@/lib/import/quickImport';

/** Same header/row checkbox used everywhere else in the app (Residents, Flats, Buildings, Parking list tables), just with native indeterminate support added - nothing elsewhere in the app currently needs the "some but not all" visual, but a Bulk Add grid commonly does after importing a large file and only wanting to remove a few rows. */
function SelectAllCheckbox({ checked, indeterminate, onChange, disabled }: { checked: boolean; indeterminate: boolean; onChange: () => void; disabled?: boolean }) {
  return (
    <input
      type="checkbox"
      checked={checked}
      disabled={disabled}
      onChange={onChange}
      ref={(el) => { if (el) el.indeterminate = indeterminate; }}
    />
  );
}

export interface BulkAddField<T> {
  key: keyof T & string;
  label: string;
  type: 'text' | 'number' | 'select' | 'date' | 'checkbox';
  options?: readonly (string | { value: string; label: string })[]; // for type === 'select'
  required?: boolean;
  placeholder?: string;
  /** Extra header-name guesses used to auto-map an imported file's columns to this field (e.g. "rent" for a Standard Rent field). Matching also always tries the key/label themselves, so this is optional polish, not a requirement. */
  aliases?: string[];
}

interface BulkAddModalProps<T> {
  open: boolean;
  onClose: () => void;
  title: string;
  /** Singular, lowercase noun used in helper/confirmation text, e.g. "flat", "resident". */
  entityLabel: string;
  fields: BulkAddField<T>[];
  makeEmptyRow: () => T;
  /** Returns an error message for this row, or null if it's valid. Blank/untouched rows are silently skipped, not validated. */
  isRowBlank: (row: T) => boolean;
  validateRow?: (row: T) => string | null;
  onCommit: (rows: T[]) => Promise<void>;
  startRows?: number;
  /** Optional, opt-in per-row status badge shown next to the delete button (e.g. Residents/Owners Bulk Import surfacing "Linked to existing #P-00005" or "New" once a row has enough info to check for a match). Return null to show nothing for that row. Purely informational - doesn't gate anything in this generic modal. */
  rowNote?: (row: T) => { text: string; tone: 'neutral' | 'warn' | 'good' } | null;
}

/**
 * Quick multi-row "spreadsheet" entry for adding several records of the
 * same entity in one go. Always ends with an explicit confirmation step
 * before anything is written to the database.
 */
export default function BulkAddModal<T extends Record<string, any>>({
  open, onClose, title, entityLabel, fields, makeEmptyRow, isRowBlank, validateRow, onCommit, startRows = 3, rowNote,
}: BulkAddModalProps<T>) {
  const [rows, setRows] = useState<T[]>([]);
  const [errors, setErrors] = useState<Record<number, string>>({});
  const [confirming, setConfirming] = useState<T[] | null>(null);
  const [saving, setSaving] = useState(false);

  // Row selection for bulk-removing several draft rows at once, reusing the
  // exact same hook/toolbar the app's record list pages already use for
  // bulk delete - keyed by row index here since these are unsaved draft
  // rows rather than existing records with a real id.
  const selection = useBulkSelection(rows.map((_, i) => ({ id: i })));

  // "Import from File" sub-flow, entirely contained within this modal.
  // 'closed' = normal manual grid; 'sheet' = choose which tab of a
  // multi-sheet workbook to use; 'map' = match spreadsheet columns to
  // this entity's fields before pulling the data into the grid above.
  const [importStage, setImportStage] = useState<'closed' | 'sheet' | 'map'>('closed');
  const [workbook, setWorkbook] = useState<ParsedWorkbook | null>(null);
  const [sheetIdx, setSheetIdx] = useState(0);
  const [colMapping, setColMapping] = useState<Record<string, number>>({});
  const [importBusy, setImportBusy] = useState(false);
  const [importError, setImportError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setRows(Array.from({ length: startRows }, () => makeEmptyRow()));
      setErrors({});
      setConfirming(null);
      selection.clear();
      resetImport();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function resetImport() {
    setImportStage('closed');
    setWorkbook(null);
    setSheetIdx(0);
    setColMapping({});
    setImportError('');
    setImportBusy(false);
  }

  function startMapping(wb: ParsedWorkbook, idx: number) {
    const sheet = wb.sheets[idx];
    setColMapping(autoMapColumns(sheet.headers, fields));
    setSheetIdx(idx);
    setImportStage('map');
  }

  async function handleFilePicked(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-picking the same file later
    if (!file) return;
    setImportError('');
    setImportBusy(true);
    try {
      const wb = await parseImportFile(file);
      const usable = wb.sheets.filter((s) => s.rows.length > 0);
      if (usable.length === 0) throw new Error('No data rows found in that file.');
      setWorkbook(wb);
      if (wb.sheets.length > 1) {
        setSheetIdx(wb.sheets.findIndex((s) => s.rows.length > 0));
        setImportStage('sheet');
      } else {
        startMapping(wb, 0);
      }
    } catch (err: any) {
      setImportError(err?.message || 'Could not read that file. Try a .xlsx, .xls, or .csv file.');
    } finally {
      setImportBusy(false);
    }
  }

  function finishImport() {
    if (!workbook) return;
    const sheet = workbook.sheets[sheetIdx];
    const mappedFieldCount = fields.filter((f) => (colMapping[f.key] ?? -1) >= 0).length;
    if (mappedFieldCount === 0) { setImportError('Match at least one column before importing.'); return; }

    const imported: T[] = sheet.rows.map((rawRow) => {
      const row = makeEmptyRow();
      for (const f of fields) {
        const colIdx = colMapping[f.key];
        if (colIdx === undefined || colIdx < 0) continue;
        (row as any)[f.key] = coerceImportCell(f, rawRow[colIdx]);
      }
      return row;
    }).filter((r) => !isRowBlank(r));

    if (imported.length === 0) { setImportError('No usable rows found with the current column matching.'); return; }

    const keptManualRows = rows.filter((r) => !isRowBlank(r));
    const nextRows = [...keptManualRows, ...imported];
    setRows(nextRows);
    selection.clear(); // row indices are about to mean something different
    // Surface any missing-required-field rows immediately, before the person
    // even clicks "Review & Add", since an import can bring in far more rows
    // than anyone would proofread column-by-column on their own.
    setErrors(computeErrors(nextRows));
    resetImport();
  }

  function computeErrors(rowsToCheck: T[]): Record<number, string> {
    const nextErrors: Record<number, string> = {};
    rowsToCheck.forEach((row, i) => {
      if (isRowBlank(row)) return;
      for (const f of fields) {
        if (f.required && (row[f.key] === '' || row[f.key] === undefined || row[f.key] === null)) {
          nextErrors[i] = `${f.label} is required`;
          return;
        }
      }
      if (nextErrors[i]) return;
      const err = validateRow?.(row);
      if (err) nextErrors[i] = err;
    });
    return nextErrors;
  }

  function updateRow(idx: number, patch: Partial<T>) {
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  }
  function addRow() { setRows((prev) => [...prev, makeEmptyRow()]); }
  function removeRow(idx: number) {
    setRows((prev) => prev.filter((_, i) => i !== idx));
    selection.clear(); // remaining rows shift index, so a stale selection could now point at the wrong row
  }
  function removeSelectedRows() {
    setRows((prev) => prev.filter((_, i) => !selection.isSelected(i)));
    selection.clear();
  }

  function reviewClick() {
    const nextErrors = computeErrors(rows);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;
    const candidates = rows.filter((row) => !isRowBlank(row));
    if (candidates.length === 0) { setErrors({ [-1]: `Fill in at least one ${entityLabel} before adding.` }); return; }
    setConfirming(candidates);
  }

  async function confirmCommit() {
    if (!confirming) return;
    setSaving(true);
    try {
      await onCommit(confirming);
      setConfirming(null);
      onClose();
    } finally {
      setSaving(false);
    }
  }

  const globalError = errors[-1];
  const activeSheet = workbook ? workbook.sheets[sheetIdx] : null;
  const modalTitle = importStage === 'closed' ? title : `${title} · Import from File`;

  return (
    <>
      <Modal open={open && !confirming} onClose={onClose} title={modalTitle} size="xl">
        {importStage === 'sheet' && workbook && (
          <div className="space-y-3">
            <p className="text-sm text-gray-600">"{workbook.fileName}" has multiple sheets. Choose the one with your {entityLabel} data.</p>
            <div className="space-y-1.5 max-h-72 overflow-y-auto">
              {workbook.sheets.map((s, i) => (
                <label key={s.name} className={`flex items-center justify-between px-3 py-2 rounded-lg border cursor-pointer transition-colors ${sheetIdx === i ? 'border-brand-500 bg-brand-50/50' : 'border-gray-200 hover:bg-gray-50'} ${s.rows.length === 0 ? 'opacity-50' : ''}`}>
                  <span className="flex items-center gap-2 text-sm text-gray-700">
                    <input type="radio" name="bulk-import-sheet" checked={sheetIdx === i} disabled={s.rows.length === 0} onChange={() => setSheetIdx(i)} />
                    {s.name}
                  </span>
                  <span className="text-xs text-gray-400 shrink-0">{s.rows.length} row{s.rows.length === 1 ? '' : 's'}</span>
                </label>
              ))}
            </div>
            {importError && <div className="text-xs text-red-500 bg-red-50 rounded-lg px-3 py-2">{importError}</div>}
            <div className="flex gap-2 pt-2 border-t border-gray-100">
              <button onClick={() => startMapping(workbook, sheetIdx)} disabled={activeSheet?.rows.length === 0} className="btn-primary flex-1">Continue</button>
              <button onClick={resetImport} className="btn-secondary flex-1">Cancel</button>
            </div>
          </div>
        )}

        {importStage === 'map' && workbook && activeSheet && (
          <div className="space-y-3">
            <p className="text-xs text-gray-400">
              Match each field to a column from "{activeSheet.name}". {activeSheet.rows.length} row{activeSheet.rows.length === 1 ? '' : 's'} detected.
              Fields left as "Don't import" are left blank for you to fill in.
            </p>
            {importError && <div className="text-xs text-red-500 bg-red-50 rounded-lg px-3 py-2">{importError}</div>}
            <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
              {fields.map((f) => (
                <div key={f.key} className="flex items-center gap-2">
                  <div className="w-32 sm:w-40 shrink-0 text-xs font-medium text-gray-600 truncate" title={f.label}>
                    {f.label}{f.required ? ' *' : ''}
                  </div>
                  <select
                    className="input !py-1.5 !text-sm flex-1"
                    value={colMapping[f.key] ?? -1}
                    onChange={(e) => setColMapping((m) => ({ ...m, [f.key]: Number(e.target.value) }))}
                  >
                    <option value={-1}>— Don&apos;t import —</option>
                    {activeSheet.headers.map((h, i) => <option key={i} value={i}>{h}</option>)}
                  </select>
                </div>
              ))}
            </div>
            <div className="flex gap-2 pt-2 border-t border-gray-100">
              <button onClick={finishImport} className="btn-primary flex-1 flex items-center justify-center gap-1.5">
                <Upload size={14} /> Import {activeSheet.rows.length} Row{activeSheet.rows.length === 1 ? '' : 's'}
              </button>
              <button
                onClick={() => (workbook.sheets.length > 1 ? setImportStage('sheet') : resetImport())}
                className="btn-secondary flex items-center justify-center gap-1 px-3"
                title="Back"
              >
                <ArrowLeft size={14} />
              </button>
            </div>
          </div>
        )}

        {importStage === 'closed' && (
          <div className="space-y-3">
            <p className="text-xs text-gray-400">Fill in as many rows as you need, or import them from a spreadsheet, then review before adding. Blank rows are ignored.</p>
            {globalError && <div className="text-xs text-red-500 bg-red-50 rounded-lg px-3 py-2">{globalError}</div>}
            {importError && <div className="text-xs text-red-500 bg-red-50 rounded-lg px-3 py-2">{importError}</div>}

            <BulkToolbar count={selection.count} onDelete={removeSelectedRows} onClear={selection.clear} deleteLabel="Remove Selected" />

            <div className="flex items-center gap-2 px-1">
              <label className="flex items-center gap-2 text-xs text-gray-500">
                <SelectAllCheckbox checked={selection.allSelected} indeterminate={selection.count > 0 && !selection.allSelected} onChange={selection.toggleAll} disabled={rows.length === 0} />
                Select all {rows.length} row{rows.length === 1 ? '' : 's'}
              </label>
            </div>

            <div className="overflow-x-auto -mx-1 px-1">
              <table className="w-full text-sm min-w-[600px]">
                <thead>
                  <tr>
                    <th className="w-6">
                      <SelectAllCheckbox checked={selection.allSelected} indeterminate={selection.count > 0 && !selection.allSelected} onChange={selection.toggleAll} disabled={rows.length === 0} />
                    </th>
                    {fields.map((f) => (
                      <th key={f.key} className="text-left text-xs font-medium text-gray-500 pb-2 pr-2 whitespace-nowrap">
                        {f.label}{f.required ? ' *' : ''}
                      </th>
                    ))}
                    <th className="w-8" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, i) => (
                    <tr key={i} className="align-top">
                      <td className="pb-2 pt-2">
                        <input type="checkbox" checked={selection.isSelected(i)} onChange={() => selection.toggle(i)} />
                      </td>
                      {fields.map((f) => (
                        <td key={f.key} className="pr-2 pb-2">
                          {f.type === 'select' ? (
                            <select className="input !py-1.5 !text-sm" value={row[f.key] ?? ''} onChange={(e) => updateRow(i, { [f.key]: e.target.value } as Partial<T>)}>
                              {!f.options?.some((o) => (typeof o === 'string' ? o : o.value) === (row[f.key] ?? '')) && (
                                <option value="">— Select —</option>
                              )}
                              {f.options?.map((o) => {
                                const value = typeof o === 'string' ? o : o.value;
                                const label = typeof o === 'string' ? o : o.label;
                                return <option key={value} value={value}>{label}</option>;
                              })}
                            </select>
                          ) : f.type === 'checkbox' ? (
                            <input type="checkbox" className="mt-2" checked={!!row[f.key]} onChange={(e) => updateRow(i, { [f.key]: e.target.checked } as Partial<T>)} />
                          ) : (
                            <input
                              type={f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : 'text'}
                              className="input !py-1.5 !text-sm min-w-[110px]"
                              placeholder={f.placeholder}
                              value={row[f.key] ?? ''}
                              onChange={(e) => updateRow(i, { [f.key]: f.type === 'number' ? (e.target.value === '' ? '' : Number(e.target.value)) : e.target.value } as Partial<T>)}
                            />
                          )}
                          {errors[i] && <div className="text-[10px] text-red-500 mt-0.5">{errors[i]}</div>}
                        </td>
                      ))}
                      <td className="pb-2">
                        <div className="flex flex-col items-end gap-1">
                          <button onClick={() => removeRow(i)} className="icon-btn text-red-400" title="Remove row"><Trash2 size={14} /></button>
                          {rowNote && !isRowBlank(row) && (() => {
                            const note = rowNote(row);
                            if (!note) return null;
                            const toneClass = note.tone === 'good' ? 'bg-green-50 text-green-600' : note.tone === 'warn' ? 'bg-amber-50 text-amber-600' : 'bg-gray-100 text-gray-500';
                            return <span className={`text-[10px] px-1.5 py-0.5 rounded-full whitespace-nowrap ${toneClass}`}>{note.text}</span>;
                          })()}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              <button onClick={addRow} className="flex items-center gap-1 text-xs text-brand-600 font-medium"><Plus size={13} /> Add Row</button>
              <span className="text-gray-200">|</span>
              <button onClick={() => fileInputRef.current?.click()} disabled={importBusy} className="flex items-center gap-1 text-xs text-brand-600 font-medium disabled:opacity-50">
                <FileSpreadsheet size={13} /> {importBusy ? 'Reading file…' : 'Import from File (Excel/CSV)'}
              </button>
              <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv,.tsv" className="hidden" onChange={handleFilePicked} />
            </div>
            <div className="flex gap-2 pt-2 border-t border-gray-100">
              <button onClick={reviewClick} className="btn-primary flex-1">Review &amp; Add</button>
              <button onClick={onClose} className="btn-secondary flex-1">Cancel</button>
            </div>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={!!confirming}
        title={`Add ${confirming?.length ?? 0} ${entityLabel}${(confirming?.length ?? 0) === 1 ? '' : 's'}?`}
        message={`This will create ${confirming?.length ?? 0} new ${entityLabel} record${(confirming?.length ?? 0) === 1 ? '' : 's'}. You can edit or delete them individually afterward.`}
        confirmLabel={saving ? 'Adding...' : 'Yes, Add Them'}
        danger={false}
        onConfirm={confirmCommit}
        onCancel={() => setConfirming(null)}
      />
    </>
  );
}
