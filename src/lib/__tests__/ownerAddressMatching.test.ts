import { describe, it, expect } from 'vitest';
import { normalizeAddress, matchAddresses } from '@/lib/addressMatch';
import { classifyOwnerResidency, buildingFullAddress } from '@/lib/import/ownerClassification';
import { db } from '@/lib/db';
import { resetDb } from '@/test/testUtils';
import { matchPerson } from '@/lib/import/personMatch';
import type { Resident } from '@/types';

describe('normalizeAddress', () => {
  it('lowercases, strips punctuation/line breaks, and collapses whitespace', () => {
    expect(normalizeAddress('123 Main St.,\nApt 4B')).toBe('123 main street apartment 4b');
    expect(normalizeAddress('  123   MAIN   STREET  ')).toBe('123 main street');
  });

  it('expands common abbreviations so different formatting styles converge', () => {
    expect(normalizeAddress('456 Oak Ave, Ste 2')).toBe(normalizeAddress('456 Oak Avenue, Suite 2'));
    expect(normalizeAddress('12 N Elm Rd')).toBe(normalizeAddress('12 North Elm Road'));
  });

  it('returns empty string for blank/undefined input', () => {
    expect(normalizeAddress('')).toBe('');
    expect(normalizeAddress(undefined)).toBe('');
    expect(normalizeAddress(null)).toBe('');
  });
});

describe('matchAddresses (address normalization + matching rule)', () => {
  it('1. exact building address -> match', () => {
    expect(matchAddresses('123 Main St, Springfield, IL 62704', '123 Main St, Springfield, IL 62704')).toBe('match');
  });

  it('2. same address with formatting differences -> match', () => {
    expect(matchAddresses(
      '123   main   street,   springfield,   il   62704',
      '123 Main St., Springfield, IL, 62704',
    )).toBe('match');
    expect(matchAddresses('123 Main St Apt 4B', '123 Main Street, Apartment 4B')).toBe('match');
  });

  it('3. clearly different address -> none', () => {
    expect(matchAddresses('456 Oak Ave, Portland, OR 97201', '123 Main St, Springfield, IL 62704')).toBe('none');
  });

  it('4. weak/ambiguous address (city/state only, no street-level detail) -> review, never silently assumed as a match', () => {
    // Real overlap (city + state both appear), but nowhere near specific
    // enough to conclude it's the same building - must not be auto-matched.
    expect(matchAddresses('Springfield, IL', '123 Main St, Springfield, IL 62704')).toBe('review');
  });

  it('a differing house number on an otherwise-similar street is a confident non-match, not an ambiguous one', () => {
    expect(matchAddresses('123 Main St, Springfield, IL', '456 Main St, Springfield, IL')).toBe('none');
    expect(matchAddresses('12 Main St, Springfield', '14 Main St, Springfield')).toBe('none');
  });

  it('blank input on either side never matches', () => {
    expect(matchAddresses('', '123 Main St')).toBe('none');
    expect(matchAddresses('123 Main St', '')).toBe('none');
    expect(matchAddresses(undefined, undefined)).toBe('none');
  });
});

describe('buildingFullAddress', () => {
  it('composes the building\'s separate address fields into one string', () => {
    expect(buildingFullAddress({ address: '123 Main St', addressLine2: 'Suite 2', locality: 'Springfield', adminArea: 'IL', postalCode: '62704', countryCode: 'US' }))
      .toBe('123 Main St, Suite 2, Springfield, IL, 62704, US');
  });
  it('skips blank parts and returns empty string for no data', () => {
    expect(buildingFullAddress({ address: '123 Main St' })).toBe('123 Main St');
    expect(buildingFullAddress(undefined)).toBe('');
  });
});

