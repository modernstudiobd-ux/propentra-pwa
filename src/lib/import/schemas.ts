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
  /** Extra input variants that should resolve to one of `enumValues`, keyed by lowercased raw cell text (e.g. `{ 'flat owner': 'Owner' }`). Lets a role/category field recognize a real-world sheet's own wording without silently falling back to `defaultValue` and mislabeling the row. */
  synonyms?: Record<string, string>;
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
    { key: 'addressLine2', label: 'Address Line 2', type: 'string', required: false,
      aliases: ['addressline2', 'address2', 'suite', 'buildingaddress2'], example: '' },
    { key: 'locality', label: 'City', type: 'string', required: false,
      aliases: ['city', 'locality', 'town', 'municipality'], example: 'Springfield' },
    { key: 'adminArea', label: 'State/Province', type: 'string', required: false,
      aliases: ['state', 'province', 'stateprovince', 'region', 'adminarea'], example: 'IL' },
    { key: 'postalCode', label: 'ZIP/Postal Code', type: 'string', required: false,
      aliases: ['zip', 'zipcode', 'postalcode', 'postcode', 'zippostalcode'], example: '62704' },
    { key: 'countryCode', label: 'Country', type: 'string', required: false,
      aliases: ['country', 'countrycode', 'nation'], example: 'US' },
    { key: 'propertyType', label: 'Property Type', type: 'string', required: false,
      aliases: ['propertytype', 'buildingtype'], example: 'Apartment Building' },
    { key: 'status', label: 'Building Status', type: 'enum', required: false, enumValues: ['active', 'inactive', 'under_construction'], defaultValue: 'active',
      aliases: ['buildingstatus', 'status'], example: 'active' },
    { key: 'totalFlats', label: 'Total Flats', type: 'number', required: false, defaultValue: 0,
      aliases: ['totalflats', 'units', 'unitcount', 'numberofunits', 'totalunits', 'noofunits', 'numunits', 'totalapartments', 'unittotal', 'apartmentcount'], example: '24' },
    { key: 'externalId', label: 'Source ID (optional)', type: 'string', required: false,
      aliases: ['propertyid', 'buildingid', 'sourceid', 'externalid', 'recordid'], example: '' },
  ],
  // Matching by the file's own ID column (when present) is far more
  // reliable than matching by name, so it's tried first.
  matchKeyGroups: [['externalId'], ['name']],
};

export const FLATS_DEF: ImportEntityDef = {
  key: 'flats',
  label: 'Flats / Units',
  description: 'One row per flat/unit. The building is matched by name.',
  fields: [
    { key: 'buildingRef', label: 'Building Name', type: 'string', required: true, refEntity: 'building',
      aliases: ['buildingname', 'propertyname', 'buildingtitle', 'propertyid', 'buildingid'], example: 'Sunset Tower' },
    { key: 'unitNo', label: 'Unit No.', type: 'string', required: true,
      aliases: ['unitno', 'unit', 'unitnumber', 'flat', 'flatno', 'apt', 'apartment', 'aptno', 'suite', 'suiteno', 'door', 'doorno', 'housenumber', 'roomno', 'unitref'], example: 'A-3' },
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
    { key: 'externalId', label: 'Source ID (optional)', type: 'string', required: false,
      aliases: ['unitid', 'sourceid', 'externalid', 'recordid'], example: '' },
  ],
  matchKeyGroups: [['externalId'], ['buildingId', 'unitNo']],
};

