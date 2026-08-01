import { useEffect, useRef } from 'react';
import { Html5Qrcode } from 'html5-qrcode';

interface BarcodeScannerProps {
  onScan: (code: string) => void;
  onClose: () => void;
}

const BarcodeScanner = ({ onScan, onClose }: BarcodeScannerProps) => {
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const scanner = new Html5Qrcode('barcode-reader');
    scannerRef.current = scanner;

    scanner.start(
      { facingMode: 'environment' },
      {
        fps: 10,
        qrbox: { width: 250, height: 150 },
        aspectRatio: 1.0,
      },
      (decodedText) => {
        onScan(decodedText);
        scanner.stop().catch(() => {});
      },
      () => {}
    ).catch((err) => {
      console.error('Camera error:', err);
    });

    return () => {
      if (scannerRef.current?.isScanning) {
        scannerRef.current.stop().catch(() => {});
      }
    };
  }, [onScan]);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl p-4 max-w-md w-full mx-4">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold">Escanear codigo de barras</h3>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700"
          >
            X
          </button>
        </div>
        <div id="barcode-reader" ref={containerRef} className="rounded-lg overflow-hidden" />
        <p className="text-sm text-gray-500 mt-2 text-center">
          Apunta la camara al codigo de barras del producto
        </p>
      </div>
    </div>
  );
};

export default BarcodeScanner;
