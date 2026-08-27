import { useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  UploadCloud, FileSpreadsheet, Download, CheckCircle2, AlertCircle, ArrowRight, ArrowLeft, Layers, RotateCcw,
} from 'lucide-react';
import { db } from '@/lib/db';
import { parseImportFile, type ParsedWorkbook, type ParsedSheet } from '@/lib/import/parseFile';
import { autoMapColumns } from '@/lib/import/detect';
import {
  IMPORT_ENTITIES, IMPORT_ENTITY_ORDER, guessEntityFromSheetName, normalizeHeader, type ImportEntityKey,
} from '@/lib/import/schemas';
import {
  buildProcessedRows, resolveBuildingRefs, resolveFlatRefs, resolveResidentRefs, applyRefResolutions, detectDuplicates,
  commitImport, ImportRollbackError, type ProcessedRow, type RefResolution, type DuplicateDecision, type ImportRunResult,
} from '@/lib/import/engine';
import { downloadCsvTemplate, downloadErrorReport } from '@/lib/import/csvExport';
import MappingStep from '@/components/import/MappingStep';
import RelationshipStep from '@/components/import/RelationshipStep';
import PreviewStep from '@/components/import/PreviewStep';

type WizardPhase = 'upload' | 'queue' | 'mapping' | 'relBuilding' | 'relFlat' | 'relResident' | 'preview' | 'result' | 'done';

interface SheetJob {
  sheet: ParsedSheet;
  entity: ImportEntityKey | null; // null = skip this sheet
}

interface SheetOutcome {
  sheetName: string;
  entityLabel: string;
  result: ImportRunResult;
  rows: ProcessedRow[];
}

