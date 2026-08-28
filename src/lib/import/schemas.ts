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
      aliases: ['name', 'building', 'buildingname', 'property', 'propertyname', 'buildingtitle', 'site', 'estate', 'complex', 'block', 'buildingno', 'projectname'], example: 'Sunset Tower' },
    { key: 'address', label: 'Address', type: 'string', required: false,
      aliases: ['address', 'location', 'addr', 'streetaddress', 'fulladdress', 'propertyaddress', 'buildingaddress', 'postaladdress', 'street', 'addressline1'], example: '123 Main St' },
    { key: 'totalFlats', label: 'Total Flats', type: 'number', required: false, defaultValue: 0,
      aliases: ['totalflats', 'units', 'unitcount', 'numberofunits', 'totalunits', 'noofunits', 'numunits', 'totalapartments', 'unittotal', 'apartmentcount'], example: '24' },
  ],
  matchKeyGroups: [['name']],
};

export const FLATS_DEF: ImportEntityDef = {
  key: 'flats',
  label: 'Flats / Units',
  description: 'One row per flat/unit. The building is matched by name.',
  fields: [
    { key: 'buildingRef', label: 'Building Name', type: 'string', required: true, refEntity: 'building',
      aliases: ['building', 'buildingname', 'property', 'propertyname', 'site', 'estate', 'block', 'buildingtitle'], example: 'Sunset Tower' },
    { key: 'unitNo', label: 'Unit No.', type: 'string', required: true,
      aliases: ['unitno', 'unit', 'unitnumber', 'flat', 'flatno', 'apt', 'apartment', 'aptno', 'suite', 'suiteno', 'door', 'doorno', 'housenumber', 'roomno', 'unitid', 'flatid', 'unitref'], example: 'A-3' },
    { key: 'floor', label: 'Floor', type: 'string', required: false,
      aliases: ['floor', 'level', 'flr', 'floorno', 'floorlevel', 'storey', 'story'], example: '3' },
    { key: 'occupancyStatus', label: 'Occupancy Status', type: 'enum', required: false, enumValues: ['occupied', 'vacant'], defaultValue: 'vacant',
      aliases: ['occupancystatus', 'status', 'occupancy', 'occupied', 'occupiedvacant', 'availability'], example: 'vacant' },
    { key: 'lifecycleStatus', label: 'Unit Status', type: 'enum', required: false, enumValues: ['active', 'under_renovation', 'inactive'], defaultValue: 'active',
      aliases: ['lifecyclestatus', 'unitstatus', 'condition', 'unitcondition', 'renovationstatus'], example: 'active' },
    { key: 'unitType', label: 'Unit Type', type: 'enum', required: false, enumValues: ['Studio', '1 Bedroom', '2 Bedroom', '3 Bedroom', '4+ Bedroom', 'Commercial', 'Other'],
      aliases: ['unittype', 'type', 'category', 'roomtype', 'flattype', 'layout'], example: '2 Bedroom' },
    { key: 'bedrooms', label: 'Bedrooms', type: 'number', required: false, aliases: ['bedrooms', 'beds', 'bhk', 'noofbedrooms', 'numbedrooms', 'bedroomcount'], example: '2' },
    { key: 'bathrooms', label: 'Bathrooms', type: 'number', required: false, aliases: ['bathrooms', 'baths', 'noofbathrooms', 'numbathrooms', 'bathroomcount', 'wc'], example: '1' },
    { key: 'sqft', label: 'Sq. Ft.', type: 'number', required: false, aliases: ['sqft', 'squarefeet', 'area', 'size', 'floorarea', 'carpetarea', 'squarefootage', 'sqm', 'squaremeters', 'unitsize'], example: '850' },
    { key: 'standardRent', label: 'Standard Rent', type: 'number', required: false, aliases: ['standardrent', 'rent', 'askingrent', 'baserent', 'monthlyrent', 'rentamount', 'listedrent', 'marketrent'], example: '1200' },
    { key: 'currency', label: 'Currency', type: 'string', required: false, defaultValue: 'USD', aliases: ['currency', 'curr', 'ccy', 'currencycode'], example: 'USD' },
    { key: 'parkingIncluded', label: 'Parking Included', type: 'boolean', required: false, defaultValue: false, aliases: ['parkingincluded', 'parking', 'hasparking', 'parkingavailable', 'includesparking'], example: 'No' },
    { key: 'storageIncluded', label: 'Storage Included', type: 'boolean', required: false, defaultValue: false, aliases: ['storageincluded', 'storage', 'hasstorage', 'storageavailable', 'includesstorage'], example: 'No' },
  ],
  matchKeyGroups: [['buildingId', 'unitNo']],
};