describe('classifyOwnerResidency (the Owner + Resident vs Owner only rule)', () => {
  const buildingAddress = '123 Main St, Springfield, IL 62704';

  it('1/2. confident address match (exact or reformatted) -> Owner + Resident', () => {
    expect(classifyOwnerResidency({ ownerAddress: '123 Main St, Springfield, IL 62704', buildingAddress }))
      .toEqual({ isResident: true, status: 'match' });
    expect(classifyOwnerResidency({ ownerAddress: '123  main  street, springfield, il, 62704', buildingAddress }))
      .toEqual({ isResident: true, status: 'match' });
  });

  it('3. different address -> Owner only', () => {
    expect(classifyOwnerResidency({ ownerAddress: '999 Elsewhere Rd, Otherville, CA 90001', buildingAddress }))
      .toEqual({ isResident: false, status: 'none' });
  });

  it('4. weak/ambiguous address -> Owner only, but flagged as needing review (never silently assumed either way)', () => {
    const result = classifyOwnerResidency({ ownerAddress: 'Springfield, IL', buildingAddress });
    expect(result.isResident).toBe(false);
    expect(result.status).toBe('review');
  });

  it('no address on file -> Owner only, not an error', () => {
    expect(classifyOwnerResidency({ ownerAddress: '', buildingAddress })).toEqual({ isResident: false, status: 'none' });
  });

  it('an explicit "Also Resident" Yes always wins, regardless of address', () => {
    expect(classifyOwnerResidency({ ownerAddress: '999 Elsewhere Rd', buildingAddress, explicitResident: true }))
      .toEqual({ isResident: true, status: 'match' });
    expect(classifyOwnerResidency({ ownerAddress: '', buildingAddress: '', explicitResident: true }))
      .toEqual({ isResident: true, status: 'match' });
  });
});

/**
 * End-to-end check of the actual role/count outcomes (test scenarios 5-8),
 * exercised at the same level Owners.tsx's commitBulkAdd operates at
 * (matchPerson + classifyOwnerResidency + direct db writes), mirroring how
 * sampleWorkbook.test.ts exercises the Import Wizard's engine functions
 * directly rather than rendering the page.
 */
describe('owner-occupancy classification - end-to-end role/count outcomes', () => {
  async function seedBuildingAndFlat(address: string) {
    const buildingId = (await db.buildings.add({ name: 'Sunset Tower', address, totalFlats: 10 } as any)) as number;
    const flatId = (await db.flats.add({ buildingId, unitNo: 'A-101', occupancyStatus: 'vacant', lifecycleStatus: 'active' } as any)) as number;
    return { buildingId, flatId };
  }

  it('5/6. Owner-only is excluded from resident counts; Owner + Resident is included', async () => {
    await resetDb();
    const { buildingId, flatId } = await seedBuildingAndFlat('123 Main St, Springfield, IL');

    const offsite = classifyOwnerResidency({ ownerAddress: '999 Elsewhere Rd', buildingAddress: '123 Main St, Springfield, IL' });
    const onsite = classifyOwnerResidency({ ownerAddress: '123 Main St, Springfield, IL', buildingAddress: '123 Main St, Springfield, IL' });

    await db.residents.add({
      name: 'Offsite Owner', mobile: '555-0001', email: 'offsite@example.com',
      flatId, buildingId, unitLabel: 'A-101', type: offsite.isResident ? 'Tenant' : 'Owner',
      isOwner: true, isResident: offsite.isResident, status: 'current', isBillingContact: false,
    } as Resident);
    await db.residents.add({
      name: 'Onsite Owner', mobile: '555-0002', email: 'onsite@example.com',
      flatId, buildingId, unitLabel: 'A-101', type: onsite.isResident ? 'Tenant' : 'Owner',
      isOwner: true, isResident: onsite.isResident, status: 'current', isBillingContact: false,
    } as Resident);

    const all = await db.residents.toArray();
    const owners = all.filter((r: any) => r.isOwner);
    const actualResidents = all.filter((r: any) => r.isResident);

    expect(owners.length).toBe(2); // both owners appear on the Owners page regardless of residency
    expect(actualResidents.map((r: any) => r.name)).toEqual(['Onsite Owner']); // only the owner-occupied one counts as an actual resident
  });

  it('7. an existing Resident ID is reused instead of creating a duplicate person', async () => {
    await resetDb();
    const { buildingId, flatId } = await seedBuildingAndFlat('123 Main St, Springfield, IL');
    const existingId = (await db.residents.add({
      name: 'Jane Doe', mobile: '555-0100', email: 'jane@example.com',
      flatId, buildingId, unitLabel: 'A-101', type: 'Tenant', status: 'current', isBillingContact: true,
    } as Resident)) as number;

    const match = matchPerson({ mobile: '555-0100', name: 'Jane Doe' }, await db.residents.toArray());
    expect(match.residentId).toBe(existingId);

    const residency = classifyOwnerResidency({ ownerAddress: '123 Main St, Springfield, IL', buildingAddress: '123 Main St, Springfield, IL' });
    await db.residents.update(existingId, { isOwner: true, isResident: residency.isResident || true });

    expect(await db.residents.count()).toBe(1); // reused, not duplicated
    const updated = await db.residents.get(existingId);
    expect(updated?.isOwner).toBe(true);
  });
});
