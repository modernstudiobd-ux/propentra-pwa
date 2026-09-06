import { useEffect, useRef, useState } from 'react';
import { FileSpreadsheet, ArrowLeft } from 'lucide-react';
import Modal from '@/components/Modal';
import ConfirmDialog from '@/components/ConfirmDialog';
import { parseImportFile, type ParsedWorkbook } from '@/lib/import/parseFile';
import { autoMapColumns, type MappableField } from '@/lib/import/detect';
import { coerceImportCell } from '@/lib/import/quickImport';
import { FLATS_DEF, fieldAliases, normalizeHeader } from '@/lib/import/schemas';

interface FlatLite { id?: number; buildingId: number; unitNo: string }
interface BuildingLite { id?: number; name: string }

interface MatchedRow {
  buildingText: string;
  unitNoText: string;
  included: boolean;
  flat: FlatLite | null;
  ambiguous: boolean;
}

// Storage isn't its own entity - it's just the `storageIncluded` flag on a
// Flat - so this reuses FLATS_DEF's already-curated header aliases for
// "Building Name" and "Storage Included" instead of a Bulk *Add* flow.
const MAP_FIELDS: (MappableField & { required?: boolean })[] = [
  { key: 'buildingText', label: 'Building (optional)', aliases: fieldAliases(FLATS_DEF, 'buildingRef') },
  { key: 'unitNoText', label: 'Unit No.', required: true, aliases: fieldAliases(FLATS_DEF, 'unitNo') },
  { key: 'included', label: 'Storage Included', required: true, aliases: fieldAliases(FLATS_DEF, 'storageIncluded') },
];

/** Best-effort flat lookup by unit number, disambiguated by building name when the sheet provides one and several flats across buildings share that unit number. */
function resolveFlat(flats: FlatLite[], buildings: BuildingLite[], buildingText: string, unitNoText: string): { flat: FlatLite | null; ambiguous: boolean } {
  const unitNorm = normalizeHeader(unitNoText);
  if (!unitNorm) return { flat: null, ambiguous: false };
  let candidates = flats.filter((f) => normalizeHeader(f.unitNo) === unitNorm);
  if (buildingText.trim()) {
    const bNorm = normalizeHeader(buildingText);
    const buildingMatch = buildings.find((b) => {
      const n = normalizeHeader(b.name);
      return n === bNorm || (bNorm.length > 2 && (n.includes(bNorm) || bNorm.includes(n)));
    });
    if (buildingMatch) candidates = candidates.filter((f) => f.buildingId === buildingMatch.id);
  }
  if (candidates.length === 1) return { flat: candidates[0], ambiguous: false };
  if (candidates.length > 1) return { flat: null, ambiguous: true };
  return { flat: null, ambiguous: false };
}

