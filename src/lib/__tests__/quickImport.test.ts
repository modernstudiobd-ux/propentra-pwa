import { describe, it, expect } from 'vitest';
import { coerceImportCell } from '../import/quickImport';

describe('coerceImportCell', () => {
  it('trims and passes through text', () => {
    expect(coerceImportCell({ key: 'name', type: 'text' }, '  Jane Doe  ')).toBe('Jane Doe');
  });

  it('returns empty string for text when cell is blank/null/undefined', () => {
    expect(coerceImportCell({ key: 'name', type: 'text' }, '')).toBe('');
    expect(coerceImportCell({ key: 'name', type: 'text' }, null)).toBe('');
    expect(coerceImportCell({ key: 'name', type: 'text' }, undefined)).toBe('');
  });

  it('parses numbers, stripping currency/percent/comma formatting', () => {
    expect(coerceImportCell({ key: 'amount', type: 'number' }, '1,200')).toBe(1200);
    expect(coerceImportCell({ key: 'amount', type: 'number' }, '$150.50')).toBe(150.5);
    expect(coerceImportCell({ key: 'amount', type: 'number' }, 42)).toBe(42);
    expect(coerceImportCell({ key: 'amount', type: 'number' }, 'not a number')).toBe('');
  });

  it('parses checkboxes from common yes/no spellings', () => {
    expect(coerceImportCell({ key: 'flag', type: 'checkbox' }, 'Yes')).toBe(true);
    expect(coerceImportCell({ key: 'flag', type: 'checkbox' }, 'y')).toBe(true);
    expect(coerceImportCell({ key: 'flag', type: 'checkbox' }, '1')).toBe(true);
    expect(coerceImportCell({ key: 'flag', type: 'checkbox' }, true)).toBe(true);
    expect(coerceImportCell({ key: 'flag', type: 'checkbox' }, 'No')).toBe(false);
    expect(coerceImportCell({ key: 'flag', type: 'checkbox' }, '')).toBe(false);
    expect(coerceImportCell({ key: 'flag', type: 'checkbox' }, undefined)).toBe(false);
  });

  it('normalizes date cells to yyyy-mm-dd', () => {
    expect(coerceImportCell({ key: 'date', type: 'date' }, '2024-3-1')).toBe('2024-03-01');
    expect(coerceImportCell({ key: 'date', type: 'date' }, new Date(Date.UTC(2024, 5, 15)))).toBe('2024-06-15');
    expect(coerceImportCell({ key: 'date', type: 'date' }, 'not a date')).toBe('');
  });

  it('matches select cells to an option value or label, case-insensitively', () => {
    const field = { key: 'role', type: 'select' as const, options: [{ value: 'Tenant', label: 'Tenant' }, { value: 'Owner', label: 'Owner-Occupied' }] };
    expect(coerceImportCell(field, 'tenant')).toBe('Tenant');
    expect(coerceImportCell(field, 'Owner-Occupied')).toBe('Owner');
    expect(coerceImportCell(field, 'nonsense')).toBe('');
  });

  it('matches a select cell against the unit segment of a "Building · Unit" label', () => {
    const field = { key: 'flatId', type: 'select' as const, options: [{ value: '1', label: 'Sunset Tower · A-3' }, { value: '2', label: 'Sunset Tower · A-10' }] };
    expect(coerceImportCell(field, 'A-3')).toBe('1');
    expect(coerceImportCell(field, 'A-10')).toBe('2');
  });
});
