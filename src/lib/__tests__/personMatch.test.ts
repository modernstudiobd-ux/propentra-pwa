import { describe, it, expect } from 'vitest';
import { matchPerson } from '../import/personMatch';
import type { Resident } from '@/types';

function makeResident(overrides: Partial<Resident>): Resident {
  return {
    id: 1, name: 'Jane Doe', mobile: '555-0100', email: 'jane@example.com',
    flatId: 10, buildingId: 1, unitLabel: 'A-3', type: 'Tenant', status: 'current', isBillingContact: true,
    ...overrides,
  };
}

describe('matchPerson', () => {
  it('links by Person ID matched against an existing displayId', () => {
    const existing = [makeResident({ id: 5, displayId: 'P-00005' })];
    const result = matchPerson({ personId: 'P-00005' }, existing);
    expect(result).toMatchObject({ residentId: 5, matchedBy: 'personId', personIdProvided: true, personIdInvalid: false });
  });

  it('links by Person ID matched against an existing externalId as a fallback', () => {
    const existing = [makeResident({ id: 6, displayId: 'TEN-00006', externalId: 'SRC-99' })];
    const result = matchPerson({ personId: 'SRC-99' }, existing);
    expect(result).toMatchObject({ residentId: 6, matchedBy: 'personId' });
  });

  it('flags an invalid Person ID but still falls back to mobile matching', () => {
    const existing = [makeResident({ id: 7, displayId: 'P-00099', mobile: '555-0199' })];
    const result = matchPerson({ personId: 'DOES-NOT-EXIST', mobile: '555-0199' }, existing);
    expect(result).toMatchObject({ residentId: 7, matchedBy: 'mobile', personIdProvided: true, personIdInvalid: true });
  });

  it('falls back through idNumber, mobile, email, then building+flat+name in priority order', () => {
    const byIdNumber = [makeResident({ id: 1, idNumber: 'X123' })];
    expect(matchPerson({ idNumber: 'X123' }, byIdNumber).matchedBy).toBe('idNumber');

    const byMobile = [makeResident({ id: 2, mobile: '555-0100' })];
    expect(matchPerson({ mobile: '555-0100' }, byMobile).matchedBy).toBe('mobile');

    const byEmail = [makeResident({ id: 3, email: 'jane@example.com' })];
    expect(matchPerson({ email: 'JANE@EXAMPLE.COM' }, byEmail).matchedBy).toBe('email');

    const byNameFlat = [makeResident({ id: 4, buildingId: 2, flatId: 20, name: 'John Smith' })];
    expect(matchPerson({ buildingId: 2, flatId: 20, name: 'john smith' }, byNameFlat).matchedBy).toBe('buildingFlatName');
  });

  it('normalizes phone numbers so formatting differences still match', () => {
    const existing = [makeResident({ id: 8, mobile: '(555) 010-0' })];
    const result = matchPerson({ mobile: '5550100' }, existing);
    expect(result.residentId).toBe(8);
  });

  it('returns unmatched (new record) when nothing lines up', () => {
    const existing = [makeResident({ id: 1 })];
    const result = matchPerson({ mobile: '999-9999', email: 'nobody@nowhere.com' }, existing);
    expect(result.residentId).toBeUndefined();
    expect(result.personIdProvided).toBe(false);
  });

  it('flags ambiguous matches instead of guessing', () => {
    const existing = [
      makeResident({ id: 1, mobile: '555-0100' }),
      makeResident({ id: 2, mobile: '555-0100' }),
    ];
    const result = matchPerson({ mobile: '555-0100' }, existing);
    expect(result.residentId).toBeUndefined();
    expect(result.ambiguous).toBe(true);
  });

  it('never matches on a blank Person ID', () => {
    const existing = [makeResident({ id: 1, displayId: '' })];
    const result = matchPerson({ personId: '' }, existing);
    expect(result.personIdProvided).toBe(false);
    expect(result.residentId).toBeUndefined();
  });
});
