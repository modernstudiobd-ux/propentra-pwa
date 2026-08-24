import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, ArrowLeft, Link2, PlusCircle } from 'lucide-react';
import type { RefResolution } from '@/lib/import/engine';

type Choice = { raw: string; choice: 'existing' | 'create'; matchedId?: number };

export default function RelationshipStep({
  fieldLabel, distinct, getExistingOptions, onBack, onNext,
}: {
  fieldLabel: string; // "Building" or "Unit"
  distinct: Map<string, RefResolution>; // key -> initial resolution (matched/unmatched)
  getExistingOptions: (key: string) => { id: number; label: string }[]; // options for one distinct entry (e.g. flats scoped to that entry's building)
  onBack: () => void;
  onNext: (resolutions: Map<string, RefResolution>) => void;
}) {
  const [choices, setChoices] = useState<Record<string, Choice>>({});

  useEffect(() => {
    const initial: Record<string, Choice> = {};
    for (const [key, res] of distinct) {
      initial[key] = res.status === 'matched'
        ? { raw: res.raw, choice: 'existing', matchedId: res.matchedId }
        : { raw: res.raw, choice: 'create' };
    }
    setChoices(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [distinct]);

  const entries = useMemo(() => Array.from(distinct.entries()), [distinct]);

  function setChoice(key: string, choice: Choice) {
    setChoices((prev) => ({ ...prev, [key]: choice }));
  }

  function proceed() {
    const resolved = new Map<string, RefResolution>();
    for (const [key, c] of Object.entries(choices)) {
      resolved.set(key, c.choice === 'existing' && c.matchedId
        ? { raw: c.raw, status: 'matched', matchedId: c.matchedId }
        : { raw: c.raw, status: 'create' });
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
          Your file references {entries.length} distinct {fieldLabel.toLowerCase()} value{entries.length > 1 ? 's' : ''}. Match each to an existing record, or create a new one automatically during import.
        </p>
      </div>

      <div className="card divide-y divide-gray-100 overflow-hidden">
        {entries.map(([key, res]) => {
          const c = choices[key] ?? { raw: res.raw, choice: res.status === 'matched' ? 'existing' : 'create', matchedId: res.matchedId };
          const options = getExistingOptions(key);
          return (
            <div key={key} className="flex flex-col sm:flex-row sm:items-center gap-2 px-4 py-3">
              <div className="sm:w-56 shrink-0 text-sm font-medium text-gray-800 truncate" title={res.raw}>"{res.raw}"</div>
              <select
                className="input sm:flex-1"
                value={c.choice === 'existing' && c.matchedId ? String(c.matchedId) : 'create'}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === 'create') setChoice(key, { raw: res.raw, choice: 'create' });
                  else setChoice(key, { raw: res.raw, choice: 'existing', matchedId: Number(v) });
                }}
              >
                <option value="create">+ Create new {fieldLabel.toLowerCase()} "{res.raw}"</option>
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

      <div className="flex gap-2 pt-1">
        <button className="btn-secondary flex items-center gap-1.5" onClick={onBack}><ArrowLeft size={16} /> Back</button>
        <button className="btn-primary flex items-center gap-1.5 ml-auto" onClick={proceed}>
          Continue <ArrowRight size={16} />
        </button>
      </div>
    </div>
  );
}

