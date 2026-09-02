import { useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import Modal from '@/components/Modal';
import ConfirmDialog from '@/components/ConfirmDialog';

export interface BulkAddField<T> {
  key: keyof T & string;
  label: string;
  type: 'text' | 'number' | 'select' | 'date' | 'checkbox';
  options?: readonly (string | { value: string; label: string })[]; // for type === 'select'
  required?: boolean;
  placeholder?: string;
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
}

/**
 * Quick multi-row "spreadsheet" entry for adding several records of the
 * same entity in one go. Always ends with an explicit confirmation step
 * before anything is written to the database.
 */
export default function BulkAddModal<T extends Record<string, any>>({
  open, onClose, title, entityLabel, fields, makeEmptyRow, isRowBlank, validateRow, onCommit, startRows = 3,
}: BulkAddModalProps<T>) {
  const [rows, setRows] = useState<T[]>([]);
  const [errors, setErrors] = useState<Record<number, string>>({});
  const [confirming, setConfirming] = useState<T[] | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setRows(Array.from({ length: startRows }, () => makeEmptyRow()));
      setErrors({});
      setConfirming(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function updateRow(idx: number, patch: Partial<T>) {
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  }
  function addRow() { setRows((prev) => [...prev, makeEmptyRow()]); }
  function removeRow(idx: number) { setRows((prev) => prev.filter((_, i) => i !== idx)); }

  function reviewClick() {
    const nextErrors: Record<number, string> = {};
    const candidates: T[] = [];
    rows.forEach((row, i) => {
      if (isRowBlank(row)) return; // skip untouched rows silently
      for (const f of fields) {
        if (f.required && (row[f.key] === '' || row[f.key] === undefined || row[f.key] === null)) {
          nextErrors[i] = `${f.label} is required`;
          return;
        }
      }
      if (nextErrors[i]) return;
      const err = validateRow?.(row);
      if (err) { nextErrors[i] = err; return; }
      candidates.push(row);
    });
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;
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

  return (
    <>
      <Modal open={open && !confirming} onClose={onClose} title={title} size="xl">
        <div className="space-y-3">
          <p className="text-xs text-gray-400">Fill in as many rows as you need, then review before adding. Blank rows are ignored.</p>
          {globalError && <div className="text-xs text-red-500 bg-red-50 rounded-lg px-3 py-2">{globalError}</div>}
          <div className="overflow-x-auto -mx-1 px-1">
            <table className="w-full text-sm min-w-[600px]">
              <thead>
                <tr>
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
                    {fields.map((f) => (
                      <td key={f.key} className="pr-2 pb-2">
                        {f.type === 'select' ? (
                          <select className="input !py-1.5 !text-sm" value={row[f.key] ?? ''} onChange={(e) => updateRow(i, { [f.key]: e.target.value } as Partial<T>)}>
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
                      <button onClick={() => removeRow(i)} className="icon-btn text-red-400" title="Remove row"><Trash2 size={14} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button onClick={addRow} className="flex items-center gap-1 text-xs text-brand-600 font-medium"><Plus size={13} /> Add Row</button>
          <div className="flex gap-2 pt-2 border-t border-gray-100">
            <button onClick={reviewClick} className="btn-primary flex-1">Review &amp; Add</button>
            <button onClick={onClose} className="btn-secondary flex-1">Cancel</button>
          </div>
        </div>
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
