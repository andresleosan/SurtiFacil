import { useState, useCallback } from 'react';

export function useBarcode(onScan: (code: string) => void) {
  const [isOpen, setIsOpen] = useState(false);

  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);

  const handleScan = useCallback((code: string) => {
    onScan(code);
    close();
  }, [onScan, close]);

  return { isOpen, open, close, handleScan };
}