export const RESIDENTS_DEF: ImportEntityDef = {
  key: 'residents',
  label: 'Residents',
  description: 'One row per resident (tenant or owner). Building & flat are matched by name/unit.',
  fields: [
    { key: 'buildingRef', label: 'Building Name', type: 'string', required: true, refEntity: 'building',
      aliases: ['building', 'buildingname', 'property', 'propertyname', 'site', 'estate', 'block', 'buildingtitle'], example: 'Sunset Tower' },
    { key: 'flatRef', label: 'Unit No.', type: 'string', required: true, refEntity: 'flat',
      aliases: ['unitno', 'unit', 'flat', 'flatno', 'apt', 'apartment', 'aptno', 'suite', 'suiteno', 'door', 'doorno', 'unitref'], example: 'A-3' },
    { key: 'name', label: 'Resident Name', type: 'string', required: true,
      aliases: ['name', 'residentname', 'tenantname', 'fullname', 'occupantname', 'residentfullname', 'firstlastname', 'fullnamename', 'tenant'], example: 'Jane Doe' },
    { key: 'mobile', label: 'Mobile', type: 'string', required: false,
      aliases: ['mobile', 'phone', 'phonenumber', 'cell', 'contactnumber', 'tel', 'telephone', 'mobilenumber', 'cellphone', 'contact', 'phoneno', 'contactno', 'cellnumber'], example: '+1 555 0100' },
    { key: 'email', label: 'Email', type: 'string', required: false,
      aliases: ['email', 'emailaddress', 'emailid', 'mail', 'mailaddress', 'e-mail'], example: 'jane@example.com' },
    { key: 'type', label: 'Type', type: 'enum', required: false, enumValues: ['Tenant', 'Owner'], defaultValue: 'Tenant',
      aliases: ['type', 'residenttype', 'occupanttype', 'category'], example: 'Tenant' },
    { key: 'status', label: 'Status', type: 'enum', required: false, enumValues: ['current', 'former'], defaultValue: 'current',
      aliases: ['status', 'residentstatus', 'occupancystatus', 'currentstatus'], example: 'current' },
    { key: 'moveInDate', label: 'Move-In Date', type: 'date', required: false,
      aliases: ['moveindate', 'movein', 'startdate', 'movedate', 'occupancydate', 'movinginto', 'movingdate'], example: '2024-01-15' },
    { key: 'moveOutDate', label: 'Move-Out Date', type: 'date', required: false,
      aliases: ['moveoutdate', 'moveout', 'enddate', 'vacatedate', 'departuredate', 'movingout'], example: '' },
    { key: 'isBillingContact', label: 'Billing Contact', type: 'boolean', required: false, defaultValue: true,
      aliases: ['billingcontact', 'isbillingcontact', 'primarycontact', 'mainbillingcontact', 'billto'], example: 'Yes' },
    { key: 'idType', label: 'ID Type', type: 'string', required: false,
      aliases: ['idtype', 'identificationtype', 'documenttype', 'idkind'], example: 'Passport' },
    { key: 'idNumber', label: 'ID Number', type: 'string', required: false,
      aliases: ['idnumber', 'id', 'nationalid', 'ssn', 'passportnumber', 'idno', 'governmentid', 'identificationnumber', 'nid'], example: 'X1234567' },
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
      aliases: ['building', 'buildingname', 'property', 'propertyname', 'site', 'estate', 'block', 'buildingtitle'], example: 'Sunset Tower' },
    { key: 'flatRef', label: 'Unit No. (optional)', type: 'string', required: false, refEntity: 'flat',
      aliases: ['unitno', 'unit', 'flat', 'flatno', 'apt', 'apartment', 'unitref'], example: '' },
    { key: 'category', label: 'Category', type: 'string', required: true,
      aliases: ['category', 'type', 'expensecategory', 'expensetype', 'costcategory', 'billcategory'], example: 'Repairs & Maintenance' },
    { key: 'amount', label: 'Amount', type: 'number', required: true,
      aliases: ['amount', 'cost', 'total', 'expenseamount', 'value', 'sum', 'totalamount', 'billamount', 'expensevalue'], example: '150.00' },
    { key: 'vendor', label: 'Vendor', type: 'string', required: false,
      aliases: ['vendor', 'payee', 'paidto', 'supplier', 'contractor', 'company', 'paidtowhom', 'servicedby'], example: 'Ace Plumbing' },
    { key: 'date', label: 'Date', type: 'date', required: true,
      aliases: ['date', 'expensedate', 'transactiondate', 'billdate', 'invoicedate', 'paymentdate', 'datepaid'], example: '2024-03-01' },
    { key: 'notes', label: 'Notes', type: 'string', required: false,
      aliases: ['notes', 'description', 'memo', 'remarks', 'comment', 'comments', 'details'], example: '' },
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
      aliases: ['resident', 'residentname', 'tenant', 'tenantname', 'name', 'fullname', 'leaseholder', 'occupant', 'tenantfullname'], example: 'Jane Doe' },
    { key: 'leaseType', label: 'Lease Type', type: 'enum', required: false, enumValues: ['Fixed Term', 'Month-to-Month', 'Short-Term'], defaultValue: 'Fixed Term',
      aliases: ['leasetype', 'type', 'tenancytype', 'contracttype', 'agreementtype'], example: 'Fixed Term' },
    { key: 'leaseStart', label: 'Lease Start', type: 'date', required: true, aliases: ['leasestart', 'startdate', 'tenancystart', 'leasebegin', 'contractstart', 'leasestartdate'], example: '2024-01-01' },
    { key: 'leaseEnd', label: 'Lease End', type: 'date', required: false, aliases: ['leaseend', 'enddate', 'tenancyend', 'leaseexpiry', 'contractend', 'leaseenddate', 'expirydate'], example: '2024-12-31' },
    { key: 'moveIn', label: 'Move-In Date', type: 'date', required: true, aliases: ['movein', 'movindate', 'moveindate', 'movedate', 'occupancydate'], example: '2024-01-01' },
    { key: 'moveOut', label: 'Move-Out Date', type: 'date', required: false, aliases: ['moveout', 'moveoutdate', 'vacatedate', 'departuredate'], example: '' },
    { key: 'monthlyRent', label: 'Monthly Rent', type: 'number', required: true, aliases: ['monthlyrent', 'rent', 'rentamount', 'rentalamount', 'monthlyrentamount', 'baserent'], example: '1200' },
    { key: 'currency', label: 'Currency', type: 'string', required: false, defaultValue: 'USD', aliases: ['currency', 'curr', 'ccy', 'currencycode'], example: 'USD' },
    { key: 'deposit', label: 'Deposit', type: 'number', required: false, defaultValue: 0, aliases: ['deposit', 'securitydeposit', 'depositamount', 'securitydepositamount', 'bond'], example: '1200' },
    { key: 'paymentFrequency', label: 'Payment Frequency', type: 'enum', required: false, enumValues: ['Weekly', 'Monthly', 'Quarterly', 'Annually'], defaultValue: 'Monthly',
      aliases: ['paymentfrequency', 'frequency', 'billingfrequency', 'rentfrequency'], example: 'Monthly' },
    { key: 'occupancyStatus', label: 'Status', type: 'enum', required: false, enumValues: ['upcoming', 'active', 'ended'], defaultValue: 'active',
      aliases: ['status', 'occupancystatus', 'leasestatus', 'tenancystatus'], example: 'active' },
  ],
  matchKeyGroups: [['residentId', 'leaseStart']],
};

