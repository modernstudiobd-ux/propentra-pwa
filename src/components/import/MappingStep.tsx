import { useEffect, useMemo, useState } from 'react';
import { Save, Trash2, Wand2, ArrowRight, ArrowLeft, PencilLine, X } from 'lucide-react';
import type { ImportEntityDef, ImportFieldDef } from '@/lib/import/schemas';
import { detectColumnType, type DetectedColumnType } from '@/lib/import/detect';
import { listImportTemplates, saveImportTemplate, deleteImportTemplate } from '@/lib/import/templates';
import type { ImportTemplate } from '@/types';

const TYPE_LABEL: Record<DetectedColumnType, string> = {
  string: 'Text', number: 'Number', date: 'Date', boolean: 'Yes/No',
};

/** A single control for entering the manual/fixed value for one field, matching its type - a Yes/No select for booleans, a dropdown for enums, a date picker for dates, etc. - so a non-technical person never has to guess the right format. */
function ManualValueInput({ field, value, onChange }: { field: ImportFieldDef; value: string; onChange: (v: string) => void }) {
  if (field.type === 'boolean') {
    return (
      <select className="input" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">— Choose —</option>
        <option value="Yes">Yes</option>
        <option value="No">No</option>
      </select>
    );
  }
  if (field.type === 'enum' && field.enumValues) {
    return (
      <select className="input" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">— Choose —</option>
        {field.enumValues.map((v) => <option key={v} value={v}>{v}</option>)}
      </select>
    );
  }
  if (field.type === 'date') {
    return <input type="date" className="input" value={value} onChange={(e) => onChange(e.target.value)} />;
  }
  if (field.type === 'number') {
    return <input type="number" className="input" placeholder={field.example} value={value} onChange={(e) => onChange(e.target.value)} />;
  }
  return <input className="input" placeholder={field.example || 'Enter a value'} value={value} onChange={(e) => onChange(e.target.value)} />;
}

