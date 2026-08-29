import { useEffect, useMemo, useRef, useState } from 'react';
import { Search, ArrowUpRight } from 'lucide-react';
import { COLUMN_TYPE_LABEL, type DetectedColumnType } from '@/lib/import/detect';

export interface OtherSheetInfo {
  jobIndex: number;
  sheetName: string;
  entityLabel: string | null; // null = this tab isn't assigned to an entity yet (can't "go to" it)
  headers: string[];
}

/**
 * Searchable dropdown for picking the column that fills one field. Typing
 * filters this sheet's columns instantly. If nothing here matches, it also
 * searches every other tab in the same workbook - handy on a big multi-tab
 * file where you're not sure which tab a column actually lives in. A match
 * from another tab can't be selected directly (its rows don't line up with
 * this sheet), so it's shown muted with a "Go to tab" shortcut that jumps
 * straight to mapping that tab instead.
 */
export default function ColumnPicker({
  headers, columnTypes, usedCols, currentIdx, otherSheets, onSelect, onJumpToSheet,
}: {
  headers: string[];
  columnTypes: DetectedColumnType[];
  usedCols: Set<number>;
  currentIdx: number; // -1 = nothing selected
  otherSheets: OtherSheetInfo[];
  onSelect: (idx: number) => void;
  onJumpToSheet?: (jobIndex: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) { setOpen(false); setQuery(''); }
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  const q = query.trim().toLowerCase();

  const localMatches = useMemo(
    () => headers.map((h, i) => ({ h, i })).filter(({ h }) => !q || h.toLowerCase().includes(q)),
    [headers, q]
  );

  // Only worth searching other tabs once the person is actively looking for
  // something this sheet doesn't have - keeps the everyday (empty-query)
  // dropdown short and focused on this sheet.
  const otherMatches = useMemo(() => {
    if (q.length < 2) return [];
    const out: { jobIndex: number; sheetName: string; entityLabel: string | null; header: string }[] = [];
    for (const sheet of otherSheets) {
      for (const h of sheet.headers) {
        if (h.toLowerCase().includes(q)) out.push({ jobIndex: sheet.jobIndex, sheetName: sheet.sheetName, entityLabel: sheet.entityLabel, header: h });
      }
    }
    return out.slice(0, 8);
  }, [otherSheets, q]);

  const selectedLabel = currentIdx >= 0 ? headers[currentIdx] : '';

  return (
    <div className="relative sm:flex-1" ref={wrapRef}>
      <div className="relative">
        <input
          ref={inputRef}
          className="input w-full pr-7"
          placeholder="— Not in this file — (search all tabs)"
          value={open ? query : selectedLabel}
          onFocus={() => setOpen(true)}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
        />
        <Search size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-300 pointer-events-none" />
      </div>

      {open && (
        <div className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-lg max-h-72 overflow-auto py-1">
          <button
            type="button"
            className="w-full text-left px-3 py-1.5 text-sm text-gray-400 hover:bg-gray-50"
            onClick={() => { onSelect(-1); setOpen(false); setQuery(''); }}
          >
            — Not in this file —
          </button>

          {localMatches.map(({ h, i }) => {
            const disabled = usedCols.has(i) && i !== currentIdx;
            return (
              <button
                key={i}
                type="button"
                disabled={disabled}
                className={`w-full text-left px-3 py-1.5 text-sm flex items-center justify-between gap-2 ${
                  disabled ? 'text-gray-300 cursor-not-allowed' : 'text-gray-700 hover:bg-brand-50'
                } ${i === currentIdx ? 'bg-brand-50 font-medium' : ''}`}
                onClick={() => { onSelect(i); setOpen(false); setQuery(''); }}
              >
                <span className="truncate">{h}</span>
                <span className="text-[11px] text-gray-400 shrink-0">{COLUMN_TYPE_LABEL[columnTypes[i]]}{disabled ? ' · used' : ''}</span>
              </button>
            );
          })}
          {localMatches.length === 0 && (
            <div className="px-3 py-2 text-xs text-gray-400">No column in this sheet matches "{query}".</div>
          )}

          {otherMatches.length > 0 && (
            <div className="border-t border-gray-100 mt-1 pt-1">
              <div className="px-3 pb-1 text-[10px] font-medium uppercase tracking-wide text-gray-400">Found in other tabs</div>
              {otherMatches.map((m, i) => (
                <div key={i} className="w-full px-3 py-1.5 text-sm flex items-center justify-between gap-2">
                  <span className="truncate text-gray-400">{m.header} <span className="text-gray-300">· {m.sheetName}</span></span>
                  {onJumpToSheet && m.entityLabel && (
                    <button
                      type="button"
                      className="flex items-center gap-0.5 text-brand-600 text-xs font-medium shrink-0"
                      onClick={() => { onJumpToSheet(m.jobIndex); setOpen(false); setQuery(''); }}
                    >
                      Go to "{m.sheetName}" <ArrowUpRight size={12} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
