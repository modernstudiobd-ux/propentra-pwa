import { useEffect, useMemo, useState } from 'react';
import { Save, Trash2, Wand2, ArrowRight, ArrowLeft } from 'lucide-react';
import type { ImportEntityDef } from '@/lib/import/schemas';
import { detectColumnType, type DetectedColumnType } from '@/lib/import/detect';
import { listImportTemplates, saveImportTemplate, deleteImportTemplate } from '@/lib/import/templates';
import type { ImportTemplate } from '@/types';

const TYPE_LABEL: Record<DetectedColumnType, string> = {
  string: 'Text', number: 'Number', date: 'Date', boolean: 'Yes/No',
};

export default function MappingStep({
  def, headers, rows, mapping, onChange, onBack, onNext,
}: {
  def: ImportEntityDef;
  headers: string[];
  rows: any[][]; // data rows, used only to sample column types
  mapping: Record<string, number>;
  onChange: (m: Record<string, number>) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const [templates, setTemplates] = useState<ImportTemplate[]>([]);
  const [saveName, setSaveName] = useState('');
  const [showSave, setShowSave] = useState(false);

  useEffect(() => {
    listImportTemplates(def.key).then(setTemplates);
  }, [def.key]);

  const columnTypes = useMemo(
    () => headers.map((_, i) => detectColumnType(rows.slice(0, 30).map((r) => r[i]))),
    [headers, rows]
  );

  const usedCols = new Set(Object.values(mapping).filter((v) => v >= 0));
  const missingRequired = def.fields.filter((f) => f.required && (mapping[f.key] == null || mapping[f.key] < 0));

  function setField(fieldKey: string, colIdx: number) {
    onChange({ ...mapping, [fieldKey]: colIdx });
  }

  async function applyTemplate(t: ImportTemplate) {
    const next: Record<string, number> = { ...mapping };
    for (const field of def.fields) {
      const headerLabel = t.mapping[field.key];
      if (!headerLabel) continue;
      const idx = headers.findIndex((h) => h.trim().toLowerCase() === headerLabel.trim().toLowerCase());
      next[field.key] = idx;
    }
    onChange(next);
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
        <p className="text-sm text-gray-500">Match each Propentra field to a column from your file. Fields were auto-matched where possible — adjust any that look wrong.</p>
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
          return (
            <div key={field.key} className="flex flex-col sm:flex-row sm:items-center gap-2 px-4 py-3">
              <div className="sm:w-56 shrink-0">
                <div className="text-sm font-medium text-gray-800">
                  {field.label} {field.required && <span className="text-red-500">*</span>}
                </div>
                <div className="text-xs text-gray-400">{field.type === 'enum' ? field.enumValues?.join(' / ') : field.example}</div>
              </div>
              <select
                className="input sm:flex-1"
                value={idx != null && idx >= 0 ? idx : ''}
                onChange={(e) => setField(field.key, e.target.value === '' ? -1 : Number(e.target.value))}
              >
                <option value="">— Not mapped —</option>
                {headers.map((h, i) => (
                  <option key={i} value={i} disabled={usedCols.has(i) && mapping[field.key] !== i}>
                    {h}{columnTypes[i] ? ` (${TYPE_LABEL[columnTypes[i]]})` : ''}
                  </option>
                ))}
              </select>
              {!mapped && field.required && <span className="text-xs text-red-500 sm:w-24">Required</span>}
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
          <div>Map every required field to continue: {missingRequired.map((f) => f.label).join(', ')}.</div>
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