export default function MappingStep({
  def, headers, rows, mapping, manualValues, onChange, onManualValuesChange, onBack, onNext,
}: {
  def: ImportEntityDef;
  headers: string[];
  rows: any[][]; // data rows, used only to sample column types
  mapping: Record<string, number>;
  manualValues: Record<string, string>;
  onChange: (m: Record<string, number>) => void;
  onManualValuesChange: (m: Record<string, string>) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const [templates, setTemplates] = useState<ImportTemplate[]>([]);
  const [saveName, setSaveName] = useState('');
  const [showSave, setShowSave] = useState(false);
  const [manualOpenFor, setManualOpenFor] = useState<Set<string>>(new Set());

  useEffect(() => {
    listImportTemplates(def.key).then(setTemplates);
  }, [def.key]);

  // A field with no matching column but a manual value already set (e.g.
  // re-opening this step) should show its manual-entry row expanded.
  useEffect(() => {
    setManualOpenFor((prev) => {
      const next = new Set(prev);
      for (const key of Object.keys(manualValues)) {
        if (manualValues[key] !== '' && manualValues[key] !== undefined) next.add(key);
      }
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const columnTypes = useMemo(
    () => headers.map((_, i) => detectColumnType(rows.slice(0, 30).map((r) => r[i]))),
    [headers, rows]
  );

  const usedCols = new Set(Object.values(mapping).filter((v) => v >= 0));

  const isFieldSatisfied = (f: ImportFieldDef) => {
    const mapped = mapping[f.key] != null && mapping[f.key] >= 0;
    const manual = manualValues[f.key] !== undefined && manualValues[f.key] !== '';
    return mapped || manual;
  };
  const missingRequired = def.fields.filter((f) => f.required && !isFieldSatisfied(f));

  function setField(fieldKey: string, colIdx: number) {
    onChange({ ...mapping, [fieldKey]: colIdx });
    // Mapping a real column supersedes any manual value for that field.
    if (colIdx >= 0 && manualValues[fieldKey]) {
      const next = { ...manualValues };
      delete next[fieldKey];
      onManualValuesChange(next);
    }
  }

  function setManualValue(fieldKey: string, value: string) {
    onManualValuesChange({ ...manualValues, [fieldKey]: value });
  }

  function toggleManual(fieldKey: string, open: boolean) {
    setManualOpenFor((prev) => {
      const next = new Set(prev);
      if (open) next.add(fieldKey); else next.delete(fieldKey);
      return next;
    });
    if (!open) {
      const next = { ...manualValues };
      delete next[fieldKey];
      onManualValuesChange(next);
    }
  }

  async function applyTemplate(t: ImportTemplate) {
    const next: Record<string, number> = { ...mapping };
    const clearedManual = { ...manualValues };
    const stillOpen = new Set(manualOpenFor);
    for (const field of def.fields) {
      const headerLabel = t.mapping[field.key];
      if (!headerLabel) continue;
      const idx = headers.findIndex((h) => h.trim().toLowerCase() === headerLabel.trim().toLowerCase());
      next[field.key] = idx;
      if (idx >= 0) { delete clearedManual[field.key]; stillOpen.delete(field.key); }
    }
    onChange(next);
    onManualValuesChange(clearedManual);
    setManualOpenFor(stillOpen);
  }

  async function handleSaveTemplate() {
    if (!saveName.trim()) return;
    const m: Record<string, string> = {};
    for (const field of def.fields) {
      const idx = mapping[field.key];
      if (idx != null && idx >= 0) m[field.key] = headers[idx];
    }
    await saveImportTemplate(saveName, def.key, m);
    setTemplates(await listImportTemplates(def.key));
    setSaveName('');
    setShowSave(false);
  }

  async function handleDeleteTemplate(id?: number) {
    if (id == null) return;
    await deleteImportTemplate(id);
    setTemplates(await listImportTemplates(def.key));
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="font-semibold text-gray-800">Map Columns</h3>
        <p className="text-sm text-gray-500">Match each Propentra field to a column from your file. Fields were auto-matched where possible — adjust any that look wrong. If your file doesn't have a column for something, you can enter one value to apply to every row instead.</p>
      </div>

      {templates.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-gray-400">Saved templates:</span>
          {templates.map((t) => (
            <div key={t.id} className="flex items-center gap-1 bg-gray-100 rounded-full pl-3 pr-1 py-1 text-xs">
              <button className="text-gray-700 font-medium" onClick={() => applyTemplate(t)}>{t.name}</button>
              <button className="icon-btn !p-1 !-m-0 text-gray-400 hover:text-red-500" onClick={() => handleDeleteTemplate(t.id)}>
                <Trash2 size={12} />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="card divide-y divide-gray-100 overflow-hidden">
        {def.fields.map((field) => {
          const idx = mapping[field.key];
          const mapped = idx != null && idx >= 0;
          const manualOpen = manualOpenFor.has(field.key);
          const satisfied = isFieldSatisfied(field);
          return (
            <div key={field.key} className="px-4 py-3">
              <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                <div className="sm:w-56 shrink-0">
                  <div className="text-sm font-medium text-gray-800">
                    {field.label} {field.required && <span className="text-red-500">*</span>}
                  </div>
                  <div className="text-xs text-gray-400">{field.type === 'enum' ? field.enumValues?.join(' / ') : field.example}</div>
                </div>

                {!manualOpen ? (
                  <>
                    <select
                      className="input sm:flex-1"
                      value={mapped ? idx : ''}
                      onChange={(e) => setField(field.key, e.target.value === '' ? -1 : Number(e.target.value))}
                    >
                      <option value="">— Not in this file —</option>
                      {headers.map((h, i) => (
                        <option key={i} value={i} disabled={usedCols.has(i) && mapping[field.key] !== i}>
                          {h}{columnTypes[i] ? ` (${TYPE_LABEL[columnTypes[i]]})` : ''}
                        </option>
                      ))}
                    </select>
                    {!mapped && (
                      <button
                        className="flex items-center gap-1 text-xs text-brand-600 font-medium whitespace-nowrap sm:w-40 shrink-0"
                        onClick={() => toggleManual(field.key, true)}
                      >
                        <PencilLine size={13} /> Add manually
                      </button>
                    )}
                    {!satisfied && field.required && <span className="text-xs text-red-500 sm:w-20 shrink-0">Required</span>}
                  </>
                ) : (
                  <>
                    <ManualValueInput field={field} value={manualValues[field.key] ?? ''} onChange={(v) => setManualValue(field.key, v)} />
                    <button
                      className="icon-btn text-gray-400 hover:text-red-500 shrink-0"
                      title="Use a column from the file instead"
                      onClick={() => toggleManual(field.key, false)}
                    >
                      <X size={16} />
                    </button>
                  </>
                )}
              </div>
              {manualOpen && (
                <div className="text-[11px] text-gray-400 mt-1 sm:ml-[15.5rem]">This exact value will be used for every row in this sheet.</div>
              )}
            </div>
          );
        })}
      </div>

      {showSave ? (
        <div className="flex items-center gap-2">
          <input className="input max-w-xs" placeholder="Template name" value={saveName} onChange={(e) => setSaveName(e.target.value)} autoFocus />
          <button className="btn-primary" onClick={handleSaveTemplate} disabled={!saveName.trim()}>Save</button>
          <button className="btn-secondary" onClick={() => setShowSave(false)}>Cancel</button>
        </div>
      ) : (
        <button className="flex items-center gap-1.5 text-sm text-brand-600 font-medium" onClick={() => setShowSave(true)}>
          <Save size={14} /> Save this mapping as a template
        </button>
      )}

      {missingRequired.length > 0 && (
        <div className="flex items-start gap-2 bg-amber-50 text-amber-700 text-sm rounded-xl p-3">
          <Wand2 size={16} className="mt-0.5 shrink-0" />
          <div>Map or manually enter every required field to continue: {missingRequired.map((f) => f.label).join(', ')}.</div>
        </div>
      )}

      <div className="flex gap-2 pt-1">
        <button className="btn-secondary flex items-center gap-1.5" onClick={onBack}><ArrowLeft size={16} /> Back</button>
        <button className="btn-primary flex items-center gap-1.5 ml-auto" disabled={missingRequired.length > 0} onClick={onNext}>
          Continue <ArrowRight size={16} />
        </button>
      </div>
    </div>
  );
}