export default function BulkStorageImportModal({
  open, onClose, flats, buildings, onCommit,
}: {
  open: boolean;
  onClose: () => void;
  flats: FlatLite[];
  buildings: BuildingLite[];
  onCommit: (updates: { id: number; storageIncluded: boolean }[]) => Promise<void>;
}) {
  const [stage, setStage] = useState<'idle' | 'sheet' | 'map' | 'review'>('idle');
  const [workbook, setWorkbook] = useState<ParsedWorkbook | null>(null);
  const [sheetIdx, setSheetIdx] = useState(0);
  const [mapping, setMapping] = useState<Record<string, number>>({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState<MatchedRow[] | null>(null);
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (open) reset(); }, [open]);

  function reset() {
    setStage('idle'); setWorkbook(null); setSheetIdx(0); setMapping({}); setError(''); setBusy(false); setConfirming(null);
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError('');
    setBusy(true);
    try {
      const wb = await parseImportFile(file);
      const usable = wb.sheets.filter((s) => s.rows.length > 0);
      if (usable.length === 0) throw new Error('No data rows found in that file.');
      setWorkbook(wb);
      if (wb.sheets.length > 1) {
        setSheetIdx(wb.sheets.findIndex((s) => s.rows.length > 0));
        setStage('sheet');
      } else {
        startMapping(wb, 0);
      }
    } catch (err: any) {
      setError(err?.message || 'Could not read that file. Try a .xlsx, .xls, or .csv file.');
    } finally {
      setBusy(false);
    }
  }

  function startMapping(wb: ParsedWorkbook, idx: number) {
    const sheet = wb.sheets[idx];
    setMapping(autoMapColumns(sheet.headers, MAP_FIELDS));
    setSheetIdx(idx);
    setStage('map');
  }

  const activeSheet = workbook ? workbook.sheets[sheetIdx] : null;

  const matchedRows: MatchedRow[] = (() => {
    if (!activeSheet) return [];
    const uIdx = mapping['unitNoText'];
    const iIdx = mapping['included'];
    if (uIdx === undefined || uIdx < 0 || iIdx === undefined || iIdx < 0) return [];
    const bIdx = mapping['buildingText'];
    const out: MatchedRow[] = [];
    for (const row of activeSheet.rows) {
      const unitNoText = String(row[uIdx] ?? '').trim();
      if (!unitNoText) continue;
      const buildingText = bIdx !== undefined && bIdx >= 0 ? String(row[bIdx] ?? '').trim() : '';
      const included = !!coerceImportCell({ key: 'included', type: 'checkbox' }, row[iIdx]);
      const { flat, ambiguous } = resolveFlat(flats, buildings, buildingText, unitNoText);
      out.push({ buildingText, unitNoText, included, flat, ambiguous });
    }
    return out;
  })();

  function goReview() {
    if (matchedRows.length === 0) { setError('Match the Unit No. and Storage Included columns, then try again.'); return; }
    setError('');
    setStage('review');
  }

  const matchedCount = matchedRows.filter((r) => r.flat).length;

  async function doCommit() {
    if (!confirming) return;
    setSaving(true);
    try {
      await onCommit(confirming.filter((r) => r.flat).map((r) => ({ id: r.flat!.id!, storageIncluded: r.included })));
      setConfirming(null);
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Modal open={open && !confirming} onClose={onClose} title="Bulk Import Storage Flags" size="lg">
        {stage === 'idle' && (
          <div className="space-y-3">
            <p className="text-sm text-gray-600">
              Upload a spreadsheet with a Unit No. column and a Storage Included (Yes/No) column.
              Matching flats will have their storage flag updated; a Building column helps disambiguate if the same unit number is used across buildings.
            </p>
            {error && <div className="text-xs text-red-500 bg-red-50 rounded-lg px-3 py-2">{error}</div>}
            <button onClick={() => fileInputRef.current?.click()} disabled={busy} className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-50">
              <FileSpreadsheet size={16} /> {busy ? 'Reading file…' : 'Choose File (Excel/CSV)'}
            </button>
            <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv,.tsv" className="hidden" onChange={handleFile} />
            <button onClick={onClose} className="btn-secondary w-full">Cancel</button>
          </div>
        )}

        {stage === 'sheet' && workbook && (
          <div className="space-y-3">
            <p className="text-sm text-gray-600">"{workbook.fileName}" has multiple sheets. Choose the one with your storage data.</p>
            <div className="space-y-1.5 max-h-72 overflow-y-auto">
              {workbook.sheets.map((s, i) => (
                <label key={s.name} className={`flex items-center justify-between px-3 py-2 rounded-lg border cursor-pointer transition-colors ${sheetIdx === i ? 'border-brand-500 bg-brand-50/50' : 'border-gray-200 hover:bg-gray-50'} ${s.rows.length === 0 ? 'opacity-50' : ''}`}>
                  <span className="flex items-center gap-2 text-sm text-gray-700">
                    <input type="radio" name="storage-import-sheet" checked={sheetIdx === i} disabled={s.rows.length === 0} onChange={() => setSheetIdx(i)} />
                    {s.name}
                  </span>
                  <span className="text-xs text-gray-400 shrink-0">{s.rows.length} row{s.rows.length === 1 ? '' : 's'}</span>
                </label>
              ))}
            </div>
            <div className="flex gap-2 pt-2 border-t border-gray-100">
              <button onClick={() => startMapping(workbook, sheetIdx)} disabled={activeSheet?.rows.length === 0} className="btn-primary flex-1">Continue</button>
              <button onClick={reset} className="btn-secondary flex-1">Cancel</button>
            </div>
          </div>
        )}

        {stage === 'map' && workbook && activeSheet && (
          <div className="space-y-3">
            <p className="text-xs text-gray-400">Match each field to a column from "{activeSheet.name}". {activeSheet.rows.length} row{activeSheet.rows.length === 1 ? '' : 's'} detected.</p>
            {error && <div className="text-xs text-red-500 bg-red-50 rounded-lg px-3 py-2">{error}</div>}
            <div className="space-y-2">
              {MAP_FIELDS.map((f) => (
                <div key={f.key} className="flex items-center gap-2">
                  <div className="w-40 shrink-0 text-xs font-medium text-gray-600 truncate" title={f.label}>{f.label}{f.required ? ' *' : ''}</div>
                  <select className="input !py-1.5 !text-sm flex-1" value={mapping[f.key] ?? -1} onChange={(e) => setMapping((m) => ({ ...m, [f.key]: Number(e.target.value) }))}>
                    <option value={-1}>— Don&apos;t import —</option>
                    {activeSheet.headers.map((h, i) => <option key={i} value={i}>{h}</option>)}
                  </select>
                </div>
              ))}
            </div>
            <div className="flex gap-2 pt-2 border-t border-gray-100">
              <button onClick={goReview} className="btn-primary flex-1">Preview Matches</button>
              <button
                onClick={() => (workbook.sheets.length > 1 ? setStage('sheet') : reset())}
                className="btn-secondary flex items-center justify-center gap-1 px-3"
                title="Back"
              >
                <ArrowLeft size={14} />
              </button>
            </div>
          </div>
        )}

        {stage === 'review' && (
          <div className="space-y-3">
            <p className="text-xs text-gray-400">{matchedCount} of {matchedRows.length} row{matchedRows.length === 1 ? '' : 's'} matched an existing flat. Unmatched rows are skipped.</p>
            {error && <div className="text-xs text-red-500 bg-red-50 rounded-lg px-3 py-2">{error}</div>}
            <div className="max-h-72 overflow-y-auto border border-gray-100 rounded-lg divide-y divide-gray-100">
              {matchedRows.map((r, i) => (
                <div key={i} className={`flex items-center justify-between gap-2 px-3 py-2 text-sm ${!r.flat ? 'bg-red-50/40' : ''}`}>
                  <div className="min-w-0">
                    <span className="font-medium text-gray-700">{r.unitNoText}</span>
                    {r.buildingText && <span className="text-gray-400 ml-1">({r.buildingText})</span>}
                    {!r.flat && <div className="text-[11px] text-red-500">{r.ambiguous ? 'Same unit no. in multiple buildings - add a Building column' : 'No matching flat found'}</div>}
                  </div>
                  <span className={`shrink-0 ${r.included ? 'badge-paid' : 'badge-unpaid'}`}>{r.included ? 'Included' : 'Not included'}</span>
                </div>
              ))}
            </div>
            <div className="flex gap-2 pt-2 border-t border-gray-100">
              <button onClick={() => setConfirming(matchedRows)} disabled={matchedCount === 0} className="btn-primary flex-1">Update {matchedCount} Flat{matchedCount === 1 ? '' : 's'}</button>
              <button onClick={() => setStage('map')} className="btn-secondary flex items-center justify-center gap-1 px-3" title="Back"><ArrowLeft size={14} /></button>
            </div>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={!!confirming}
        title={`Update storage flag for ${matchedCount} flat${matchedCount === 1 ? '' : 's'}?`}
        message="This will overwrite the Storage Included checkbox for each matched flat based on the file. Unmatched rows are skipped."
        confirmLabel={saving ? 'Updating...' : 'Yes, Update'}
        danger={false}
        onConfirm={doCommit}
        onCancel={() => setConfirming(null)}
      />
    </>
  );
}
