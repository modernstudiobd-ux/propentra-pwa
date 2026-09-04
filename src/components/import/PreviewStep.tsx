import { useMemo, useState } from 'react';
import { ArrowRight, ArrowLeft, AlertCircle, AlertTriangle, CheckCircle2, Copy, UploadCloud } from 'lucide-react';
import type { ImportEntityDef } from '@/lib/import/schemas';
import type { ProcessedRow, DuplicateDecision } from '@/lib/import/engine';

const DECISION_LABEL: Record<DuplicateDecision, string> = { skip: 'Skip', update: 'Update existing', create: 'Create as new' };

export default function PreviewStep({
  def, rows, globalDecision, onGlobalDecisionChange, onRowsChange, onBack, onImport, importing,
}: {
  def: ImportEntityDef;
  rows: ProcessedRow[];
  globalDecision: DuplicateDecision;
  onGlobalDecisionChange: (d: DuplicateDecision) => void;
  onRowsChange: (rows: ProcessedRow[]) => void;
  onBack: () => void;
  onImport: () => void;
  importing: boolean;
}) {
  const [filter, setFilter] = useState<'all' | 'errors' | 'duplicates' | 'ambiguous'>('all');

  const counts = useMemo(() => {
    const errorCount = rows.filter((r) => r.errors.length > 0).length;
    const duplicateCount = rows.filter((r) => r.duplicate).length;
    const ambiguousCount = rows.filter((r) => r.ambiguousMatch).length;
    const willImport = rows.filter((r) => r.included && r.errors.length === 0 && !r.ambiguousMatch && !(r.duplicate && r.decision === 'skip')).length;
    return { errorCount, duplicateCount, ambiguousCount, willImport, total: rows.length };
  }, [rows]);

  const visibleRows = useMemo(() => {
    if (filter === 'errors') return rows.filter((r) => r.errors.length > 0);
    if (filter === 'duplicates') return rows.filter((r) => r.duplicate);
    if (filter === 'ambiguous') return rows.filter((r) => r.ambiguousMatch);
    return rows;
  }, [rows, filter]);

  function updateRow(rowIndex: number, patch: Partial<ProcessedRow>) {
    onRowsChange(rows.map((r) => (r.rowIndex === rowIndex ? { ...r, ...patch } : r)));
  }

  function applyGlobalDecision(d: DuplicateDecision) {
    onGlobalDecisionChange(d);
    onRowsChange(rows.map((r) => (r.duplicate ? { ...r, decision: d } : r)));
  }

  const displayFields = def.fields.slice(0, 5); // keep the preview table readable; full detail is in the error text

  return (
    <div className="space-y-4">
      <div>
        <h3 className="font-semibold text-gray-800">Preview &amp; Validate</h3>
        <p className="text-sm text-gray-500">Review what will be imported. Rows with errors are excluded automatically — fix your file and re-upload, or continue with the valid rows.</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        <button onClick={() => setFilter('all')} className={`rounded-xl px-3 py-2 text-left ${filter === 'all' ? 'bg-brand-50 ring-1 ring-brand-200' : 'bg-gray-50'}`}>
          <div className="text-xs text-gray-400">Total Rows</div>
          <div className="font-semibold text-gray-800">{counts.total}</div>
        </button>
        <button onClick={() => setFilter('all')} className="rounded-xl px-3 py-2 text-left bg-emerald-50">
          <div className="text-xs text-emerald-600">Will Import</div>
          <div className="font-semibold text-emerald-700">{counts.willImport}</div>
        </button>
        <button onClick={() => setFilter('errors')} className={`rounded-xl px-3 py-2 text-left ${filter === 'errors' ? 'ring-1 ring-red-200' : ''} bg-red-50`}>
          <div className="text-xs text-red-500">Errors</div>
          <div className="font-semibold text-red-600">{counts.errorCount}</div>
        </button>
        <button onClick={() => setFilter('duplicates')} className={`rounded-xl px-3 py-2 text-left ${filter === 'duplicates' ? 'ring-1 ring-amber-200' : ''} bg-amber-50`}>
          <div className="text-xs text-amber-600 flex items-center gap-1"><Copy size={11} /> Duplicates</div>
          <div className="font-semibold text-amber-700">{counts.duplicateCount}</div>
        </button>
        <button onClick={() => setFilter('ambiguous')} className={`rounded-xl px-3 py-2 text-left ${filter === 'ambiguous' ? 'ring-1 ring-orange-200' : ''} bg-orange-50`}>
          <div className="text-xs text-orange-600 flex items-center gap-1"><AlertTriangle size={11} /> Ambiguous</div>
          <div className="font-semibold text-orange-700">{counts.ambiguousCount}</div>
        </button>
      </div>

      {counts.ambiguousCount > 0 && (
        <div className="flex flex-wrap items-center gap-2 bg-orange-50 rounded-xl p-3">
          <AlertTriangle size={15} className="text-orange-500 shrink-0" />
          <span className="text-sm text-orange-700">{counts.ambiguousCount} row{counts.ambiguousCount > 1 ? 's' : ''} match more than one existing record on the same field (e.g. a shared phone number already on file) - they're skipped automatically rather than guessed. Fix the source data or matching field and re-import to include them.</span>
        </div>
      )}

      {counts.duplicateCount > 0 && (
        <div className="flex flex-wrap items-center gap-2 bg-amber-50 rounded-xl p-3">
          <span className="text-sm text-amber-700">{counts.duplicateCount} row{counts.duplicateCount > 1 ? 's' : ''} match existing records. Default action:</span>
          <select className="input !w-auto" value={globalDecision} onChange={(e) => applyGlobalDecision(e.target.value as DuplicateDecision)}>
            <option value="skip">Skip (keep existing data)</option>
            <option value="update">Update existing record</option>
            <option value="create">Create as a new record anyway</option>
          </select>
        </div>
      )}

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th className="table-th">Row</th>
              <th className="table-th">Status</th>
              {displayFields.map((f) => <th key={f.key} className="table-th">{f.label}</th>)}
              <th className="table-th">Action</th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row) => {
              const hasError = row.errors.length > 0;
              const isAmbiguous = !hasError && !!row.ambiguousMatch;
              return (
                <tr key={row.rowIndex} className="border-t border-gray-50">
                  <td className="table-td text-gray-400">{row.rowIndex + 1}</td>
                  <td className="table-td">
                    {hasError ? (
                      <span className="flex items-center gap-1 text-red-500 text-xs" title={row.errors.join(' ')}>
                        <AlertCircle size={13} /> Error
                      </span>
                    ) : isAmbiguous ? (
                      <span className="flex items-center gap-1 text-orange-600 text-xs" title={row.ambiguousMatch}>
                        <AlertTriangle size={13} /> Ambiguous
                      </span>
                    ) : row.duplicate ? (
                      <span className="flex items-center gap-1 text-amber-600 text-xs"><Copy size={13} /> Duplicate</span>
                    ) : (
                      <span className="flex items-center gap-1 text-emerald-600 text-xs"><CheckCircle2 size={13} /> New</span>
                    )}
                  </td>
                  {displayFields.map((f) => {
                    const v = f.refEntity ? row.refs[f.key]?.raw : row.record[f.key];
                    return <td key={f.key} className="table-td max-w-[160px] truncate" title={String(v ?? '')}>{String(v ?? '')}</td>;
                  })}
                  <td className="table-td">
                    {hasError ? (
                      <span className="text-xs text-red-400" title={row.errors.join(' ')}>{row.errors[0]}</span>
                    ) : isAmbiguous ? (
                      <span className="text-xs text-orange-500" title={row.ambiguousMatch}>Skipped - review manually</span>
                    ) : row.duplicate ? (
                      <select
                        className="input !py-1 !text-xs !w-auto"
                        value={row.decision}
                        onChange={(e) => updateRow(row.rowIndex, { decision: e.target.value as DuplicateDecision })}
                      >
                        {(Object.keys(DECISION_LABEL) as DuplicateDecision[]).map((d) => <option key={d} value={d}>{DECISION_LABEL[d]}</option>)}
                      </select>
                    ) : (
                      <label className="flex items-center gap-1.5 text-xs text-gray-500">
                        <input type="checkbox" checked={row.included} onChange={(e) => updateRow(row.rowIndex, { included: e.target.checked })} />
                        Include
                      </label>
                    )}
                  </td>
                </tr>
              );
            })}
            {visibleRows.length === 0 && (
              <tr><td colSpan={displayFields.length + 3} className="table-td text-center text-gray-400 py-8">No rows match this filter.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex gap-2 pt-1">
        <button className="btn-secondary flex items-center gap-1.5" onClick={onBack} disabled={importing}><ArrowLeft size={16} /> Back</button>
        <button className="btn-primary flex items-center gap-1.5 ml-auto disabled:opacity-60" onClick={onImport} disabled={importing || counts.willImport === 0}>
          <UploadCloud size={16} /> {importing ? 'Importing…' : `Import ${counts.willImport} Row${counts.willImport === 1 ? '' : 's'}`}
        </button>
      </div>
      {counts.willImport === 0 && counts.total > 0 && (
        <div className="text-xs text-gray-400 text-right">No rows are eligible to import — fix errors or change duplicate handling above.</div>
      )}
      <div className="text-xs text-gray-400 text-right">
        This import runs as one all-or-nothing transaction — if anything fails partway through, everything above rolls back and nothing is saved.
      </div>
    </div>
  );
}
