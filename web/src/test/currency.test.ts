import { describe, expect, it } from 'vitest';
import { formatCOP, formatCentsCOP, parseCOP } from '../utils/currency';

describe('currency utilities (formatCOP)', () => {
  it('formats COP amounts with dollar sign and no unnecessary decimals', () => {
    expect(formatCOP(12500)).toMatch(/\$\s?12\.500/);
    expect(formatCOP(3500)).toMatch(/\$\s?3\.500/);
    expect(formatCOP(0)).toMatch(/\$\s?0/);
  });

  it('formats cents to COP dividing by 100', () => {
    expect(formatCentsCOP(350000)).toMatch(/\$\s?3\.500/);
    expect(formatCentsCOP(950000)).toMatch(/\$\s?9\.500/);
  });

  it('parses formatted COP strings back to numbers', () => {
    expect(parseCOP('$ 12.500')).toBe(12500);
    expect(parseCOP('3500')).toBe(3500);
    expect(parseCOP('')).toBe(0);
  });
});
