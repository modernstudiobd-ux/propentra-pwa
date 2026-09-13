import * as XLSX from 'xlsx';
import { IMPORT_ENTITIES, type ImportEntityDef, type ImportEntityKey } from './schemas';
import { MAP_FIELDS as STORAGE_FIELDS } from '@/components/BulkStorageImportModal';

/**
 * Generates the downloadable "Full Sample Workbook" from the exact same
 * field definitions the real importer uses (IMPORT_ENTITIES in schemas.ts,
 * plus the Storage bulk-update's field list) - there is no second/duplicate
 * schema here. If a field is renamed, added, removed, or its required flag
 * changes in schemas.ts, this file regenerates correctly with zero edits,
 * because it only ever reads from those definitions.
 *
 * Sheet NAMES are chosen so guessEntityFromSheetName (the same function the
 * real Import Wizard and Bulk Add "Import from File" flows use to
 * auto-detect a tab) recognizes every one of them, and so the "Owners" /
 * "Tenants" tabs trigger ImportWizard's per-sheet Type default (see
 * ImportWizard.tsx's `finalManual.type` logic) exactly like a real
 * multi-tab owner/tenant workbook would.
 */

function headerFor(entityKeyOrLabel: string, required?: boolean): string {
  return required ? `${entityKeyOrLabel} *` : entityKeyOrLabel;
}

/** Builds one example row for an entity, using each field's curated `example` value unless a linked-data override is supplied (used to keep names/units consistent across sheets, e.g. the same resident name on the Tenancies tab as on the Tenants tab). */
function row(def: ImportEntityDef, overrides: Record<string, string> = {}): string[] {
  return def.fields.map((f) => overrides[f.key] ?? f.example);
}

function headers(def: ImportEntityDef): string[] {
  return def.fields.map((f) => headerFor(f.label, f.required));
}

function sheetFromAoa(rows: (string | number)[][]): XLSX.WorkSheet {
  const ws = XLSX.utils.aoa_to_sheet(rows);
  const colCount = Math.max(...rows.map((r) => r.length));
  ws['!cols'] = Array.from({ length: colCount }, (_, i) => ({
    wch: Math.min(32, Math.max(10, ...rows.map((r) => String(r[i] ?? '').length + 2))),
  }));
  return ws;
}

const README_ROWS: (string | number)[][] = [
  ['Propentra - Sample Import Workbook'],
  [''],
  ['This file mirrors the exact fields Propentra\'s importer expects. Fill in your own data below each header row (or replace the example rows) and upload it via Import Data or Bulk Add > Import from File.'],
  [''],
  ['How to use this file'],
  ['- Fields marked with * are required; everything else is optional.'],
  ['- Do not rename the column headers - the importer matches columns by name automatically, so close variations are fine, but keep this sheet\'s wording as a safe default.'],
  ['- Tab names matter for auto-detection: keep sheet names as-is, or rename to something similar (e.g. "Units" for Flats, "Leases" for Tenancies) - Propentra recognizes common variations.'],
  ['- "Owners" and "Tenants" are both Resident records; Propentra tags each row\'s Type automatically from the tab name. Add more people to either tab, or split further (e.g. "Former Tenants").'],
  ['- Tenancies, Ownership, Parking, and Storage all link back to a person or unit by matching NAME or UNIT NO. text - use the exact same spelling as on the Owners/Tenants/Flats tabs (or fill in a Resident ID / Unit ID column if you already track one).'],
  ['- Delete any sheet you don\'t need; leftover unrecognized sheets are simply skipped.'],
  [''],
  ['Sheet', 'Imports as', 'Depends on'],
  ['Buildings', 'Buildings', '(none)'],
  ['Flats', 'Flats / Units', 'Buildings (by Building Name)'],
  ['Owners', 'Residents (Type = Owner)', 'Buildings / Flats (optional)'],
  ['Tenants', 'Residents (Type = Tenant)', 'Buildings / Flats (optional)'],
  ['Tenancies', 'Tenancies (leases)', 'Resident (by name/ID), Flat (optional)'],
  ['Ownership', 'Ownerships (title records)', 'Resident (by name/ID), Flat (optional)'],
  ['Parking', 'Parking Spaces', 'Building/Flat (optional), Resident (optional)'],
  ['Storage', 'Storage Included flag on a Flat', 'Flat (by Unit No.)'],
];

