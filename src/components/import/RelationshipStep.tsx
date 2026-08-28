import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, ArrowLeft, Link2, PlusCircle } from 'lucide-react';
import type { RefResolution } from '@/lib/import/engine';

type Choice = { raw: string; choice: 'existing' | 'create' | 'unresolved'; matchedId?: number };

export default function RelationshipStep({
  fieldLabel, distinct, getExistingOptions, allowCreate = true, onBack, onNext, onAutoResolved,
}: {
  fieldLabel: string; // "Building", "Unit", or "Resident"
  distinct: Map<string, RefResolution>; // key -> initial resolution (matched/unmatched)
  getExistingOptions: (key: string) => { id: number; label: string }[]; // options for one distinct entry (e.g. flats scoped to that entry's building)
  allowCreate?: boolean; // false for resident references - a resident needs too much required info to auto-create from a child-table import
  onBack: () => void;
  onNext: (resolutions: Map<string, RefResolution>) => void;
  /** Called instead of rendering, when every distinct value already matches an existing record with no ambiguity - nothing here needs a human decision. */
  onAutoResolved?: (count: number, fieldLabel: string) => void;
}) {
  const [choices, setChoices] = useState<Record<string, Choice>>({});

  useEffect(() => {
    const initial: Record<string, Choice> = {};
    for (const [key, res] of distinct) {
      initial[key] = res.status === 'matched'
        ? { raw: res.raw, choice: 'existing', matchedId: res.matchedId }
        : { raw: res.raw, choice: allowCreate ? 'create' : 'unresolved' };
    }
    setChoices(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [distinct, allowCreate]);

  // If the sheet only ever references buildings/units/residents that already
  // exist and match unambiguously (already true whenever this same sheet's
  // relationships were resolved on an earlier sheet in this session), there
  // is nothing for a person to decide - skip straight through instead of
  // asking them to re-confirm data they've already confirmed.
  useEffect(() => {
    if (distinct.size === 0) return; // handled by the empty-state below
    const allCleanlyMatched = Array.from(distinct.values()).every((r) => r.status === 'matched');
    if (allCleanlyMatched) onAutoResolved?.(distinct.size, fieldLabel);
    if (allCleanlyMatched) onNext(new Map(distinct));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [distinct]);

  const entries = useMemo(() => Array.from(distinct.entries()), [distinct]);
  const unresolvedCount = entries.filter(([key]) => choices[key]?.choice === 'unresolved').length;

  function setChoice(key: string, choice: Choice) {
    setChoices((prev) => ({ ...prev, [key]: choice }));
  }

  function proceed() {
    const resolved = new Map<string, RefResolution>();
    for (const [key, c] of Object.entries(choices)) {
      if (c.choice === 'existing' && c.matchedId) resolved.set(key, { raw: c.raw, status: 'matched', matchedId: c.matchedId });
      else if (c.choice === 'create') resolved.set(key, { raw: c.raw, status: 'create' });
      else resolved.set(key, { raw: c.raw, status: 'unmatched' });
    }
    onNext(resolved);
  }

  if (entries.length === 0) {
    // Nothing to resolve - auto-advance transparently.
    onNext(new Map());
    return null;
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="font-semibold text-gray-800 flex items-center gap-2"><Link2 size={18} /> Match {fieldLabel} References</h3>
        <p className="text-sm text-gray-500">
          Your file references {entries.length} distinct {fieldLabel.toLowerCase()} value{entries.length > 1 ? 's' : ''}.
          {allowCreate
            ? ' Match each to an existing record, or create a new one automatically during import.'
            : ` Match each to an existing ${fieldLabel.toLowerCase()} — rows that can't be matched will be skipped with an error.`}
        </p>
      </div>

      <div className="card divide-y divide-gray-100 overflow-hidden">
        {entries.map(([key, res]) => {
          const c = choices[key] ?? { raw: res.raw, choice: res.status === 'matched' ? 'existing' : (allowCreate ? 'create' : 'unresolved'), matchedId: res.matchedId };
          const options = getExistingOptions(key);
          return (
            <div key={key} className="flex flex-col sm:flex-row sm:items-center gap-2 px-4 py-3">
              <div className="sm:w-56 shrink-0 text-sm font-medium text-gray-800 truncate" title={res.raw}>"{res.raw}"</div>
              <select
                className="input sm:flex-1"
                value={c.choice === 'existing' && c.matchedId ? String(c.matchedId) : c.choice}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === 'create') setChoice(key, { raw: res.raw, choice: 'create' });
                  else if (v === 'unresolved') setChoice(key, { raw: res.raw, choice: 'unresolved' });
                  else setChoice(key, { raw: res.raw, choice: 'existing', matchedId: Number(v) });
                }}
              >
                {!allowCreate && <option value="unresolved">— Leave unmatched (row will error) —</option>}
                {allowCreate && <option value="create">+ Create new {fieldLabel.toLowerCase()} "{res.raw}"</option>}
                {options.map((o) => (
                  <option key={o.id} value={o.id}>{o.label}</option>
                ))}
              </select>
              {c.choice === 'create' && (
                <span className="flex items-center gap-1 text-xs text-brand-600 sm:w-20 shrink-0"><PlusCircle size={12} /> New</span>
              )}
            </div>
          );
        })}
      </div>

      {unresolvedCount > 0 && (
        <div className="text-xs text-amber-600">{unresolvedCount} value{unresolvedCount > 1 ? 's are' : ' is'} still unmatched — matching rows will be skipped with an error unless you pick a record above.</div>
      )}

      <div className="flex gap-2 pt-1">
        <button className="btn-secondary flex items-center gap-1.5" onClick={onBack}><ArrowLeft size={16} /> Back</button>
        <button className="btn-primary flex items-center gap-1.5 ml-auto" onClick={proceed}>
          Continue <ArrowRight size={16} />
        </button>
      </div>
    </div>
  );
}