export default function ImportWizard() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [phase, setPhase] = useState<WizardPhase>('upload');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [workbook, setWorkbook] = useState<ParsedWorkbook | null>(null);
  const [jobs, setJobs] = useState<SheetJob[]>([]);
  const [jobIndex, setJobIndex] = useState(0);

  const [mapping, setMapping] = useState<Record<string, number>>({});
  const [rows, setRows] = useState<ProcessedRow[]>([]);
  const [buildingDistinct, setBuildingDistinct] = useState<Map<string, RefResolution>>(new Map());
  const [flatDistinct, setFlatDistinct] = useState<Map<string, RefResolution>>(new Map());
  const [residentDistinct, setResidentDistinct] = useState<Map<string, RefResolution>>(new Map());
  const [globalDecision, setGlobalDecision] = useState<DuplicateDecision>('skip');
  const [lastResult, setLastResult] = useState<SheetOutcome | null>(null);
  const [outcomes, setOutcomes] = useState<SheetOutcome[]>([]);

  const allBuildings = useLiveQuery(() => db.buildings.toArray(), [phase]) ?? [];
  const allFlats = useLiveQuery(() => db.flats.toArray(), [phase]) ?? [];
  const allResidents = useLiveQuery(() => db.residents.toArray(), [phase]) ?? [];

  const currentJob = jobs[jobIndex] ?? null;
  const currentDef = currentJob?.entity ? IMPORT_ENTITIES[currentJob.entity] : null;

  function resetAll() {
    setPhase('upload');
    setError(null);
    setWorkbook(null);
    setJobs([]);
    setJobIndex(0);
    setMapping({});
    setRows([]);
    setOutcomes([]);
    setLastResult(null);
  }

  // --- Step: upload ------------------------------------------------------

  async function handleFile(file: File) {
    setError(null);
    setBusy(true);
    try {
      const wb = await parseImportFile(file);
      const initialJobs: SheetJob[] = wb.sheets.map((sheet) => ({ sheet, entity: guessEntityFromSheetName(sheet.name) }));
      setWorkbook(wb);
      setJobs(initialJobs);
      setJobIndex(0);
      setPhase('queue');
    } catch (e: any) {
      setError(e?.message || 'Could not read this file.');
    } finally {
      setBusy(false);
    }
  }

  // --- Step: sheet queue ---------------------------------------------------

  function startJob(index: number) {
    const job = jobs[index];
    if (!job || !job.entity) return;
    const def = IMPORT_ENTITIES[job.entity];
    setJobIndex(index);
    setMapping(autoMapColumns(job.sheet.headers, def));
    setPhase('mapping');
  }

  function nextEligibleJobIndex(from: number): number {
    for (let i = from; i < jobs.length; i++) if (jobs[i].entity) return i;
    return -1;
  }

  // --- Step: mapping -> relationships / preview --------------------------

  async function proceedFromMapping() {
    if (!currentJob || !currentDef) return;
    setBusy(true);
    try {
      const processed = buildProcessedRows(currentDef, currentJob.sheet.rows, mapping);
      const hasBuildingRef = currentDef.fields.some((f) => f.refEntity === 'building');
      if (hasBuildingRef) {
        const distinct = await resolveBuildingRefs(processed);
        setBuildingDistinct(distinct);
        setRows(processed);
        setPhase('relBuilding');
      } else {
        setRows(processed);
        await proceedToResidentOrPreview(processed);
      }
    } finally {
      setBusy(false);
    }
  }

  async function proceedFromBuildingRels(resolutions: Map<string, RefResolution>) {
    if (!currentDef) return;
    setBusy(true);
    try {
      applyRefResolutions(rows, resolutions, new Map());
      const hasFlatRef = currentDef.fields.some((f) => f.refEntity === 'flat');
      if (hasFlatRef) {
        const distinct = await resolveFlatRefs(rows);
        setFlatDistinct(distinct);
        setPhase('relFlat');
      } else {
        await proceedToResidentOrPreview(rows);
      }
    } finally {
      setBusy(false);
    }
  }

  async function proceedFromFlatRels(resolutions: Map<string, RefResolution>) {
    setBusy(true);
    try {
      applyRefResolutions(rows, new Map(), resolutions);
      await proceedToResidentOrPreview(rows);
    } finally {
      setBusy(false);
    }
  }

  async function proceedToResidentOrPreview(processedRows: ProcessedRow[]) {
    if (!currentDef) return;
    const hasResidentRef = currentDef.fields.some((f) => f.refEntity === 'resident');
    if (hasResidentRef) {
      const distinct = await resolveResidentRefs(processedRows);
      setResidentDistinct(distinct);
      setRows(processedRows);
      setPhase('relResident');
    } else {
      await goToPreview(processedRows);
    }
  }

  async function proceedFromResidentRels(resolutions: Map<string, RefResolution>) {
    setBusy(true);
    try {
      applyRefResolutions(rows, new Map(), new Map(), resolutions);
      await goToPreview(rows);
    } finally {
      setBusy(false);
    }
  }

  async function goToPreview(processedRows: ProcessedRow[]) {
    if (!currentDef) return;
    await detectDuplicates(currentDef, processedRows);
    const decided = processedRows.map((r) => (r.duplicate ? { ...r, decision: globalDecision } : r));
    setRows(decided);
    setPhase('preview');
  }

  // --- Step: import --------------------------------------------------------

  async function runImport() {
    if (!currentDef || !currentJob) return;
    setBusy(true);
    setError(null);
    try {
      const result = await commitImport(currentDef, rows);
      const outcome: SheetOutcome = { sheetName: currentJob.sheet.name, entityLabel: currentDef.label, result, rows };
      setLastResult(outcome);
      setOutcomes((prev) => [...prev, outcome]);
      setPhase('result');
    } catch (e: any) {
      setError(e instanceof ImportRollbackError ? e.message : (e?.message || 'Import failed and was rolled back.'));
    } finally {
      setBusy(false);
    }
  }

  function continueAfterResult() {
    const next = nextEligibleJobIndex(jobIndex + 1);
    if (next === -1) {
      setPhase('done');
    } else {
      startJob(next);
    }
  }

  // --- Render ----------------------------------------------------------

  return (
    <div className="max-w-4xl mx-auto space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-gray-800">Import Data</h2>
        <p className="text-sm text-gray-500">Bring buildings, flats, residents, or expenses in from an Excel or CSV file.</p>
      </div>

      {error && (
        <div className="flex items-start gap-2 bg-red-50 text-red-600 text-sm rounded-xl p-3">
          <AlertCircle size={16} className="mt-0.5 shrink-0" /> <div>{error}</div>
        </div>
      )}

      {phase === 'upload' && (
        <div className="card p-6 space-y-4">
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files?.[0]; if (f) handleFile(f); }}
            className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors ${dragOver ? 'border-brand-500 bg-brand-50' : 'border-gray-200'}`}
            onClick={() => fileRef.current?.click()}
          >
            <UploadCloud className="mx-auto text-brand-500 mb-2" size={30} />
            <div className="text-sm text-gray-600">{busy ? 'Reading file…' : 'Click to upload or drag and drop'}</div>
            <div className="text-xs text-gray-400 mt-1">.xlsx, .xls, .csv, or .tsv — multi-sheet files supported</div>
            <button className="btn-secondary mt-3 text-sm" type="button" disabled={busy}>Browse File</button>
            <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv,.tsv" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
          </div>

          <div className="pt-2 border-t border-gray-100">
            <div className="text-sm font-medium text-gray-700 mb-2">Don't have a file ready? Download a starter template:</div>
            <div className="flex flex-wrap gap-2">
              {IMPORT_ENTITY_ORDER.map((key) => (
                <button key={key} className="btn-secondary flex items-center gap-1.5 text-xs" onClick={() => downloadCsvTemplate(key)}>
                  <Download size={13} /> {IMPORT_ENTITIES[key].label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {phase === 'queue' && workbook && (
        <div className="card p-6 space-y-4">
          <div className="flex items-center gap-2">
            <Layers size={18} className="text-brand-500" />
            <h3 className="font-semibold text-gray-800">{workbook.fileName}</h3>
          </div>
          <p className="text-sm text-gray-500">
            {jobs.length > 1 ? `This file has ${jobs.length} sheets. ` : ''}
            Choose what each sheet should import as, then process them one at a time.
          </p>
          <div className="divide-y divide-gray-100">
            {jobs.map((job, i) => (
              <div key={job.sheet.name} className="flex items-center gap-3 py-3">
                <FileSpreadsheet size={16} className="text-gray-400 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-gray-800 truncate">{job.sheet.name}</div>
                  <div className="text-xs text-gray-400">{job.sheet.rows.length} row{job.sheet.rows.length === 1 ? '' : 's'}</div>
                </div>
                <select
                  className="input !w-auto"
                  value={job.entity ?? ''}
                  onChange={(e) => {
                    const v = e.target.value as ImportEntityKey | '';
                    setJobs((prev) => prev.map((j, idx) => (idx === i ? { ...j, entity: v || null } : j)));
                  }}
                >
                  <option value="">Skip this sheet</option>
                  {IMPORT_ENTITY_ORDER.map((k) => <option key={k} value={k}>{IMPORT_ENTITIES[k].label}</option>)}
                </select>
              </div>
            ))}
          </div>
          <div className="flex gap-2 pt-1">
            <button className="btn-secondary flex items-center gap-1.5" onClick={resetAll}><ArrowLeft size={16} /> Choose a different file</button>
            <button
              className="btn-primary flex items-center gap-1.5 ml-auto"
              disabled={!jobs.some((j) => j.entity)}
              onClick={() => startJob(nextEligibleJobIndex(0))}
            >
              Start Import <ArrowRight size={16} />
            </button>
          </div>
        </div>
      )}

      {phase === 'mapping' && currentJob && currentDef && (
        <div className="card p-6">
          <SheetProgress job={currentJob} outcomes={outcomes} jobs={jobs} />
          <MappingStep
            def={currentDef}
            headers={currentJob.sheet.headers}
            rows={currentJob.sheet.rows}
            mapping={mapping}
            onChange={setMapping}
            onBack={() => setPhase('queue')}
            onNext={proceedFromMapping}
          />
        </div>
      )}

      {phase === 'relBuilding' && currentDef && (
        <div className="card p-6">
          <SheetProgress job={currentJob!} outcomes={outcomes} jobs={jobs} />
          <RelationshipStep
            fieldLabel="Building"
            distinct={buildingDistinct}
            getExistingOptions={() => allBuildings.map((b) => ({ id: b.id as number, label: b.name })).sort((a, b) => a.label.localeCompare(b.label))}
            onBack={() => setPhase('mapping')}
            onNext={proceedFromBuildingRels}
          />
        </div>
      )}

      {phase === 'relFlat' && currentDef && (
        <div className="card p-6">
          <SheetProgress job={currentJob!} outcomes={outcomes} jobs={jobs} />
          <RelationshipStep
            fieldLabel="Unit"
            distinct={flatDistinct}
            getExistingOptions={(key) => {
              const buildingId = Number(key.split('::')[0]);
              return allFlats
                .filter((f) => f.buildingId === buildingId)
                .map((f) => ({ id: f.id as number, label: f.unitNo }))
                .sort((a, b) => a.label.localeCompare(b.label));
            }}
            onBack={() => setPhase('relBuilding')}
            onNext={proceedFromFlatRels}
          />
        </div>
      )}

      {phase === 'relResident' && currentDef && (
        <div className="card p-6">
          <SheetProgress job={currentJob!} outcomes={outcomes} jobs={jobs} />
          <RelationshipStep
            fieldLabel="Resident"
            distinct={residentDistinct}
            allowCreate={false}
            getExistingOptions={() => allResidents.map((r) => ({ id: r.id as number, label: r.name })).sort((a, b) => a.label.localeCompare(b.label))}
            onBack={() => setPhase(currentDef.fields.some((f) => f.refEntity === 'flat') ? 'relFlat' : currentDef.fields.some((f) => f.refEntity === 'building') ? 'relBuilding' : 'mapping')}
            onNext={proceedFromResidentRels}
          />
        </div>
      )}

      {phase === 'preview' && currentDef && (
        <div className="card p-6">
          <SheetProgress job={currentJob!} outcomes={outcomes} jobs={jobs} />
          <PreviewStep
            def={currentDef}
            rows={rows}
            globalDecision={globalDecision}
            onGlobalDecisionChange={setGlobalDecision}
            onRowsChange={setRows}
            onBack={() => setPhase(
              currentDef.fields.some((f) => f.refEntity === 'resident') ? 'relResident'
                : currentDef.fields.some((f) => f.refEntity === 'flat') ? 'relFlat'
                : currentDef.fields.some((f) => f.refEntity === 'building') ? 'relBuilding' : 'mapping'
            )}
            onImport={runImport}
            importing={busy}
          />
        </div>
      )}

      {phase === 'result' && lastResult && (
        <div className="card p-6 space-y-4">
          <div className="flex items-center gap-2 text-emerald-600 font-medium">
            <CheckCircle2 size={20} /> "{lastResult.sheetName}" imported as {lastResult.entityLabel}
          </div>
          <div className="grid grid-cols-3 gap-2 text-sm">
            <div className="bg-emerald-50 rounded-xl px-3 py-2"><div className="text-xs text-emerald-600">Created</div><div className="font-semibold text-emerald-700">{lastResult.result.created}</div></div>
            <div className="bg-brand-50 rounded-xl px-3 py-2"><div className="text-xs text-brand-600">Updated</div><div className="font-semibold text-brand-700">{lastResult.result.updated}</div></div>
            <div className="bg-gray-50 rounded-xl px-3 py-2"><div className="text-xs text-gray-500">Skipped</div><div className="font-semibold text-gray-700">{lastResult.result.skipped}</div></div>
          </div>
          {lastResult.result.skipped > 0 && (
            <button
              className="btn-secondary flex items-center gap-1.5 text-sm"
              onClick={() => downloadErrorReport(
                currentJob!.entity!,
                lastResult.result.rowResults.filter((r) => r.status === 'skipped').map((r) => ({ rowNumber: r.rowIndex + 1, status: r.status, message: r.message || '' }))
              )}
            >
              <Download size={14} /> Download skipped-rows report
            </button>
          )}
          <button className="btn-primary flex items-center gap-1.5" onClick={continueAfterResult}>
            {nextEligibleJobIndex(jobIndex + 1) === -1 ? 'Finish' : 'Next Sheet'} <ArrowRight size={16} />
          </button>
        </div>
      )}

      {phase === 'done' && (
        <div className="card p-6 space-y-4">
          <div className="flex items-center gap-2 text-emerald-600 font-medium"><CheckCircle2 size={20} /> Import complete</div>
          <div className="divide-y divide-gray-100">
            {outcomes.map((o, i) => (
              <div key={i} className="py-2 flex items-center justify-between text-sm">
                <div className="text-gray-700">{o.sheetName} <span className="text-gray-400">({o.entityLabel})</span></div>
                <div className="text-gray-500">{o.result.created} created · {o.result.updated} updated · {o.result.skipped} skipped</div>
              </div>
            ))}
          </div>
          <button className="btn-primary flex items-center gap-1.5" onClick={resetAll}><RotateCcw size={16} /> Import Another File</button>
        </div>
      )}
    </div>
  );
}

function SheetProgress({ job, outcomes, jobs }: { job: SheetJob; outcomes: SheetOutcome[]; jobs: SheetJob[] }) {
  const totalEligible = jobs.filter((j) => j.entity).length;
  if (totalEligible <= 1) {
    return <div className="text-xs text-gray-400 mb-4">Sheet: <span className="font-medium text-gray-600">{job.sheet.name}</span></div>;
  }
  return (
    <div className="text-xs text-gray-400 mb-4">
      Sheet {outcomes.length + 1} of {totalEligible}: <span className="font-medium text-gray-600">{job.sheet.name}</span>
    </div>
  );
}
