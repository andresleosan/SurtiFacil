import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useBarcode } from '../hooks/useBarcode';

describe('useBarcode', () => {
  it('starts with scanner closed', () => {
    const { result } = renderHook(() => useBarcode(vi.fn()));
    expect(result.current.isOpen).toBe(false);
  });

  it('opens scanner when open is called', () => {
    const { result } = renderHook(() => useBarcode(vi.fn()));
    act(() => result.current.open());
    expect(result.current.isOpen).toBe(true);
  });

  it('closes scanner when close is called', () => {
    const { result } = renderHook(() => useBarcode(vi.fn()));
    act(() => result.current.open());
    act(() => result.current.close());
    expect(result.current.isOpen).toBe(false);
  });

  it('calls onScan and closes when handleScan is called', () => {
    const onScan = vi.fn();
    const { result } = renderHook(() => useBarcode(onScan));
    act(() => result.current.open());
    act(() => result.current.handleScan('123456789'));
    expect(onScan).toHaveBeenCalledWith('123456789');
    expect(result.current.isOpen).toBe(false);
  });
});
