import { describe, it, expect } from 'vitest';
import { formatParcelleName } from './format.js';

describe('formatParcelleName', () => {
  it('formats with ilot and numéro', () => {
    const result = formatParcelleName('1', undefined, '2');
    expect(result).toBe('2-1');
  });

  it('formats with numéro and précision only', () => {
    const result = formatParcelleName('42', '7');
    expect(result).toBe('42-007');
  });

  it('formats with only numéro', () => {
    const result = formatParcelleName('42');
    expect(result).toBe('42');
  });

  it('formats with no inputs', () => {
    const result = formatParcelleName();
    expect(result).toBe('(sans numéro)');
  });
});
