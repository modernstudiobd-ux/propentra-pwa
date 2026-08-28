// Declarative field definitions for every entity the Import Wizard can
// bring data into. Adding a new importable entity later means adding one
// more ImportEntityDef here - the parsing/mapping/validation/dedupe/commit
// engine (see engine.ts) is entirely generic and reads these definitions.

export type ImportFieldType = 'string' | 'number' | 'date' | 'boolean' | 'enum';
export type ImportEntityKey = 'buildings' | 'flats' | 'residents' | 'expenses' | 'tenancies' | 'ownerships' | 'contacts' | 'emergencyContacts' | 'vehicles' | 'parkingSpaces';

export interface ImportFieldDef {
  key: string; // becomes the DB field name, EXCEPT for keys ending in "Ref" -
               // see refFieldTarget() in engine.ts, which maps e.g.
               // "buildingRef" -> "buildingId" once the reference is resolved.
  label: string;
  type: ImportFieldType;
  required: boolean;
  enumValues?: readonly string[];
  defaultValue?: any;
  refEntity?: 'building' | 'flat' | 'resident'; // this column's text must resolve to another entity's id
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
    { key: 'occupancyStatus', label: 'Occupancy Status', type: 'enum', required: false, enumValues: ['occupied', 'vacant'], defaultValue: 'vacant',
      aliases: ['occupancystatus', 'status', 'occupancy'], example: 'vacant' },
    { key: 'lifecycleStatus', label: 'Unit Status', type: 'enum', required: false, enumValues: ['active', 'under_renovation', 'inactive'], defaultValue: 'active',
      aliases: ['lifecyclestatus', 'unitstatus'], example: 'active' },
    { key: 'unitType', label: 'Unit Type', type: 'enum', required: false, enumValues: ['Studio', '1 Bedroom', '2 Bedroom', '3 Bedroom', '4+ Bedroom', 'Commercial', 'Other'],
      aliases: ['unittype', 'type'], example: '2 Bedroom' },
    { key: 'bedrooms', label: 'Bedrooms', type: 'number', required: false, aliases: ['bedrooms', 'beds'], example: '2' },
    { key: 'bathrooms', label: 'Bathrooms', type: 'number', required: false, aliases: ['bathrooms', 'baths'], example: '1' },
    { key: 'sqft', label: 'Sq. Ft.', type: 'number', required: false, aliases: ['sqft', 'squarefeet', 'area'], example: '850' },
    { key: 'standardRent', label: 'Standard Rent', type: 'number', required: false, aliases: ['standardrent', 'rent', 'askingrent'], example: '1200' },
    { key: 'currency', label: 'Currency', type: 'string', required: false, defaultValue: 'USD', aliases: ['currency'], example: 'USD' },
    { key: 'parkingIncluded', label: 'Parking Included', type: 'boolean', required: false, defaultValue: false, aliases: ['parkingincluded', 'parking'], example: 'No' },
    { key: 'storageIncluded', label: 'Storage Included', type: 'boolean', required: false, defaultValue: false, aliases: ['storageincluded', 'storage'], example: 'No' },
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

export const TENANCIES_DEF: ImportEntityDef = {
  key: 'tenancies',
  label: 'Tenancies',
  description: 'One row per lease. The resident is matched by full name - their building/flat come from that resident record.',
  fields: [
    { key: 'residentRef', label: 'Resident Name', type: 'string', required: true, refEntity: 'resident',
      aliases: ['resident', 'residentname', 'tenant', 'tenantname', 'name'], example: 'Jane Doe' },
    { key: 'leaseType', label: 'Lease Type', type: 'enum', required: false, enumValues: ['Fixed Term', 'Month-to-Month', 'Short-Term'], defaultValue: 'Fixed Term',
      aliases: ['leasetype', 'type'], example: 'Fixed Term' },
    { key: 'leaseStart', label: 'Lease Start', type: 'date', required: true, aliases: ['leasestart', 'startdate'], example: '2024-01-01' },
    { key: 'leaseEnd', label: 'Lease End', type: 'date', required: false, aliases: ['leaseend', 'enddate'], example: '2024-12-31' },
    { key: 'moveIn', label: 'Move-In Date', type: 'date', required: true, aliases: ['movein', 'movindate'], example: '2024-01-01' },
    { key: 'moveOut', label: 'Move-Out Date', type: 'date', required: false, aliases: ['moveout', 'moveoutdate'], example: '' },
    { key: 'monthlyRent', label: 'Monthly Rent', type: 'number', required: true, aliases: ['monthlyrent', 'rent'], example: '1200' },
    { key: 'currency', label: 'Currency', type: 'string', required: false, defaultValue: 'USD', aliases: ['currency'], example: 'USD' },
    { key: 'deposit', label: 'Deposit', type: 'number', required: false, defaultValue: 0, aliases: ['deposit', 'securitydeposit'], example: '1200' },
    { key: 'paymentFrequency', label: 'Payment Frequency', type: 'enum', required: false, enumValues: ['Weekly', 'Monthly', 'Quarterly', 'Annually'], defaultValue: 'Monthly',
      aliases: ['paymentfrequency', 'frequency'], example: 'Monthly' },
    { key: 'occupancyStatus', label: 'Status', type: 'enum', required: false, enumValues: ['upcoming', 'active', 'ended'], defaultValue: 'active',
      aliases: ['status', 'occupancystatus'], example: 'active' },
  ],
  matchKeyGroups: [['residentId', 'leaseStart']],
};

export const OWNERSHIPS_DEF: ImportEntityDef = {
  key: 'ownerships',
  label: 'Ownerships',
  description: 'One row per owner record. The resident is matched by full name - their building/flat come from that resident record.',
  fields: [
    { key: 'residentRef', label: 'Owner Name', type: 'string', required: true, refEntity: 'resident',
      aliases: ['resident', 'owner', 'ownername', 'name'], example: 'Jane Doe' },
    { key: 'status', label: 'Status', type: 'enum', required: false, enumValues: ['active', 'former'], defaultValue: 'active',
      aliases: ['status'], example: 'active' },
    { key: 'ownershipPct', label: 'Ownership %', type: 'number', required: true, aliases: ['ownershippct', 'percentage', 'share'], example: '100' },
    { key: 'purchaseDate', label: 'Purchase Date', type: 'date', required: true, aliases: ['purchasedate'], example: '2020-06-01' },
    { key: 'ownershipType', label: 'Ownership Type', type: 'enum', required: false, enumValues: ['Sole', 'Joint', 'Corporate', 'Trust'], defaultValue: 'Sole',
      aliases: ['ownershiptype'], example: 'Sole' },
  ],
  matchKeyGroups: [['residentId', 'purchaseDate']],
};

export const CONTACTS_DEF: ImportEntityDef = {
  key: 'contacts',
  label: 'Additional Contacts',
  description: 'One row per secondary contact for a resident. The resident is matched by full name.',
  fields: [
    { key: 'residentRef', label: 'Resident Name', type: 'string', required: true, refEntity: 'resident',
      aliases: ['resident', 'residentname'], example: 'Jane Doe' },
    { key: 'type', label: 'Contact Type', type: 'enum', required: false, enumValues: ['Personal', 'Business', 'Guarantor', 'Agent', 'Other'], defaultValue: 'Personal',
      aliases: ['type', 'contacttype'], example: 'Personal' },
    { key: 'name', label: 'Contact Name', type: 'string', required: true, aliases: ['name', 'contactname'], example: 'John Doe' },
    { key: 'email', label: 'Email', type: 'string', required: false, aliases: ['email'], example: '' },
    { key: 'phone', label: 'Phone', type: 'string', required: false, aliases: ['phone'], example: '' },
    { key: 'relationship', label: 'Relationship', type: 'string', required: false, aliases: ['relationship'], example: 'Spouse' },
    { key: 'preferred', label: 'Preferred', type: 'boolean', required: false, defaultValue: false, aliases: ['preferred'], example: 'No' },
  ],
  matchKeyGroups: [['residentId', 'name']],
};

export const EMERGENCY_CONTACTS_DEF: ImportEntityDef = {
  key: 'emergencyContacts',
  label: 'Emergency Contacts',
  description: 'One row per emergency contact for a resident. The resident is matched by full name.',
  fields: [
    { key: 'residentRef', label: 'Resident Name', type: 'string', required: true, refEntity: 'resident',
      aliases: ['resident', 'residentname'], example: 'Jane Doe' },
    { key: 'name', label: 'Contact Name', type: 'string', required: true, aliases: ['name', 'contactname'], example: 'John Doe' },
    { key: 'relationship', label: 'Relationship', type: 'string', required: true, aliases: ['relationship'], example: 'Spouse' },
    { key: 'phone', label: 'Phone', type: 'string', required: true, aliases: ['phone'], example: '+1 555 0100' },
    { key: 'email', label: 'Email', type: 'string', required: false, aliases: ['email'], example: '' },
    { key: 'isPrimary', label: 'Primary', type: 'boolean', required: false, defaultValue: false, aliases: ['isprimary', 'primary'], example: 'Yes' },
  ],
  matchKeyGroups: [['residentId', 'name']],
};

export const VEHICLES_DEF: ImportEntityDef = {
  key: 'vehicles',
  label: 'Vehicles',
  description: 'One row per vehicle. The resident is matched by full name.',
  fields: [
    { key: 'residentRef', label: 'Resident Name', type: 'string', required: true, refEntity: 'resident',
      aliases: ['resident', 'residentname'], example: 'Jane Doe' },
    { key: 'type', label: 'Vehicle Type', type: 'enum', required: false, enumValues: ['Car', 'Motorcycle', 'Truck', 'Van', 'Bicycle', 'Other'], defaultValue: 'Car',
      aliases: ['type', 'vehicletype'], example: 'Car' },
    { key: 'make', label: 'Make', type: 'string', required: false, aliases: ['make'], example: 'Toyota' },
    { key: 'model', label: 'Model', type: 'string', required: false, aliases: ['model'], example: 'Camry' },
    { key: 'year', label: 'Year', type: 'number', required: false, aliases: ['year'], example: '2020' },
    { key: 'plate', label: 'License Plate', type: 'string', required: true, aliases: ['plate', 'licenseplate', 'platenumber'], example: 'ABC-1234' },
    { key: 'state', label: 'State/Province', type: 'string', required: false, aliases: ['state', 'province'], example: '' },
    { key: 'status', label: 'Status', type: 'enum', required: false, enumValues: ['active', 'inactive'], defaultValue: 'active',
      aliases: ['status'], example: 'active' },
  ],
  matchKeyGroups: [['residentId', 'plate']],
};

export const PARKING_SPACES_DEF: ImportEntityDef = {
  key: 'parkingSpaces',
  label: 'Parking Spaces',
  description: 'One row per parking space. Building is matched by name; resident (if assigned) is matched by full name.',
  fields: [
    { key: 'buildingRef', label: 'Building Name', type: 'string', required: true, refEntity: 'building',
      aliases: ['building', 'buildingname'], example: 'Sunset Tower' },
    { key: 'residentRef', label: 'Assigned Resident (optional)', type: 'string', required: false, refEntity: 'resident',
      aliases: ['resident', 'residentname', 'assignedto'], example: '' },
    { key: 'spaceNumber', label: 'Space Number', type: 'string', required: true, aliases: ['spacenumber', 'space', 'spotnumber'], example: 'P-12' },
    { key: 'type', label: 'Type', type: 'enum', required: false, enumValues: ['Covered', 'Uncovered', 'Garage', 'Street'], defaultValue: 'Uncovered',
      aliases: ['type', 'parkingtype'], example: 'Covered' },
    { key: 'assignedDate', label: 'Assigned Date', type: 'date', required: false, aliases: ['assigneddate'], example: '' },
    { key: 'status', label: 'Status', type: 'enum', required: false, enumValues: ['assigned', 'vacant', 'reserved'], defaultValue: 'vacant',
      aliases: ['status'], example: 'vacant' },
  ],
  matchKeyGroups: [['buildingId', 'spaceNumber']],
};

export const IMPORT_ENTITIES: Record<ImportEntityKey, ImportEntityDef> = {
  buildings: BUILDINGS_DEF,
  flats: FLATS_DEF,
  residents: RESIDENTS_DEF,
  expenses: EXPENSES_DEF,
  tenancies: TENANCIES_DEF,
  ownerships: OWNERSHIPS_DEF,
  contacts: CONTACTS_DEF,
  emergencyContacts: EMERGENCY_CONTACTS_DEF,
  vehicles: VEHICLES_DEF,
  parkingSpaces: PARKING_SPACES_DEF,
};

export const IMPORT_ENTITY_ORDER: ImportEntityKey[] = [
  'buildings', 'flats', 'residents', 'expenses', 'tenancies', 'ownerships', 'contacts', 'emergencyContacts', 'vehicles', 'parkingSpaces',
];

/** Lowercase, alphanumeric-only form used to fuzzily compare header text, entity/building/unit names, etc. */
export function normalizeHeader(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** Best-guess entity for a sheet, based on its tab name. Returns null if nothing matches (user picks manually). */
export function guessEntityFromSheetName(name: string): ImportEntityKey | null {
  const n = normalizeHeader(name);
  if (/tenanc|lease/.test(n)) return 'tenancies';
  if (/ownership|owner/.test(n)) return 'ownerships';
  if (/emergency/.test(n)) return 'emergencyContacts';
  if (/contact/.test(n)) return 'contacts';
  if (/vehicle|car/.test(n)) return 'vehicles';
  if (/parking/.test(n)) return 'parkingSpaces';
  if (/building|propert/.test(n)) return 'buildings';
  if (/flat|unit|apartment/.test(n)) return 'flats';
  if (/resident|tenant|owner/.test(n)) return 'residents';
  if (/expense|cost/.test(n)) return 'expenses';
  return null;
}
