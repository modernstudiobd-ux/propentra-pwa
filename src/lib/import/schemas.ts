// Declarative field definitions for every entity the Import Wizard can
// bring data into. Adding a new importable entity later means adding one
// more ImportEntityDef here - the parsing/mapping/validation/dedupe/commit
// engine (see engine.ts) is entirely generic and reads these definitions.

export type ImportFieldType = 'string' | 'number' | 'date' | 'boolean' | 'enum';
export type ImportEntityKey = 'buildings' | 'flats' | 'residents' | 'expenses';

export interface ImportFieldDef {
  key: string; // becomes the DB field name, EXCEPT for keys ending in "Ref" -
               // see refFieldTarget() in engine.ts, which maps e.g.
               // "buildingRef" -> "buildingId" once the reference is resolved.
  label: string;
  type: ImportFieldType;
  required: boolean;
  enumValues?: readonly string[];
  defaultValue?: any;
  refEntity?: 'building' | 'flat'; // this column's text must resolve to another entity's id
  aliases: string[]; // header-name guesses used for auto-mapping (normalized at match time)
  example: string; // sample value used in downloadable CSV templates
}

export interface ImportEntityDef {
  key: ImportEntityKey;
  label: string;
  description: string;
  fields: ImportFieldDef[];
  // Ordered groups of field keys (post-resolution, i.e. buildingId/flatId not
  // buildingRef/flatRef) used to detect an existing duplicate record. The
  // first group whose fields are ALL present on the incoming row is used.
  matchKeyGroups: string[][];
}

export const BUILDINGS_DEF: ImportEntityDef = {
  key: 'buildings',
  label: 'Buildings',
  description: 'One row per building or property.',
  fields: [
    { key: 'name', label: 'Building Name', type: 'string', required: true,
      aliases: ['name', 'building', 'buildingname', 'property', 'propertyname'], example: 'Sunset Tower' },
    { key: 'address', label: 'Address', type: 'string', required: false,
      aliases: ['address', 'location', 'addr', 'streetaddress'], example: '123 Main St' },
    { key: 'totalFlats', label: 'Total Flats', type: 'number', required: false, defaultValue: 0,
      aliases: ['totalflats', 'units', 'unitcount', 'numberofunits', 'totalunits'], example: '24' },
  ],
  matchKeyGroups: [['name']],
};

export const FLATS_DEF: ImportEntityDef = {
  key: 'flats',
  label: 'Flats / Units',
  description: 'One row per flat/unit. The building is matched by name.',
  fields: [
    { key: 'buildingRef', label: 'Building Name', type: 'string', required: true, refEntity: 'building',
      aliases: ['building', 'buildingname', 'property'], example: 'Sunset Tower' },
    { key: 'unitNo', label: 'Unit No.', type: 'string', required: true,
      aliases: ['unitno', 'unit', 'unitnumber', 'flat', 'flatno', 'apt', 'apartment'], example: 'A-3' },
    { key: 'floor', label: 'Floor', type: 'string', required: false,
      aliases: ['floor', 'level'], example: '3' },
    { key: 'status', label: 'Status', type: 'enum', required: false, enumValues: ['occupied', 'vacant'], defaultValue: 'vacant',
      aliases: ['status', 'occupancy'], example: 'vacant' },
  ],
  matchKeyGroups: [['buildingId', 'unitNo']],
};