export const OWNERSHIPS_DEF: ImportEntityDef = {
  key: 'ownerships',
  label: 'Ownerships',
  description: 'One row per owner record. The resident is matched by full name - their building/flat come from that resident record.',
  fields: [
    { key: 'residentRef', label: 'Owner Name', type: 'string', required: true, refEntity: 'resident',
      aliases: ['resident', 'owner', 'ownername', 'name', 'fullname', 'ownerfullname', 'proprietor'], example: 'Jane Doe' },
    { key: 'status', label: 'Status', type: 'enum', required: false, enumValues: ['active', 'former'], defaultValue: 'active',
      aliases: ['status', 'ownershipstatus'], example: 'active' },
    { key: 'ownershipPct', label: 'Ownership %', type: 'number', required: true, aliases: ['ownershippct', 'percentage', 'share', 'ownershippercentage', 'stake', 'shareholding', 'equity'], example: '100' },
    { key: 'purchaseDate', label: 'Purchase Date', type: 'date', required: true, aliases: ['purchasedate', 'dateofpurchase', 'acquisitiondate', 'boughtdate'], example: '2020-06-01' },
    { key: 'ownershipType', label: 'Ownership Type', type: 'enum', required: false, enumValues: ['Sole', 'Joint', 'Corporate', 'Trust'], defaultValue: 'Sole',
      aliases: ['ownershiptype', 'titletype', 'holdingtype'], example: 'Sole' },
  ],
  matchKeyGroups: [['residentId', 'purchaseDate']],
};

