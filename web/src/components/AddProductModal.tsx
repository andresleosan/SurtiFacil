import { useState } from 'react';
import ImageUploadAI from './ImageUploadAI';
import AudioUploadAI from './AudioUploadAI';
import BarcodeScanner from './BarcodeScanner';
import { useBarcode } from '../hooks/useBarcode';
import { Icon } from './ui/Icon';
import { Modal } from './ui/Modal';
import { COLOMBIAN_PRODUCT_CATALOG, findColombianProductImage } from '../data/colombianCatalog';

interface AddProductModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddProduct: (product: {
    name: string;
    price_cents: number;
    stock: number;
    category: string;
    unit?: string;
    barcode?: string;
    image_url?: string;
  }) => void | Promise<void>;
}

type InputMode = 'manual' | 'image' | 'audio';

const MODES: Array<{ value: InputMode; label: string; emoji: string }> = [
  { value: 'manual', label: 'Manual', emoji: '✏️' },
  { value: 'image', label: 'Foto', emoji: '📷' },
  { value: 'audio', label: 'Voz', emoji: '🎙️' },
];

const CATEGORIES = [
  'Abarrotes',
  'Granos y Despensa',
  'Lácteos y Huevos',
  'Panadería y Arepas',
  'Bebidas',
  'Limpieza',
  'Snacks y Dulces',
  'Otros',
];

const EMPTY_FORM = {
  name: '',
  price: '',
  stock: '50',
  category: 'Abarrotes',
  unit: 'unidad',
  barcode: '',
  image_url: '',
};

const AddProductModal = ({ isOpen, onClose, onAddProduct }: AddProductModalProps) => {
  const [mode, setMode] = useState<InputMode>('manual');
  const [formData, setFormData] = useState(EMPTY_FORM);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => {
      const next = { ...prev, [name]: value };
      // Auto-emparejar imagen típica si se escribe el nombre y no tiene imagen aún
      if (name === 'name' && !prev.image_url) {
        const autoImg = findColombianProductImage(value, prev.barcode);
        if (autoImg) next.image_url = autoImg;
      }
      return next;
    });
  };

  const handleSelectPreset = (presetId: string) => {
    const item = COLOMBIAN_PRODUCT_CATALOG.find((p) => p.id === presetId);
    if (!item) return;
    setFormData({
      name: item.name,
      price: (item.price_cents / 100).toFixed(0),
      stock: '50',
      category: item.category,
      unit: item.unit,
      barcode: item.barcode,
      image_url: item.image_url,
    });
  };

  const handleBarcodeScan = (code: string) => {
    const autoImg = findColombianProductImage('', code);
    setFormData((prev) => ({
      ...prev,
      barcode: code,
      image_url: prev.image_url || autoImg || '',
    }));
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
        unit: formData.unit || 'unidad',
        barcode: formData.barcode.trim() || undefined,
        image_url: formData.image_url.trim() || undefined,
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
              {/* Selector Rápido de Catálogo Colombiano */}
              <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-2.5">
                <label htmlFor="colombian-preset" className="mb-1 block text-xs font-bold text-amber-900">
                  🇨🇴 Plantillas de Productos Típicos Colombianos (1-Clic)
                </label>
                <select
                  id="colombian-preset"
                  onChange={(e) => {
                    if (e.target.value) handleSelectPreset(e.target.value);
                  }}
                  defaultValue=""
                  className="input text-xs bg-white border-amber-300"
                >
                  <option value="">Selecciona para autocompletar foto, precio y código...</option>
                  {COLOMBIAN_PRODUCT_CATALOG.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} — ${(p.price_cents / 100).toLocaleString('es-CO')} ({p.category})
                    </option>
                  ))}
                </select>
              </div>

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
                  placeholder="Ej: Arroz Diana 500g"
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

              <div className="grid grid-cols-2 gap-3">
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
                  <label htmlFor="add-unit" className="mb-1 block text-sm font-medium text-sf-text">
                    Presentación / Unidad
                  </label>
                  <select
                    id="add-unit"
                    name="unit"
                    value={formData.unit}
                    onChange={handleInputChange}
                    className="input"
                  >
                    <option value="unidad">Unidad</option>
                    <option value="libra">Libra (500g)</option>
                    <option value="kilo">Kilo (1000g)</option>
                    <option value="litro">Litro</option>
                    <option value="paquete">Paquete</option>
                    <option value="cubeta">Cubeta</option>
                  </select>
                </div>
              </div>

              {/* Imagen / Empaque del Producto */}
              <div>
                <label htmlFor="add-image" className="mb-1 block text-sm font-medium text-sf-text">
                  Foto o Ilustración de Empaque (URL)
                </label>
                <div className="flex items-center gap-2">
                  {formData.image_url ? (
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-slate-50 p-1 border border-slate-200 overflow-hidden">
                      <img src={formData.image_url} alt="Vista previa" className="h-full w-full object-contain" />
                    </div>
                  ) : (
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-xl border border-slate-200">
                      🛒
                    </div>
                  )}
                  <input
                    id="add-image"
                    type="text"
                    name="image_url"
                    value={formData.image_url}
                    onChange={handleInputChange}
                    placeholder="/images/products/arroz-diana-1lb.svg o URL web"
                    className="input flex-1 text-xs"
                  />
                </div>
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
