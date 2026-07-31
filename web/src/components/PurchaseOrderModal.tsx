import { useEffect, useState } from 'react';
import { Supplier, OrderItem, Product } from '../firebase/db';
import { getProducts } from '../services/saleService';

interface PurchaseOrderModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (
    data: {
      supplierId: string;
      supplierName: string;
      items: OrderItem[];
      expectedDate?: string;
      notes?: string;
    },
    andOrder: boolean
  ) => void;
  suppliers: Supplier[];
  initialItems?: Array<{ product_id: string; quantity: number; unit_cost_cents: number }>;
}

interface RowItem extends OrderItem {
  _rowKey: number;
  _search?: string;
  _showDropdown?: boolean;
}

let rowCounter = 0;
const newRow = (): RowItem => ({
  _rowKey: ++rowCounter,
  quantity: 1,
  unit_cost_cents: 0,
  received_quantity: 0,
  isNewProduct: false,
});

const PurchaseOrderModal = ({ isOpen, onClose, onSave, suppliers, initialItems }: PurchaseOrderModalProps) => {
  const [supplierId, setSupplierId] = useState<string>('');
  const [items, setItems] = useState<RowItem[]>([newRow()]);
  const [expectedDate, setExpectedDate] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [availableProducts, setAvailableProducts] = useState<Product[]>([]);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    (async () => {
      const products = await getProducts();
      if (!cancelled) setAvailableProducts(products);
    })();
    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      setSupplierId(suppliers.find((s) => s.active)?.id || '');
      if (initialItems && initialItems.length > 0) {
        setItems(initialItems.map((it) => ({
          _rowKey: ++rowCounter,
          product_id: it.product_id,
          quantity: it.quantity,
          unit_cost_cents: it.unit_cost_cents,
          received_quantity: 0,
          isNewProduct: false,
        })));
      } else {
        setItems([newRow()]);
      }
      setExpectedDate('');
      setNotes('');
    }
  }, [isOpen, suppliers, initialItems]);

  const activeSuppliers = suppliers.filter((s) => s.active);

  const updateItem = (key: number, patch: Partial<RowItem>) => {
    setItems(items.map((it) => (it._rowKey === key ? { ...it, ...patch } : it)));
  };

  const removeItem = (key: number) => {
    setItems(items.filter((it) => it._rowKey !== key));
  };

  const addItem = () => {
    setItems([...items, newRow()]);
  };

  const selectProduct = (key: number, product: Product) => {
    setItems(
      items.map((it) =>
        it._rowKey === key
          ? { ...it, product_id: product.id, name: product.name, _search: product.name, _showDropdown: false }
          : it
      )
    );
  };

  const filteredProducts = (search: string) =>
    availableProducts.filter(
      (p) =>
        p.name.toLowerCase().includes((search || '').toLowerCase()) &&
        !p.name.toLowerCase().includes((search || '').toLowerCase().slice(0, 2)) === false
    ).slice(0, 5);

  const totalCents = items.reduce((sum, it) => sum + (it.quantity || 0) * (it.unit_cost_cents || 0), 0);
  const totalPesos = (totalCents / 100).toLocaleString();
  const canSave = supplierId !== '' && items.length > 0 && items.every((it) => it.quantity > 0);

  const handleSubmit = (andOrder: boolean) => {
    const cleanItems: OrderItem[] = items.map(({ _rowKey, _search, _showDropdown, ...rest }) => rest);
    const supplierName = suppliers.find((s) => s.id === supplierId)?.name || '';
    onSave(
      {
        supplierId,
        supplierName,
        items: cleanItems,
        expectedDate: expectedDate || undefined,
        notes: notes || undefined,
      },
      andOrder
    );
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl p-6 w-full max-w-3xl shadow-xl max-h-screen overflow-y-auto">
        <h3 className="text-lg font-bold text-sf-text mb-4 flex items-center gap-2">
          <span>📦</span> Nueva Orden de Compra
        </h3>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Proveedor</label>
            <select
              value={supplierId}
              onChange={(e) => setSupplierId(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sf-primary"
            >
              <option value="">-- Seleccionar proveedor --</option>
              {activeSuppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <div className="flex justify-between items-center mb-2">
              <label className="block text-sm font-medium text-gray-700">Ítems</label>
              <button
                type="button"
                onClick={addItem}
                className="text-sm text-sf-primary hover:text-sf-dark font-medium"
              >
                ➕ Agregar ítem
              </button>
            </div>

            <div className="space-y-3">
              {items.map((it) => (
                <div
                  key={it._rowKey}
                  className="border border-gray-200 rounded-lg p-3 bg-sf-light"
                >
                  <div className="flex justify-between items-start mb-2">
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={it.isNewProduct}
                        onChange={(e) =>
                          updateItem(it._rowKey, {
                            isNewProduct: e.target.checked,
                            product_id: undefined,
                            name: undefined,
                            category: undefined,
                          })
                        }
                      />
                      <span>📦 Producto nuevo</span>
                    </label>
                    <button
                      type="button"
                      onClick={() => removeItem(it._rowKey)}
                      className="text-red-600 hover:bg-red-50 rounded px-2 py-1 text-sm"
                    >
                      ❌
                    </button>
                  </div>

                  {!it.isNewProduct ? (
                    <div className="relative mb-2">
                      <input
                        type="text"
                        placeholder="Buscar producto por nombre..."
                        value={it._search || ''}
                        onChange={(e) =>
                          updateItem(it._rowKey, { _search: e.target.value, _showDropdown: true })
                        }
                        onFocus={() => updateItem(it._rowKey, { _showDropdown: true })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sf-primary text-sm"
                      />
                      {it._showDropdown && it._search && (
                        <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                          {filteredProducts(it._search).map((p) => (
                            <button
                              key={p.id}
                              type="button"
                              onClick={() => selectProduct(it._rowKey, p)}
                              className="w-full text-left px-3 py-2 hover:bg-sf-light text-sm"
                            >
                              <div className="font-medium">{p.name}</div>
                              <div className="text-xs text-gray-500">
                                Stock actual: {p.stock} · Precio: ${(p.price_cents / 100).toLocaleString()}
                              </div>
                            </button>
                          ))}
                          {filteredProducts(it._search).length === 0 && (
                            <div className="px-3 py-2 text-sm text-gray-500">
                              Sin resultados
                            </div>
                          )}
                        </div>
                      )}
                      {it.product_id && (
                        <div className="text-xs text-gray-600 mt-1">
                          Seleccionado: <span className="font-medium">{it.name}</span>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-2 mb-2">
                      <input
                        type="text"
                        placeholder="Nombre del producto"
                        value={it.name || ''}
                        onChange={(e) => updateItem(it._rowKey, { name: e.target.value })}
                        className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sf-primary text-sm"
                      />
                      <input
                        type="text"
                        placeholder="Categoría"
                        value={it.category || ''}
                        onChange={(e) => updateItem(it._rowKey, { category: e.target.value })}
                        className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sf-primary text-sm"
                      />
                    </div>
                  )}

                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="block text-xs text-gray-600 mb-1">Cantidad</label>
                      <input
                        type="number"
                        min={1}
                        value={it.quantity}
                        onChange={(e) =>
                          updateItem(it._rowKey, { quantity: parseInt(e.target.value) || 0 })
                        }
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sf-primary text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-600 mb-1">Costo unitario (centavos)</label>
                      <input
                        type="number"
                        min={0}
                        value={it.unit_cost_cents}
                        onChange={(e) =>
                          updateItem(it._rowKey, { unit_cost_cents: parseInt(e.target.value) || 0 })
                        }
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sf-primary text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-600 mb-1">Subtotal</label>
                      <div className="px-3 py-2 bg-gray-100 border border-gray-200 rounded-lg text-sm font-medium text-sf-primary">
                        ${((it.quantity * it.unit_cost_cents) / 100).toLocaleString()}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="border-t border-gray-200 pt-3">
            <div className="flex justify-end items-center gap-2">
              <span className="text-sm text-gray-700">Total:</span>
              <span className="text-xl font-bold text-sf-primary">${totalPesos}</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Fecha esperada</label>
              <input
                type="date"
                value={expectedDate}
                onChange={(e) => setExpectedDate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sf-primary"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Notas</label>
              <textarea
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Notas opcionales..."
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sf-primary"
              />
            </div>
          </div>
        </div>

        <div className="flex gap-3 mt-6">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => handleSubmit(false)}
            disabled={!canSave}
            className="flex-1 px-4 py-2 border border-sf-primary text-sf-primary rounded-lg hover:bg-sf-light transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Guardar borrador
          </button>
          <button
            type="button"
            onClick={() => handleSubmit(true)}
            disabled={!canSave}
            className="flex-1 px-4 py-2 bg-sf-primary text-white rounded-lg hover:bg-sf-dark transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Guardar y ordenar
          </button>
        </div>
      </div>
    </div>
  );
};

export default PurchaseOrderModal;