export const CONTACTS_DEF: ImportEntityDef = {
  key: 'contacts',
  label: 'Additional Contacts',
  description: 'One row per secondary contact for a resident. The resident is matched by full name.',
  fields: [
    { key: 'residentRef', label: 'Resident Name', type: 'string', required: true, refEntity: 'resident',
      aliases: ['resident', 'residentname', 'tenant', 'tenantname', 'fullname', 'associatedresident'], example: 'Jane Doe' },
    { key: 'type', label: 'Contact Type', type: 'enum', required: false, enumValues: ['Personal', 'Business', 'Guarantor', 'Agent', 'Other'], defaultValue: 'Personal',
      aliases: ['type', 'contacttype', 'category', 'contactcategory'], example: 'Personal' },
    { key: 'name', label: 'Contact Name', type: 'string', required: true, aliases: ['name', 'contactname', 'fullname', 'contactfullname', 'personname'], example: 'John Doe' },
    { key: 'email', label: 'Email', type: 'string', required: false, aliases: ['email', 'emailaddress', 'emailid', 'mail'], example: '' },
    { key: 'phone', label: 'Phone', type: 'string', required: false, aliases: ['phone', 'mobile', 'phonenumber', 'contactnumber', 'tel', 'telephone', 'cell'], example: '' },
    { key: 'relationship', label: 'Relationship', type: 'string', required: false, aliases: ['relationship', 'relation', 'relationtoresident', 'relationtotenant'], example: 'Spouse' },
    { key: 'preferred', label: 'Preferred', type: 'boolean', required: false, defaultValue: false, aliases: ['preferred', 'ispreferred', 'primary'], example: 'No' },
  ],
  matchKeyGroups: [['residentId', 'name']],
};

export const EMERGENCY_CONTACTS_DEF: ImportEntityDef = {
  key: 'emergencyContacts',
  label: 'Emergency Contacts',
  description: 'One row per emergency contact for a resident. The resident is matched by full name.',
  fields: [
    { key: 'residentRef', label: 'Resident Name', type: 'string', required: true, refEntity: 'resident',
      aliases: ['resident', 'residentname', 'tenant', 'tenantname', 'fullname', 'associatedresident'], example: 'Jane Doe' },
    { key: 'name', label: 'Contact Name', type: 'string', required: true, aliases: ['name', 'contactname', 'fullname', 'contactfullname', 'personname'], example: 'John Doe' },
    { key: 'relationship', label: 'Relationship', type: 'string', required: true, aliases: ['relationship', 'relation', 'relationtoresident'], example: 'Spouse' },
    { key: 'phone', label: 'Phone', type: 'string', required: true, aliases: ['phone', 'mobile', 'phonenumber', 'contactnumber', 'tel', 'telephone', 'cell'], example: '+1 555 0100' },
    { key: 'email', label: 'Email', type: 'string', required: false, aliases: ['email', 'emailaddress', 'emailid', 'mail'], example: '' },
    { key: 'isPrimary', label: 'Primary', type: 'boolean', required: false, defaultValue: false, aliases: ['isprimary', 'primary', 'primarycontact', 'mainemergencycontact'], example: 'Yes' },
  ],
  matchKeyGroups: [['residentId', 'name']],
};

