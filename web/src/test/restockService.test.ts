import { describe, it, expect, vi } from 'vitest';
import { getRestockSuggestions } from '../services/restockService';

vi.mock('../services/saleService', () => ({
  getSales: vi.fn(),
  getProducts: vi.fn(),
}));
vi.mock('../services/supplierService', () => ({
  getSuppliers: vi.fn(),
}));

describe('restockService - smoke', () => {
  it('exports getRestockSuggestions', () => {
    expect(typeof getRestockSuggestions).toBe('function');
  });
});