export const RESIDENTS_DEF: ImportEntityDef = {
  key: 'residents',
  label: 'Residents',
  description: 'One row per resident (tenant or owner). Building & flat are matched by name/unit - leave them unmapped if a separate Tenancy/Ownership sheet in the same file already states each person\'s unit.',
  fields: [
    { key: 'buildingRef', label: 'Building Name (optional)', type: 'string', required: false, refEntity: 'building',
      aliases: ['buildingname', 'propertyname', 'buildingtitle', 'propertyid', 'buildingid'], example: 'Sunset Tower' },
    { key: 'flatRef', label: 'Unit No. (optional)', type: 'string', required: false, refEntity: 'flat',
      aliases: ['unitno', 'unit', 'flat', 'flatno', 'apt', 'apartment', 'aptno', 'suite', 'suiteno', 'door', 'doorno', 'unitref'], example: 'A-3' },
    { key: 'firstName', label: 'First Name', type: 'string', required: false,
      aliases: ['firstname', 'fname', 'givenname'], example: 'Jane' },
    { key: 'middleName', label: 'Middle Name', type: 'string', required: false,
      aliases: ['middlename', 'mname'], example: '' },
    { key: 'lastName', label: 'Last Name', type: 'string', required: false,
      aliases: ['lastname', 'lname', 'surname', 'familyname'], example: 'Doe' },
    { key: 'preferredName', label: 'Preferred Name', type: 'string', required: false,
      aliases: ['preferredname', 'nickname', 'goesby'], example: '' },
    // If this isn't mapped to its own column, it's automatically composed
    // from First/Middle/Last Name below - see buildProcessedRows in engine.ts.
    { key: 'name', label: 'Resident Name', type: 'string', required: true,
      aliases: ['name', 'residentname', 'tenantname', 'fullname', 'occupantname', 'residentfullname', 'firstlastname', 'fullnamename', 'tenant'], example: 'Jane Doe' },
    { key: 'companyName', label: 'Company Name', type: 'string', required: false,
      aliases: ['companyname', 'organization', 'businessname', 'corporatename'], example: '' },
    { key: 'mobile', label: 'Mobile', type: 'string', required: false,
      aliases: ['mobile', 'phone', 'phonenumber', 'cell', 'contactnumber', 'tel', 'telephone', 'mobilenumber', 'cellphone', 'contact', 'phoneno', 'contactno', 'cellnumber'], example: '+1 555 0100' },
    { key: 'altPhone', label: 'Alternate Phone', type: 'string', required: false,
      aliases: ['alternatephone', 'altphone', 'secondaryphone', 'otherphone'], example: '' },
    { key: 'email', label: 'Email', type: 'string', required: false,
      aliases: ['email', 'emailaddress', 'emailid', 'mail', 'mailaddress', 'e-mail'], example: 'jane@example.com' },
    { key: 'preferredContactMethod', label: 'Preferred Contact Method', type: 'enum', required: false, enumValues: ['Mobile', 'Email', 'WhatsApp', 'Mail'],
      aliases: ['preferredcontactmethod', 'contactmethod', 'preferredcontact'], example: 'Email' },
    // Fields with a specific, exact-matching header name are listed ahead of
    // the generic Type/Status fields below - both of those also match any
    // header merely containing the word "status" via word-overlap, so a
    // more specific field (e.g. "Consent Status") must claim its header
    // first or the generic field would grab it by mistake.
    { key: 'dob', label: 'Date of Birth', type: 'date', required: false,
      aliases: ['dateofbirth', 'dob', 'birthdate'], example: '' },
    { key: 'nationality', label: 'Nationality', type: 'string', required: false,
      aliases: ['nationality', 'citizenship'], example: '' },
    { key: 'language', label: 'Preferred Language', type: 'string', required: false,
      aliases: ['preferredlanguage', 'language'], example: '' },
    { key: 'idType', label: 'ID Type', type: 'string', required: false,
      aliases: ['idtype', 'identificationtype', 'documenttype', 'idkind'], example: 'Passport' },
    { key: 'idNumber', label: 'ID Number', type: 'string', required: false,
      aliases: ['idnumber', 'id', 'nationalid', 'ssn', 'passportnumber', 'idno', 'governmentid', 'identificationnumber', 'nid'], example: 'X1234567' },
    { key: 'taxLegalName', label: 'Tax/Legal Name', type: 'string', required: false,
      aliases: ['taxlegalname', 'legalname'], example: '' },
    { key: 'taxIdType', label: 'Tax ID Type', type: 'string', required: false,
      aliases: ['taxidtype'], example: '' },
    { key: 'taxIdLast4', label: 'Tax ID Last 4', type: 'string', required: false,
      aliases: ['taxidlast4', 'taxidlastfour'], example: '' },
    { key: 'consentStatus', label: 'Consent Status', type: 'enum', required: false, enumValues: ['granted', 'declined', 'not_asked'],
      aliases: ['consentstatus', 'dataconsentstatus'], example: 'granted' },
    { key: 'marketingConsent', label: 'Marketing Consent', type: 'boolean', required: false,
      aliases: ['marketingconsent'], example: 'No' },
    { key: 'dataProcessingConsent', label: 'Data Processing Consent', type: 'boolean', required: false,
      aliases: ['dataprocessingconsent'], example: '' },
    { key: 'type', label: 'Type', type: 'enum', required: false, enumValues: ['Tenant', 'Owner'], defaultValue: 'Tenant',
      aliases: ['type', 'residenttype', 'persontype', 'occupanttype', 'category'],
      // Real-world sheets label this column all sorts of ways ("Flat Owner",
      // "Homeowner", "Renter"...) - without this, any spelling the two exact
      // enum values don't cover would silently fall back to defaultValue
      // ('Tenant'), quietly mislabeling every owner row as a tenant instead
      // of surfacing a mapping problem.
      synonyms: {
        'flat owner': 'Owner', 'property owner': 'Owner', 'unit owner': 'Owner', 'homeowner': 'Owner',
        'landlord': 'Owner', 'proprietor': 'Owner', 'owner-occupant': 'Owner', 'owner occupant': 'Owner',
        'renter': 'Tenant', 'lessee': 'Tenant', 'occupant': 'Tenant', 'leaseholder': 'Tenant',
      },
      example: 'Tenant' },
    // Independent role flags - a person can be a Resident, an Owner, or
    // both at once (ownership never implies residency). When mapped, these
    // take priority over the legacy `type` column above; when left
    // unmapped, the commit step derives them from `type` for backward
    // compatibility with a workbook that only ever had a single Type
    // column (see engine.ts). A sheet with no Type column at all (e.g. a
    // pure "Owners" tab) should set a manual/fixed value for `type` (or
    // for `isOwner`) during mapping so every row imports with the correct
    // role instead of silently defaulting to Tenant.
    { key: 'isResident', label: 'Is Resident (optional)', type: 'boolean', required: false,
      aliases: ['isresident', 'resident', 'liveshere', 'occupiesunit'], example: '' },
    { key: 'isOwner', label: 'Is Owner (optional)', type: 'boolean', required: false,
      aliases: ['isowner', 'owner', 'ownerflag'], example: '' },
    { key: 'status', label: 'Status', type: 'enum', required: false, enumValues: ['current', 'former'], defaultValue: 'current',
      aliases: ['status', 'residentstatus', 'currentstatus', 'occupancystatus'], example: 'current' },
    { key: 'moveInDate', label: 'Move-In Date', type: 'date', required: false,
      aliases: ['moveindate', 'movein', 'startdate', 'movedate', 'occupancydate', 'movinginto', 'movingdate'], example: '2024-01-15' },
    { key: 'moveOutDate', label: 'Move-Out Date', type: 'date', required: false,
      aliases: ['moveoutdate', 'moveout', 'enddate', 'vacatedate', 'departuredate', 'movingout'], example: '' },
    { key: 'isBillingContact', label: 'Billing Contact', type: 'boolean', required: false, defaultValue: true,
      aliases: ['billingcontact', 'isbillingcontact', 'primarycontact', 'mainbillingcontact', 'billto'], example: 'Yes' },
    { key: 'externalId', label: 'Source ID (optional)', type: 'string', required: false,
      aliases: ['personid', 'residentid', 'sourceid', 'externalid', 'recordid'], example: '' },
  ],
  // Matching priority: the file's own ID column, then a government ID
  // number, then normalized phone, then normalized email (all far more
  // reliable than name alone - and normalized specially, not with generic
  // header-normalization, since that would strip meaningful punctuation
  // out of an email/phone - see normalizeMatchValue in import/engine.ts),
  // finally falling back to building + flat + name for files with none of
  // those.
  matchKeyGroups: [['externalId'], ['idNumber'], ['mobile'], ['email'], ['buildingId', 'flatId', 'name']],
};

