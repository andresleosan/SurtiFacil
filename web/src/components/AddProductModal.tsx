import { useState, useRef } from 'react';
import ImageUploadAI from './ImageUploadAI';
import AudioUploadAI from './AudioUploadAI';
import BarcodeScanner from './BarcodeScanner';
import { useBarcode } from '../hooks/useBarcode';

interface AddProductModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddProduct: (product: {
    name: string;
    price_cents: number;
    stock: number;
    category: string;
    barcode?: string;
  }) => void;
}

type InputMode = 'manual' | 'image' | 'audio';

const AddProductModal = ({ isOpen, onClose, onAddProduct }: AddProductModalProps) => {
  const [mode, setMode] = useState<InputMode>('manual');
  const [formData, setFormData] = useState({
    name: '',
    price: '',
    stock: '',
    category: 'Abarrotes',
    barcode: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const modalRef = useRef<HTMLDivElement>(null);

  if (!isOpen) return null;

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (modalRef.current) {
      setIsDragging(true);
      const rect = modalRef.current.getBoundingClientRect();
      setDragOffset({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      });
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (isDragging && modalRef.current) {
      const newX = e.clientX - dragOffset.x;
      const newY = e.clientY - dragOffset.y;
      
      // Limitar el movimiento dentro de la pantalla
      const maxX = window.innerWidth - (modalRef.current.offsetWidth || 0);
      const maxY = window.innerHeight - (modalRef.current.offsetHeight || 0);
      
      setPosition({
        x: Math.max(0, Math.min(newX, maxX)),
        y: Math.max(0, Math.min(newY, maxY)),
      });
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleBarcodeScan = (code: string) => {
    setFormData((prev) => ({
      ...prev,
      barcode: code,
    }));
  };

  const { isOpen: isScannerOpen, open: openScanner, close: closeScanner, handleScan } = useBarcode(handleBarcodeScan);

  const handleImageData = (data: {
    nombre: string;
    precio_sugerido: number | null;
    categoria: string;
  }) => {
    setFormData((prev) => ({
      ...prev,
      name: data.nombre,
      price: data.precio_sugerido ? (data.precio_sugerido * 100).toString() : '',
      category: data.categoria,
    }));
    setMode('manual');
  };

  const handleAudioData = (data: {
    nombre: string;
    precio: number | null;
    stock: number | null;
    categoria: string;
  }) => {
    setFormData((prev) => ({
      ...prev,
      name: data.nombre,
      price: data.precio ? (data.precio * 100).toString() : '',
      stock: data.stock ? data.stock.toString() : '',
      category: data.categoria,
    }));
    setMode('manual');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // Validar campos
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
      
      onAddProduct({
        name: formData.name.trim(),
        price_cents: Math.round(price * 100),
        stock: stock,
        category: formData.category,
        barcode: formData.barcode.trim() || undefined,
      });

      // Resetear formulario
      setFormData({
        name: '',
        price: '',
        stock: '',
        category: 'Abarrotes',
        barcode: '',
      });
      setMode('manual');
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al agregar producto');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div 
      className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      <div 
        ref={modalRef}
        className="bg-white rounded-xl shadow-lg min-w-[600px] max-w-2xl w-full max-h-[85vh] overflow-y-auto"
        style={isDragging ? {
          position: 'fixed',
          left: `${position.x}px`,
          top: `${position.y}px`,
          width: 'auto',
          margin: 0,
        } : undefined}
      >
        {/* Header */}
        <div 
          className="sticky top-0 bg-sf-primary text-white p-4 flex justify-between items-center cursor-grab active:cursor-grabbing"
          onMouseDown={handleMouseDown}
        >
          <h2 className="text-xl font-bold">Agregar Producto</h2>
          <div className="flex items-center gap-2">
            <button
              onClick={openScanner}
              className="px-3 py-1 text-sm bg-white/20 text-white rounded hover:bg-white/30 transition"
            >
              Escanear codigo
            </button>
            <button
              onClick={onClose}
              className="text-xl hover:bg-sf-dark rounded p-1 transition"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Contenido */}
        <div className="p-6 space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded text-sm">
              {error}
            </div>
          )}

          {/* Tabs de modo */}
          <div className="flex gap-2 border-b">
            <button
              onClick={() => {
                setMode('manual');
                setError('');
              }}
              className={`pb-2 px-3 font-medium text-sm transition ${
                mode === 'manual'
                  ? 'text-sf-primary border-b-2 border-sf-primary'
                  : 'text-gray-500 hover:text-sf-text'
              }`}
            >
              ✏️ Manual
            </button>
            <button
              onClick={() => {
                setMode('image');
                setError('');
              }}
              className={`pb-2 px-3 font-medium text-sm transition ${
                mode === 'image'
                  ? 'text-sf-primary border-b-2 border-sf-primary'
                  : 'text-gray-500 hover:text-sf-text'
              }`}
            >
              📷 Foto
            </button>
            <button
              onClick={() => {
                setMode('audio');
                setError('');
              }}
              className={`pb-2 px-3 font-medium text-sm transition ${
                mode === 'audio'
                  ? 'text-sf-primary border-b-2 border-sf-primary'
                  : 'text-gray-500 hover:text-sf-text'
              }`}
            >
              🎙️ Voz
            </button>
          </div>

          {/* Modo Manual */}
          {mode === 'manual' && (
            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-sf-text mb-1">
                  Nombre del Producto *
                </label>
                <input
                  type="text"
                  name="name"
                  value={formData.name}
                  onChange={handleInputChange}
                  placeholder="Ej: Arroz Diana"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sf-primary text-sf-text"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-sf-text mb-1">
                    Precio ($) *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    name="price"
                    value={formData.price}
                    onChange={handleInputChange}
                    placeholder="4200"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sf-primary text-sf-text"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-sf-text mb-1">
                    Stock *
                  </label>
                  <input
                    type="number"
                    name="stock"
                    value={formData.stock}
                    onChange={handleInputChange}
                    placeholder="50"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sf-primary text-sf-text"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-sf-text mb-1">
                  Categoría
                </label>
                <select
                  name="category"
                  value={formData.category}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sf-primary text-sf-text"
                >
                  <option>Abarrotes</option>
                  <option>Bebidas</option>
                  <option>Lácteos</option>
                  <option>Limpieza</option>
                  <option>Otros</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-sf-text mb-1">
                  Codigo de barras (opcional)
                </label>
                <input
                  type="text"
                  name="barcode"
                  value={formData.barcode}
                  onChange={handleInputChange}
                  placeholder="Escanear o escribir codigo"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sf-primary text-sf-text"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-sf-primary text-white py-2 rounded-lg hover:bg-sf-dark disabled:opacity-50 font-medium transition"
              >
                {loading ? 'Guardando...' : 'Guardar Producto'}
              </button>
            </form>
          )}

          {/* Modo Imagen */}
          {mode === 'image' && (
            <ImageUploadAI onProductData={handleImageData} onError={setError} />
          )}

          {/* Modo Audio */}
          {mode === 'audio' && (
            <AudioUploadAI onProductData={handleAudioData} onError={setError} />
          )}
        </div>
      </div>

      {isScannerOpen && (
        <BarcodeScanner onScan={handleScan} onClose={closeScanner} />
      )}
    </div>
  );
};

export default AddProductModal;
