import { describe, it, expect } from 'vitest';
import { guessEntityFromSheetName } from '../import/schemas';

describe('guessEntityFromSheetName (Bulk Add sheet auto-selection)', () => {
  it('matches case-insensitively and ignores surrounding/extra whitespace', () => {
    expect(guessEntityFromSheetName('Residents')).toBe('residents');
    expect(guessEntityFromSheetName('  residents  ')).toBe('residents');
    expect(guessEntityFromSheetName('RESIDENTS')).toBe('residents');
    expect(guessEntityFromSheetName('  Ownership ')).toBe('ownerships');
    expect(guessEntityFromSheetName('Tenancies')).toBe('tenancies');
    expect(guessEntityFromSheetName('tenancies')).toBe('tenancies');
  });

  it('is tolerant of punctuation/spacing variants of the same name', () => {
    expect(guessEntityFromSheetName('Tenancy List')).toBe('tenancies');
    expect(guessEntityFromSheetName('Owner-ship')).toBe('ownerships');
    expect(guessEntityFromSheetName('People / Residents')).toBe('residents');
  });

  it('matches Owners and Tenants sheets to the residents entity', () => {
    expect(guessEntityFromSheetName('Owners')).toBe('residents');
    expect(guessEntityFromSheetName('Tenants')).toBe('residents');
  });

  it('returns null (no confident match) for an unrelated or unclear sheet name', () => {
    expect(guessEntityFromSheetName('Sheet1')).toBeNull();
    expect(guessEntityFromSheetName('Summary')).toBeNull();
    expect(guessEntityFromSheetName('')).toBeNull();
  });

  it('prefers the more specific tenancy/ownership match over the generic residents match', () => {
    expect(guessEntityFromSheetName('Tenancies')).toBe('tenancies');
    expect(guessEntityFromSheetName('Ownerships')).toBe('ownerships');
  });
});