export const RESIDENTS_DEF: ImportEntityDef = {
  key: 'residents',
  label: 'Residents',
  description: 'One row per resident (tenant or owner). Building & flat are matched by name/unit.',
  fields: [
    { key: 'buildingRef', label: 'Building Name', type: 'string', required: true, refEntity: 'building',
      aliases: ['building', 'buildingname', 'property'], example: 'Sunset Tower' },
    { key: 'flatRef', label: 'Unit No.', type: 'string', required: true, refEntity: 'flat',
      aliases: ['unitno', 'unit', 'flat', 'flatno', 'apt', 'apartment'], example: 'A-3' },
    { key: 'name', label: 'Resident Name', type: 'string', required: true,
      aliases: ['name', 'residentname', 'tenantname', 'fullname'], example: 'Jane Doe' },
    { key: 'mobile', label: 'Mobile', type: 'string', required: false,
      aliases: ['mobile', 'phone', 'phonenumber', 'cell', 'contactnumber'], example: '+1 555 0100' },
    { key: 'email', label: 'Email', type: 'string', required: false,
      aliases: ['email', 'emailaddress'], example: 'jane@example.com' },
    { key: 'type', label: 'Type', type: 'enum', required: false, enumValues: ['Tenant', 'Owner'], defaultValue: 'Tenant',
      aliases: ['type', 'residenttype'], example: 'Tenant' },
    { key: 'status', label: 'Status', type: 'enum', required: false, enumValues: ['current', 'former'], defaultValue: 'current',
      aliases: ['status', 'residentstatus'], example: 'current' },
    { key: 'moveInDate', label: 'Move-In Date', type: 'date', required: false,
      aliases: ['moveindate', 'movein', 'startdate'], example: '2024-01-15' },
    { key: 'moveOutDate', label: 'Move-Out Date', type: 'date', required: false,
      aliases: ['moveoutdate', 'moveout', 'enddate'], example: '' },
    { key: 'isBillingContact', label: 'Billing Contact', type: 'boolean', required: false, defaultValue: true,
      aliases: ['billingcontact', 'isbillingcontact', 'primarycontact'], example: 'Yes' },
    { key: 'idType', label: 'ID Type', type: 'string', required: false,
      aliases: ['idtype'], example: 'Passport' },
    { key: 'idNumber', label: 'ID Number', type: 'string', required: false,
      aliases: ['idnumber', 'id', 'nationalid'], example: 'X1234567' },
  ],
  // Prefer matching by ID number when the sheet has one (most reliable);
  // otherwise fall back to building + flat + name.
  matchKeyGroups: [['idNumber'], ['buildingId', 'flatId', 'name']],
};

export const EXPENSES_DEF: ImportEntityDef = {
  key: 'expenses',
  label: 'Expenses',
  description: 'One row per expense transaction. Building is matched by name.',
  fields: [
    { key: 'buildingRef', label: 'Building Name', type: 'string', required: true, refEntity: 'building',
      aliases: ['building', 'buildingname', 'property'], example: 'Sunset Tower' },
    { key: 'flatRef', label: 'Unit No. (optional)', type: 'string', required: false, refEntity: 'flat',
      aliases: ['unitno', 'unit', 'flat', 'flatno'], example: '' },
    { key: 'category', label: 'Category', type: 'string', required: true,
      aliases: ['category', 'type', 'expensecategory'], example: 'Repairs & Maintenance' },
    { key: 'amount', label: 'Amount', type: 'number', required: true,
      aliases: ['amount', 'cost', 'total', 'expenseamount'], example: '150.00' },
    { key: 'vendor', label: 'Vendor', type: 'string', required: false,
      aliases: ['vendor', 'payee', 'paidto', 'supplier'], example: 'Ace Plumbing' },
    { key: 'date', label: 'Date', type: 'date', required: true,
      aliases: ['date', 'expensedate', 'transactiondate'], example: '2024-03-01' },
    { key: 'notes', label: 'Notes', type: 'string', required: false,
      aliases: ['notes', 'description', 'memo'], example: '' },
  ],
  // Expenses have no natural unique key - this only flags likely repeats
  // (same building, date, amount, vendor) for the user to review; it never
  // silently blocks a legitimate second identical expense.
  matchKeyGroups: [['buildingId', 'date', 'amount', 'vendor']],
};

export const IMPORT_ENTITIES: Record<ImportEntityKey, ImportEntityDef> = {
  buildings: BUILDINGS_DEF,
  flats: FLATS_DEF,
  residents: RESIDENTS_DEF,
  expenses: EXPENSES_DEF,
};

export const IMPORT_ENTITY_ORDER: ImportEntityKey[] = ['buildings', 'flats', 'residents', 'expenses'];

/** Lowercase, alphanumeric-only form used to fuzzily compare header text, entity/building/unit names, etc. */
export function normalizeHeader(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** Best-guess entity for a sheet, based on its tab name. Returns null if nothing matches (user picks manually). */
export function guessEntityFromSheetName(name: string): ImportEntityKey | null {
  const n = normalizeHeader(name);
  if (/building|propert/.test(n)) return 'buildings';
  if (/flat|unit|apartment/.test(n)) return 'flats';
  if (/resident|tenant|owner/.test(n)) return 'residents';
  if (/expense|cost/.test(n)) return 'expenses';
  return null;
}
