import { useState } from 'react';
import ImageUploadAI from './ImageUploadAI';
import AudioUploadAI from './AudioUploadAI';
import BarcodeScanner from './BarcodeScanner';
import { useBarcode } from '../hooks/useBarcode';
import { Icon } from './ui/Icon';
import { Modal } from './ui/Modal';

interface AddProductModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddProduct: (product: {
    name: string;
    price_cents: number;
    stock: number;
    category: string;
    barcode?: string;
  }) => void | Promise<void>;
}

type InputMode = 'manual' | 'image' | 'audio';

const MODES: Array<{ value: InputMode; label: string; emoji: string }> = [
  { value: 'manual', label: 'Manual', emoji: '✏️' },
  { value: 'image', label: 'Foto', emoji: '📷' },
  { value: 'audio', label: 'Voz', emoji: '🎙️' },
];

const CATEGORIES = ['Abarrotes', 'Bebidas', 'Lácteos', 'Limpieza', 'Otros'];

const EMPTY_FORM = {
  name: '',
  price: '',
  stock: '',
  category: 'Abarrotes',
  barcode: '',
};

const AddProductModal = ({ isOpen, onClose, onAddProduct }: AddProductModalProps) => {
  const [mode, setMode] = useState<InputMode>('manual');
  const [formData, setFormData] = useState(EMPTY_FORM);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleBarcodeScan = (code: string) => {
    setFormData((prev) => ({ ...prev, barcode: code }));
    setMode('manual');
  };

  const { isOpen: isScannerOpen, open: openScanner, close: closeScanner, handleScan } = useBarcode(handleBarcodeScan);

  const handleImageData = (data: { nombre: string; precio_sugerido: number | null; categoria: string }) => {
    setFormData((prev) => ({
      ...prev,
      name: data.nombre,
      price: data.precio_sugerido ? data.precio_sugerido.toString() : '',
      category: data.categoria,
    }));
    setMode('manual');
  };

  const handleAudioData = (data: { nombre: string; precio: number | null; stock: number | null; categoria: string }) => {
    setFormData((prev) => ({
      ...prev,
      name: data.nombre,
      price: data.precio ? data.precio.toString() : '',
      stock: data.stock ? data.stock.toString() : '',
      category: data.categoria,
    }));
    setMode('manual');
  };

  const resetAndClose = () => {
    setFormData(EMPTY_FORM);
    setMode('manual');
    setError('');
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!formData.name.trim()) {
      setError('El nombre del producto es requerido');
      return;
    }
    if (!formData.price) {
      setError('El precio es requerido');
      return;
    }
    if (!formData.stock) {
      setError('El stock es requerido');
      return;
    }

    const price = parseFloat(formData.price);
    const stock = parseInt(formData.stock, 10);

    if (isNaN(price) || price < 0) {
      setError('El precio debe ser un número válido');
      return;
    }
    if (isNaN(stock) || stock < 0) {
      setError('El stock debe ser un número entero válido');
      return;
    }

    try {
      setLoading(true);
      await onAddProduct({
        name: formData.name.trim(),
        price_cents: Math.round(price * 100),
        stock,
        category: formData.category,
        barcode: formData.barcode.trim() || undefined,
      });
      resetAndClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al agregar producto');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Modal
        open={isOpen}
        onClose={resetAndClose}
        title="Agregar producto"
        size="lg"
        headerActions={
          <button type="button" onClick={openScanner} className="btn-secondary min-h-[40px] px-3 text-xs">
            <Icon name="scan" size={16} />
            Escanear código
          </button>
        }
        footer={
          mode === 'manual' ? (
            <>
              <button type="button" onClick={resetAndClose} className="btn-secondary">
                Cancelar
              </button>
              <button type="submit" form="add-product-form" disabled={loading} className="btn-primary">
                {loading ? 'Guardando...' : 'Guardar producto'}
              </button>
            </>
          ) : undefined
        }
      >
        <div className="space-y-4">
          {error && (
            <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="flex gap-1 border-b border-gray-200" role="tablist" aria-label="Modo de captura">
            {MODES.map((option) => (
              <button
                key={option.value}
                type="button"
                role="tab"
                aria-selected={mode === option.value}
                onClick={() => {
                  setMode(option.value);
                  setError('');
                }}
                className={`min-h-[44px] flex-1 px-3 text-sm font-medium transition sm:flex-none ${
                  mode === option.value
                    ? 'border-b-2 border-sf-primary text-sf-primary'
                    : 'text-gray-500 hover:text-sf-text'
                }`}
              >
                <span aria-hidden="true">{option.emoji}</span> {option.label}
              </button>
            ))}
          </div>

          {mode === 'manual' && (
            <form id="add-product-form" onSubmit={handleSubmit} className="space-y-3">
              <div>
                <label htmlFor="add-name" className="mb-1 block text-sm font-medium text-sf-text">
                  Nombre del producto *
                </label>
                <input
                  id="add-name"
                  type="text"
                  name="name"
                  value={formData.name}
                  onChange={handleInputChange}
                  placeholder="Ej: Arroz Diana"
                  autoComplete="off"
                  className="input"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="add-price" className="mb-1 block text-sm font-medium text-sf-text">
                    Precio ($) *
                  </label>
                  <input
                    id="add-price"
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    min="0"
                    name="price"
                    value={formData.price}
                    onChange={handleInputChange}
                    placeholder="4200"
                    className="input"
                  />
                </div>
                <div>
                  <label htmlFor="add-stock" className="mb-1 block text-sm font-medium text-sf-text">
                    Stock *
                  </label>
                  <input
                    id="add-stock"
                    type="number"
                    inputMode="numeric"
                    min="0"
                    name="stock"
                    value={formData.stock}
                    onChange={handleInputChange}
                    placeholder="50"
                    className="input"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="add-category" className="mb-1 block text-sm font-medium text-sf-text">
                  Categoría
                </label>
                <select
                  id="add-category"
                  name="category"
                  value={formData.category}
                  onChange={handleInputChange}
                  className="input"
                >
                  {CATEGORIES.map((category) => (
                    <option key={category}>{category}</option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="add-barcode" className="mb-1 block text-sm font-medium text-sf-text">
                  Código de barras (opcional)
                </label>
                <div className="flex gap-2">
                  <input
                    id="add-barcode"
                    type="text"
                    inputMode="numeric"
                    name="barcode"
                    value={formData.barcode}
                    onChange={handleInputChange}
                    placeholder="Escanear o escribir código"
                    className="input"
                  />
                  <button type="button" onClick={openScanner} aria-label="Escanear código de barras" className="icon-btn border border-gray-300 text-sf-primary hover:bg-sf-light">
                    <Icon name="scan" />
                  </button>
                </div>
              </div>
            </form>
          )}

          {mode === 'image' && <ImageUploadAI onProductData={handleImageData} onError={setError} />}
          {mode === 'audio' && <AudioUploadAI onProductData={handleAudioData} onError={setError} />}
        </div>
      </Modal>

      {isScannerOpen && <BarcodeScanner onScan={handleScan} onClose={closeScanner} />}
    </>
  );
};

export default AddProductModal;