export function generateSampleWorkbook(): Blob {
  const wb = XLSX.utils.book_new();

  XLSX.utils.book_append_sheet(wb, sheetFromAoa(README_ROWS), 'Read Me');

  const buildings = IMPORT_ENTITIES.buildings;
  XLSX.utils.book_append_sheet(wb, sheetFromAoa([
    headers(buildings),
    row(buildings),
    row(buildings, { name: 'Harbor View Flats', address: '88 Harbor Rd', locality: 'Portview', adminArea: 'CA', postalCode: '90210', countryCode: 'US', totalFlats: '12' }),
  ]), 'Buildings');

  const flats = IMPORT_ENTITIES.flats;
  XLSX.utils.book_append_sheet(wb, sheetFromAoa([
    headers(flats),
    row(flats, { buildingRef: 'Sunset Tower', unitNo: 'A-101', occupancyStatus: 'occupied', bedrooms: '3', bathrooms: '2', sqft: '1200', standardRent: '1800' }),
    row(flats, { buildingRef: 'Sunset Tower', unitNo: 'A-102', occupancyStatus: 'occupied' }),
  ]), 'Flats');

  const residents = IMPORT_ENTITIES.residents;
  // Both tabs keep an explicit Type column (always correct on its own). The
  // "Owners"/"Tenants" tab NAMES additionally let the real Import Wizard
  // auto-set Type from the tab itself if this column is ever left unmapped
  // - see ImportWizard.tsx's per-sheet Type default for Residents jobs.
  const ownerRow = row(residents, { firstName: 'Robert', lastName: 'Chen', name: 'Robert Chen', type: 'Owner', buildingRef: 'Sunset Tower', flatRef: 'A-101', mobile: '+1 555 0142', email: 'robert.chen@example.com' });
  XLSX.utils.book_append_sheet(wb, sheetFromAoa([headers(residents), ownerRow]), 'Owners');

  const tenantRow = row(residents, { type: 'Tenant', buildingRef: 'Sunset Tower', flatRef: 'A-102' });
  XLSX.utils.book_append_sheet(wb, sheetFromAoa([headers(residents), tenantRow]), 'Tenants');

  const tenancies = IMPORT_ENTITIES.tenancies;
  XLSX.utils.book_append_sheet(wb, sheetFromAoa([
    headers(tenancies),
    row(tenancies, { residentRef: 'Jane Doe', buildingRef: 'Sunset Tower', flatRef: 'A-102' }),
  ]), 'Tenancies');

  const ownerships = IMPORT_ENTITIES.ownerships;
  XLSX.utils.book_append_sheet(wb, sheetFromAoa([
    headers(ownerships),
    row(ownerships, { residentRef: 'Robert Chen', buildingRef: 'Sunset Tower', flatRef: 'A-101' }),
  ]), 'Ownership');

  const parking = IMPORT_ENTITIES.parkingSpaces;
  XLSX.utils.book_append_sheet(wb, sheetFromAoa([
    headers(parking),
    row(parking, { buildingRef: 'Sunset Tower', flatRef: 'A-101', residentRef: 'Robert Chen' }),
  ]), 'Parking');

  // Storage isn't a full Import Wizard entity - it's the Storage Included
  // flag on a Flat, updated via the dedicated Bulk Import Storage Flags
  // flow - so its columns come from that flow's own field list (MAP_FIELDS
  // in BulkStorageImportModal.tsx), not from IMPORT_ENTITIES.
  XLSX.utils.book_append_sheet(wb, sheetFromAoa([
    STORAGE_FIELDS.map((f) => headerFor(f.label, f.required)),
    ['Sunset Tower', 'A-101', 'Yes'],
  ]), 'Storage');

  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  return new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

export function downloadSampleWorkbook() {
  const blob = generateSampleWorkbook();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'propentra-sample-import.xlsx';
  a.click();
  URL.revokeObjectURL(url);
}