export const EXPENSES_DEF: ImportEntityDef = {
  key: 'expenses',
  label: 'Expenses',
  description: 'One row per expense transaction. Building is matched by name.',
  fields: [
    { key: 'displayId', label: 'Expense ID (optional)', type: 'string', required: false,
      aliases: ['expenseid', 'id', 'recordid', 'sourceid'], example: '' },
    { key: 'buildingRef', label: 'Building Name', type: 'string', required: true, refEntity: 'building',
      aliases: ['buildingname', 'propertyname', 'buildingtitle', 'propertyid', 'buildingid'], example: 'Sunset Tower' },
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
  description: 'One row per lease. The resident is matched by name or ID. Building/Unit are optional - map them if the sheet has its own Property/Unit ID columns, otherwise they\'re taken from the matched resident\'s record.',
  fields: [
    { key: 'displayId', label: 'Tenancy ID (optional)', type: 'string', required: false,
      aliases: ['tenancyid', 'id', 'recordid', 'sourceid'], example: '' },
    { key: 'residentRef', label: 'Resident Name', type: 'string', required: true, refEntity: 'resident',
      aliases: ['resident', 'residentname', 'tenant', 'tenantname', 'name', 'fullname', 'leaseholder', 'occupant', 'tenantfullname', 'personid', 'residentid'], example: 'Jane Doe' },
    { key: 'buildingRef', label: 'Building (optional)', type: 'string', required: false, refEntity: 'building',
      aliases: ['propertyid', 'buildingid', 'buildingname', 'propertyname'], example: '' },
    { key: 'flatRef', label: 'Unit (optional)', type: 'string', required: false, refEntity: 'flat',
      aliases: ['unitid', 'unitno', 'unit', 'flat', 'flatno', 'apt', 'apartment'], example: '' },
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
  description: 'One row per owner record. The resident is matched by name or ID. Building/Unit are optional - map them if the sheet has its own Property/Unit ID columns, otherwise they\'re taken from the matched resident\'s record.',
  fields: [
    { key: 'displayId', label: 'Ownership ID (optional)', type: 'string', required: false,
      aliases: ['ownershipid', 'id', 'recordid', 'sourceid'], example: '' },
    { key: 'residentRef', label: 'Owner Name', type: 'string', required: true, refEntity: 'resident',
      aliases: ['resident', 'owner', 'ownername', 'name', 'fullname', 'ownerfullname', 'proprietor', 'personid', 'residentid', 'ownerid'], example: 'Jane Doe' },
    { key: 'buildingRef', label: 'Building (optional)', type: 'string', required: false, refEntity: 'building',
      aliases: ['propertyid', 'buildingid', 'buildingname', 'propertyname'], example: '' },
    { key: 'flatRef', label: 'Unit (optional)', type: 'string', required: false, refEntity: 'flat',
      aliases: ['unitid', 'unitno', 'unit', 'flat', 'flatno', 'apt', 'apartment'], example: '' },
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
    { key: 'displayId', label: 'Contact ID (optional)', type: 'string', required: false,
      aliases: ['contactid', 'id', 'recordid', 'sourceid'], example: '' },
    { key: 'residentRef', label: 'Resident Name', type: 'string', required: true, refEntity: 'resident',
      aliases: ['resident', 'residentname', 'tenant', 'tenantname', 'fullname', 'associatedresident', 'personid', 'residentid'], example: 'Jane Doe' },
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
    { key: 'displayId', label: 'Emergency Contact ID (optional)', type: 'string', required: false,
      aliases: ['emergencycontactid', 'id', 'recordid', 'sourceid'], example: '' },
    { key: 'residentRef', label: 'Resident Name', type: 'string', required: true, refEntity: 'resident',
      aliases: ['resident', 'residentname', 'tenant', 'tenantname', 'fullname', 'associatedresident', 'personid', 'residentid'], example: 'Jane Doe' },
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
    { key: 'displayId', label: 'Vehicle ID (optional)', type: 'string', required: false,
      aliases: ['vehicleid', 'id', 'recordid', 'sourceid'], example: '' },
    { key: 'residentRef', label: 'Resident Name', type: 'string', required: true, refEntity: 'resident',
      aliases: ['resident', 'residentname', 'tenant', 'tenantname', 'fullname', 'owner', 'vehicleowner', 'personid', 'residentid'], example: 'Jane Doe' },
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
  description: 'One row per parking space. Building is matched by name or ID (or taken from the matched unit, if the sheet only has a Unit ID); resident (if assigned) is matched by name or ID.',
  fields: [
    { key: 'displayId', label: 'Parking ID (optional)', type: 'string', required: false,
      aliases: ['parkingid', 'id', 'recordid', 'sourceid'], example: '' },
    { key: 'buildingRef', label: 'Building (optional)', type: 'string', required: false, refEntity: 'building',
      aliases: ['buildingname', 'propertyname', 'propertyid', 'buildingid'], example: 'Sunset Tower' },
    { key: 'flatRef', label: 'Unit (optional)', type: 'string', required: false, refEntity: 'flat',
      aliases: ['unitid', 'unitno', 'unit', 'flat', 'flatno', 'apt', 'apartment'], example: '' },
    { key: 'residentRef', label: 'Assigned Resident (optional)', type: 'string', required: false, refEntity: 'resident',
      aliases: ['resident', 'residentname', 'assignedto', 'assignedresident', 'assignee', 'tenant', 'owner', 'personid', 'residentid'], example: '' },
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

/** Looks up the header-matching aliases already curated for an Import Wizard field, keyed by its field key. Lets a page's quick per-entity Bulk Add field reuse the same alias list as the full multi-entity import (e.g. Buildings' "name" field), instead of re-authoring a separate one, whenever the two share a field key. */
export function fieldAliases(def: ImportEntityDef, key: string): string[] {
  return def.fields.find((f) => f.key === key)?.aliases ?? [];
}

/** Lowercase, alphanumeric-only form used to fuzzily compare header text, entity/building/unit names, etc. */
export function normalizeHeader(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** Best-guess entity for a sheet, based on its tab name. Returns null if nothing matches (user picks manually). */
export function guessEntityFromSheetName(name: string): ImportEntityKey | null {
  const n = normalizeHeader(name);
  // "Tenancy"/"Tenancies"/"Lease(s)" and "Ownership(s)" are the lease/title
  // relationship tables - checked first since they're the more specific
  // match. A tab plainly called "Tenants" or "Owners" (no "-ship"/"-cy"),
  // however, is a people list - e.g. two tabs named "Tenants" and "Owners"
  // in the same workbook both belong in Residents, merged together with the
  // rest of that logic living in the Import Wizard's per-sheet Type default.
  if (/tenanc|lease/.test(n)) return 'tenancies';
  if (/ownership/.test(n)) return 'ownerships';
  if (/emergency/.test(n)) return 'emergencyContacts';
  if (/contact/.test(n)) return 'contacts';
  if (/vehicle|car/.test(n)) return 'vehicles';
  if (/parking/.test(n)) return 'parkingSpaces';
  if (/building|propert/.test(n)) return 'buildings';
  if (/flat|unit|apartment/.test(n)) return 'flats';
  if (/resident|tenant|owner|people|person/.test(n)) return 'residents';
  if (/expense|cost/.test(n)) return 'expenses';
  return null;
}
