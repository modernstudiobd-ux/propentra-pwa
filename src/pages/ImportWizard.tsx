import { useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  UploadCloud, FileSpreadsheet, Download, CheckCircle2, AlertCircle, ArrowRight, ArrowLeft, Layers, RotateCcw, Wand2,
} from 'lucide-react';
import { db } from '@/lib/db';
import { parseImportFile, type ParsedWorkbook, type ParsedSheet } from '@/lib/import/parseFile';
import { autoMapColumns } from '@/lib/import/detect';
import {
  IMPORT_ENTITIES, IMPORT_ENTITY_ORDER, guessEntityFromSheetName, normalizeHeader, type ImportEntityKey,
} from '@/lib/import/schemas';
import {
  buildProcessedRows, resolveBuildingRefs, resolveFlatRefs, resolveResidentRefs, applyRefResolutions, finalizeRefErrors, detectDuplicates,
  commitImport, ImportRollbackError, type ProcessedRow, type RefResolution, type DuplicateDecision, type ImportRunResult,
} from '@/lib/import/engine';
import { downloadCsvTemplate, downloadErrorReport } from '@/lib/import/csvExport';
import MappingStep from '@/components/import/MappingStep';
import type { OtherSheetInfo } from '@/components/import/ColumnPicker';
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
  const [manualValues, setManualValues] = useState<Record<string, string>>({});
  const [rows, setRows] = useState<ProcessedRow[]>([]);
  const [buildingDistinct, setBuildingDistinct] = useState<Map<string, RefResolution>>(new Map());
  const [flatDistinct, setFlatDistinct] = useState<Map<string, RefResolution>>(new Map());
  const [residentDistinct, setResidentDistinct] = useState<Map<string, RefResolution>>(new Map());
  const [globalDecision, setGlobalDecision] = useState<DuplicateDecision>('skip');
  const [lastResult, setLastResult] = useState<SheetOutcome | null>(null);
  const [outcomes, setOutcomes] = useState<SheetOutcome[]>([]);
  // Manual "apply to every row" values, remembered by field key across every
  // sheet processed in this session (e.g. typing Currency = USD once for the
  // Flats sheet pre-fills it for Leases too, instead of asking again).
  const [manualMemory, setManualMemory] = useState<Record<string, string>>({});
  // Full column mapping remembered per entity type, so a second (or third)
  // tab mapped to the same entity - e.g. "Flats - Tower A" then "Flats -
  // Tower B" - reuses the same header choices instead of re-mapping.
  const [entityMappingMemory, setEntityMappingMemory] = useState<Partial<Record<ImportEntityKey, {
    sourceSheet: string; mapping: Record<string, string>; manualValues: Record<string, string>;
  }>>>({});
  const [mappingReusedFrom, setMappingReusedFrom] = useState<string | null>(null);
  // Notes about relationship steps that were skipped automatically because
  // every reference already matched an existing record with no ambiguity.
  const [autoMatchNotes, setAutoMatchNotes] = useState<string[]>([]);

  function noteAutoResolved(count: number, fieldLabel: string) {
    setAutoMatchNotes((prev) => [...prev, `${count} ${fieldLabel.toLowerCase()} reference${count > 1 ? 's' : ''} matched automatically`]);
  }

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
    setManualValues({});
    setRows([]);
    setOutcomes([]);
    setLastResult(null);
    setManualMemory({});
    setEntityMappingMemory({});
    setMappingReusedFrom(null);
    setAutoMatchNotes([]);
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

  /** Every other tab in the workbook, as far as the ColumnPicker's cross-tab search needs to know - its own header list and, if it's already assigned an entity, that entity's label (so a search hit there can offer "Go to tab"). */
  function otherSheetsForJob(index: number): OtherSheetInfo[] {
    return jobs
      .map((j, i) => ({ j, i }))
      .filter(({ i }) => i !== index)
      .map(({ j, i }) => ({
        jobIndex: i,
        sheetName: j.sheet.name,
        entityLabel: j.entity ? IMPORT_ENTITIES[j.entity].label : null,
        headers: j.sheet.headers,
      }));
  }

  /** Jumps straight to mapping a different tab, from a "Go to tab" hit in the column search - used when a column the user is looking for actually lives on another sheet. */
  function jumpToSheet(index: number) {
    startJob(index);
  }

  function startJob(index: number) {
    const job = jobs[index];
    if (!job || !job.entity) return;
    const def = IMPORT_ENTITIES[job.entity];
    const headers = job.sheet.headers;
    const autoMapped = autoMapColumns(headers, def);

    // If an earlier tab was already mapped to this same entity, reuse those
    // exact header choices wherever this tab has a matching column name -
    // covers the common "one tab per building/unit" file layout - and only
    // fall back to fresh auto-detection for anything it doesn't cover.
    const remembered = entityMappingMemory[job.entity];
    let finalMapping = autoMapped;
    let finalManual: Record<string, string> = {};
    let reusedFrom: string | null = null;
    if (remembered) {
      const resolved: Record<string, number> = {};
      for (const field of def.fields) {
        const rememberedHeader = remembered.mapping[field.key];
        if (!rememberedHeader) continue;
        const idx = headers.findIndex((h) => normalizeHeader(h) === normalizeHeader(rememberedHeader));
        if (idx >= 0) resolved[field.key] = idx;
      }
      if (Object.keys(resolved).length) {
        finalMapping = { ...autoMapped, ...resolved };
        finalManual = { ...remembered.manualValues };
        reusedFrom = remembered.sourceSheet;
      }
    }
    // Manual "apply to every row" values remembered from any earlier sheet
    // (any entity) fill in anything still missing a column, e.g. Currency.
    for (const field of def.fields) {
      const hasColumn = finalMapping[field.key] != null && finalMapping[field.key] >= 0;
      if (!hasColumn && !finalManual[field.key] && manualMemory[field.key]) finalManual[field.key] = manualMemory[field.key];
    }

    // Multiple Residents-mapped tabs are common (e.g. separate "Tenants" and
    // "Owners" tabs that both merge into the Residents table) - each such
    // tab should default its own Type rather than inheriting whatever the
    // last Residents tab's manual value was, unless this sheet has its own
    // Type column mapped from the file.
    if (job.entity === 'residents') {
      const hasTypeColumn = finalMapping.type != null && finalMapping.type >= 0;
      if (!hasTypeColumn) {
        const sheetName = normalizeHeader(job.sheet.name);
        if (/owner/.test(sheetName) && !/tenant/.test(sheetName)) finalManual.type = 'Owner';
        else if (/tenant/.test(sheetName) && !/owner/.test(sheetName)) finalManual.type = 'Tenant';
      }
    }

    setJobIndex(index);
    setMapping(finalMapping);
    setManualValues(finalManual);
    setMappingReusedFrom(reusedFrom);
    setAutoMatchNotes([]);
    setPhase('mapping');
  }

  /** Discards the reused mapping for the current sheet and re-runs plain header-name auto-detection instead. */
  function reapplyAutoDetect() {
    if (!currentJob || !currentDef) return;
    setMapping(autoMapColumns(currentJob.sheet.headers, currentDef));
    setManualValues({});
    setMappingReusedFrom(null);
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
      const nonEmptyManual = Object.fromEntries(Object.entries(manualValues).filter(([, v]) => v !== '' && v !== undefined));
      if (Object.keys(nonEmptyManual).length) setManualMemory((prev) => ({ ...prev, ...nonEmptyManual }));
      const headerMapping: Record<string, string> = {};
      for (const field of currentDef.fields) {
        const idx = mapping[field.key];
        if (idx != null && idx >= 0) headerMapping[field.key] = currentJob.sheet.headers[idx];
      }
      if (Object.keys(headerMapping).length) {
        setEntityMappingMemory((prev) => ({
          ...prev,
          [currentJob.entity as ImportEntityKey]: { sourceSheet: currentJob.sheet.name, mapping: headerMapping, manualValues: nonEmptyManual },
        }));
      }
      const processed = buildProcessedRows(currentDef, currentJob.sheet.rows, mapping, manualValues);
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
      applyRefResolutions(rows, resolutions, new Map(), undefined, { finalize: false });
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
      applyRefResolutions(rows, new Map(), resolutions, undefined, { finalize: false });
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
      applyRefResolutions(rows, new Map(), new Map(), resolutions, { finalize: false });
      await goToPreview(rows);
    } finally {
      setBusy(false);
    }
  }

  async function goToPreview(processedRows: ProcessedRow[]) {
    if (!currentDef) return;
    // Every applicable reference type for this entity has now had its
    // resolution step (building/unit/resident, whichever apply) - this is
    // the single correct point to flag any that are still unmatched.
    finalizeRefErrors(processedRows);
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
          {mappingReusedFrom && (
            <div className="flex items-center gap-2 bg-brand-50 text-brand-700 text-xs rounded-xl p-3 mb-4">
              <Wand2 size={14} className="shrink-0" />
              <div className="flex-1">Columns mapped automatically, reused from "{mappingReusedFrom}" — check they still look right.</div>
              <button className="text-brand-700 underline font-medium shrink-0" onClick={reapplyAutoDetect}>Re-detect instead</button>
            </div>
          )}
          <MappingStep
            def={currentDef}
            headers={currentJob.sheet.headers}
            rows={currentJob.sheet.rows}
            mapping={mapping}
            manualValues={manualValues}
            onChange={setMapping}
            onManualValuesChange={setManualValues}
            onBack={() => setPhase('queue')}
            onNext={proceedFromMapping}
            otherSheets={otherSheetsForJob(jobIndex)}
            onJumpToSheet={jumpToSheet}
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
            onAutoResolved={noteAutoResolved}
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
            onAutoResolved={noteAutoResolved}
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
            onAutoResolved={noteAutoResolved}
          />
        </div>
      )}

      {phase === 'preview' && currentDef && (
        <div className="card p-6">
          <SheetProgress job={currentJob!} outcomes={outcomes} jobs={jobs} />
          {autoMatchNotes.length > 0 && (
            <div className="flex items-start gap-2 bg-emerald-50 text-emerald-700 text-xs rounded-xl p-3 mb-4">
              <CheckCircle2 size={14} className="mt-0.5 shrink-0" />
              <div>{autoMatchNotes.join(' · ')} - no review needed, so those steps were skipped.</div>
            </div>
          )}
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
          {currentJob?.entity === 'residents' && (() => {
            const unassignedCount = lastResult.rows.filter((r, i) => {
              const outcome = lastResult.result.rowResults[i];
              return outcome && outcome.status !== 'skipped' && !r.refs['flatRef']?.raw;
            }).length;
            if (unassignedCount === 0) return null;
            return (
              <div className="flex items-start gap-2 bg-amber-50 text-amber-700 text-xs rounded-xl p-3">
                <AlertCircle size={14} className="mt-0.5 shrink-0" />
                <div>{unassignedCount} resident{unassignedCount > 1 ? 's were' : ' was'} imported with no unit (this sheet had no Building/Unit column) - they'll show up under "Unassigned — No Unit" on the Residents page until you link each one to a flat.</div>
              </div>
            );
          })()}
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
