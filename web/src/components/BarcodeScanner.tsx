import { useEffect, useId, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { Modal } from './ui/Modal';

interface BarcodeScannerProps {
  onScan: (code: string) => void;
  onClose: () => void;
}

/**
 * Escáner de cámara en un diálogo responsivo. Mantiene el callback más
 * reciente en un ref para no reiniciar la cámara en cada render del padre.
 */
const BarcodeScanner = ({ onScan, onClose }: BarcodeScannerProps) => {
  const readerId = `barcode-reader-${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const onScanRef = useRef(onScan);
  const [cameraError, setCameraError] = useState('');

  useEffect(() => {
    onScanRef.current = onScan;
  }, [onScan]);

  useEffect(() => {
    let cancelled = false;
    const scanner = new Html5Qrcode(readerId);
    scannerRef.current = scanner;

    scanner
      .start(
        { facingMode: 'environment' },
        {
          fps: 10,
          qrbox: (viewfinderWidth, viewfinderHeight) => {
            const width = Math.min(viewfinderWidth * 0.85, 320);
            return { width, height: Math.min(viewfinderHeight * 0.6, width * 0.6) };
          },
          aspectRatio: 1.333,
        },
        (decodedText) => {
          if (cancelled) return;
          cancelled = true;
          onScanRef.current(decodedText);
          scanner.stop().catch(() => {});
        },
        () => {},
      )
      .catch(() => {
        console.error('Camera error.');
        setCameraError('No se pudo acceder a la cámara. Revisa los permisos del navegador.');
      });

    return () => {
      cancelled = true;
      if (scanner.isScanning) {
        scanner.stop().catch(() => {});
      }
    };
  }, [readerId]);

  return (
    <Modal open onClose={onClose} title="Escanear código de barras" size="md">
      <div className="space-y-3">
        {cameraError ? (
          <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {cameraError}
          </div>
        ) : (
          <p className="text-sm text-gray-600">Apunta la cámara al código de barras del producto.</p>
        )}
        <div id={readerId} className="w-full overflow-hidden rounded-lg bg-black" aria-live="polite" />
      </div>
    </Modal>
  );
};

export default BarcodeScanner;