export const VEHICLES_DEF: ImportEntityDef = {
  key: 'vehicles',
  label: 'Vehicles',
  description: 'One row per vehicle. The resident is matched by full name.',
  fields: [
    { key: 'residentRef', label: 'Resident Name', type: 'string', required: true, refEntity: 'resident',
      aliases: ['resident', 'residentname', 'tenant', 'tenantname', 'fullname', 'owner', 'vehicleowner'], example: 'Jane Doe' },
    { key: 'type', label: 'Vehicle Type', type: 'enum', required: false, enumValues: ['Car', 'Motorcycle', 'Truck', 'Van', 'Bicycle', 'Other'], defaultValue: 'Car',
      aliases: ['type', 'vehicletype', 'category', 'vehiclecategory'], example: 'Car' },
    { key: 'make', label: 'Make', type: 'string', required: false, aliases: ['make', 'manufacturer', 'brand'], example: 'Toyota' },
    { key: 'model', label: 'Model', type: 'string', required: false, aliases: ['model', 'vehiclemodel'], example: 'Camry' },
    { key: 'year', label: 'Year', type: 'number', required: false, aliases: ['year', 'modelyear', 'yearofmanufacture'], example: '2020' },
    { key: 'plate', label: 'License Plate', type: 'string', required: true, aliases: ['plate', 'licenseplate', 'platenumber', 'regno', 'registrationnumber', 'licenseno', 'plateno', 'licenseplatenumber', 'numberplate'], example: 'ABC-1234' },
    { key: 'state', label: 'State/Province', type: 'string', required: false, aliases: ['state', 'province', 'region', 'regstate'], example: '' },
    { key: 'status', label: 'Status', type: 'enum', required: false, enumValues: ['active', 'inactive'], defaultValue: 'active',
      aliases: ['status', 'vehiclestatus'], example: 'active' },
  ],
  matchKeyGroups: [['residentId', 'plate']],
};

export const PARKING_SPACES_DEF: ImportEntityDef = {
  key: 'parkingSpaces',
  label: 'Parking Spaces',
  description: 'One row per parking space. Building is matched by name; resident (if assigned) is matched by full name.',
  fields: [
    { key: 'buildingRef', label: 'Building Name', type: 'string', required: true, refEntity: 'building',
      aliases: ['building', 'buildingname', 'property', 'propertyname', 'site', 'block'], example: 'Sunset Tower' },
    { key: 'residentRef', label: 'Assigned Resident (optional)', type: 'string', required: false, refEntity: 'resident',
      aliases: ['resident', 'residentname', 'assignedto', 'assignedresident', 'assignee', 'tenant', 'owner'], example: '' },
    { key: 'spaceNumber', label: 'Space Number', type: 'string', required: true, aliases: ['spacenumber', 'space', 'spotnumber', 'parkingno', 'baynumber', 'parkingspaceno', 'spaceid', 'lotnumber'], example: 'P-12' },
    { key: 'type', label: 'Type', type: 'enum', required: false, enumValues: ['Covered', 'Uncovered', 'Garage', 'Street'], defaultValue: 'Uncovered',
      aliases: ['type', 'parkingtype', 'category', 'spacetype'], example: 'Covered' },
    { key: 'assignedDate', label: 'Assigned Date', type: 'date', required: false, aliases: ['assigneddate', 'dateassigned', 'allocationdate'], example: '' },
    { key: 'status', label: 'Status', type: 'enum', required: false, enumValues: ['assigned', 'vacant', 'reserved'], defaultValue: 'vacant',
      aliases: ['status', 'parkingstatus'], example: 'vacant' },
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
