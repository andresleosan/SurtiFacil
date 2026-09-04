import { useEffect, useId, useState } from 'react';
import { Supplier, OrderItem, Product } from '../firebase/db';
import { getProducts } from '../services/saleService';
import { Icon } from './ui/Icon';
import { Modal } from './ui/Modal';

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
  const idPrefix = useId();
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

  const fieldId = (name: string, key?: number) => `${idPrefix}-${name}${key !== undefined ? `-${key}` : ''}`;

  return (
    <Modal
      open={isOpen}
      onClose={onClose}
      title="Nueva Orden de Compra"
      size="lg"
      footer={
        <>
          <button type="button" onClick={onClose} className="btn-secondary">
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => handleSubmit(false)}
            disabled={!canSave}
            className="btn-secondary border-sf-primary text-sf-primary hover:bg-sf-light"
          >
            Guardar borrador
          </button>
          <button type="button" onClick={() => handleSubmit(true)} disabled={!canSave} className="btn-primary">
            Guardar y ordenar
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <label htmlFor={fieldId('supplier')} className="mb-1 block text-sm font-medium text-gray-700">
            Proveedor
          </label>
          <select
            id={fieldId('supplier')}
            value={supplierId}
            onChange={(e) => setSupplierId(e.target.value)}
            className="input"
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
          <div className="mb-2 flex items-center justify-between gap-3">
            <span className="text-sm font-medium text-gray-700">Ítems</span>
            <button type="button" onClick={addItem} className="btn-secondary text-sf-primary">
              <Icon name="plus" size={18} />
              Agregar ítem
            </button>
          </div>

          <ul className="space-y-3" aria-label="Ítems de la orden">
            {items.map((it) => (
              <li key={it._rowKey} className="rounded-lg border border-gray-200 bg-sf-light p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <label htmlFor={fieldId('new', it._rowKey)} className="flex min-h-[44px] items-center gap-2 text-sm">
                    <input
                      id={fieldId('new', it._rowKey)}
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
                      className="h-5 w-5 rounded border-gray-300 text-sf-primary focus:ring-sf-primary"
                    />
                    <span>Producto nuevo</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => removeItem(it._rowKey)}
                    aria-label="Quitar ítem"
                    className="icon-btn text-red-600 hover:bg-red-50"
                  >
                    <Icon name="trash" size={20} />
                  </button>
                </div>

                {!it.isNewProduct ? (
                  <div className="relative mb-3">
                    <label htmlFor={fieldId('search', it._rowKey)} className="sr-only">
                      Buscar producto por nombre
                    </label>
                    <input
                      id={fieldId('search', it._rowKey)}
                      type="text"
                      inputMode="search"
                      placeholder="Buscar producto por nombre..."
                      value={it._search || ''}
                      onChange={(e) =>
                        updateItem(it._rowKey, { _search: e.target.value, _showDropdown: true })
                      }
                      onFocus={() => updateItem(it._rowKey, { _showDropdown: true })}
                      className="input"
                    />
                    {it._showDropdown && it._search && (
                      <div className="absolute z-10 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg">
                        {filteredProducts(it._search).map((p) => (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => selectProduct(it._rowKey, p)}
                            className="block min-h-[44px] w-full px-3 py-2 text-left text-sm hover:bg-sf-light"
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
                      <div className="mt-1 text-xs text-gray-600">
                        Seleccionado: <span className="font-medium">{it.name}</span>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label htmlFor={fieldId('name', it._rowKey)} className="sr-only">
                        Nombre del producto
                      </label>
                      <input
                        id={fieldId('name', it._rowKey)}
                        type="text"
                        placeholder="Nombre del producto"
                        value={it.name || ''}
                        onChange={(e) => updateItem(it._rowKey, { name: e.target.value })}
                        className="input"
                      />
                    </div>
                    <div>
                      <label htmlFor={fieldId('category', it._rowKey)} className="sr-only">
                        Categoría
                      </label>
                      <input
                        id={fieldId('category', it._rowKey)}
                        type="text"
                        placeholder="Categoría"
                        value={it.category || ''}
                        onChange={(e) => updateItem(it._rowKey, { category: e.target.value })}
                        className="input"
                      />
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div>
                    <label htmlFor={fieldId('qty', it._rowKey)} className="mb-1 block text-xs text-gray-600">
                      Cantidad
                    </label>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => updateItem(it._rowKey, { quantity: Math.max(1, (it.quantity || 0) - 1) })}
                        aria-label="Disminuir cantidad"
                        className="icon-btn border border-gray-300 bg-white text-sf-text hover:bg-gray-50"
                      >
                        <Icon name="minus" size={18} />
                      </button>
                      <input
                        id={fieldId('qty', it._rowKey)}
                        type="number"
                        inputMode="numeric"
                        min={1}
                        value={it.quantity}
                        onChange={(e) =>
                          updateItem(it._rowKey, { quantity: parseInt(e.target.value) || 0 })
                        }
                        className="input text-center"
                      />
                      <button
                        type="button"
                        onClick={() => updateItem(it._rowKey, { quantity: (it.quantity || 0) + 1 })}
                        aria-label="Aumentar cantidad"
                        className="icon-btn border border-gray-300 bg-white text-sf-text hover:bg-gray-50"
                      >
                        <Icon name="plus" size={18} />
                      </button>
                    </div>
                  </div>
                  <div>
                    <label htmlFor={fieldId('cost', it._rowKey)} className="mb-1 block text-xs text-gray-600">
                      Costo unitario (centavos)
                    </label>
                    <input
                      id={fieldId('cost', it._rowKey)}
                      type="number"
                      inputMode="numeric"
                      min={0}
                      value={it.unit_cost_cents}
                      onChange={(e) =>
                        updateItem(it._rowKey, { unit_cost_cents: parseInt(e.target.value) || 0 })
                      }
                      className="input"
                    />
                  </div>
                  <div>
                    <span className="mb-1 block text-xs text-gray-600">Subtotal</span>
                    <div className="flex min-h-[44px] items-center rounded-lg border border-gray-200 bg-gray-100 px-3 text-sm font-medium text-sf-primary">
                      ${((it.quantity * it.unit_cost_cents) / 100).toLocaleString()}
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div className="border-t border-gray-200 pt-3">
          <div className="flex items-center justify-end gap-2">
            <span className="text-sm text-gray-700">Total:</span>
            <span className="text-xl font-bold text-sf-primary">${totalPesos}</span>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor={fieldId('date')} className="mb-1 block text-sm font-medium text-gray-700">
              Fecha esperada
            </label>
            <input
              id={fieldId('date')}
              type="date"
              value={expectedDate}
              onChange={(e) => setExpectedDate(e.target.value)}
              className="input"
            />
          </div>
          <div>
            <label htmlFor={fieldId('notes')} className="mb-1 block text-sm font-medium text-gray-700">
              Notas
            </label>
            <textarea
              id={fieldId('notes')}
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Notas opcionales..."
              className="input py-2"
            />
          </div>
        </div>
      </div>
    </Modal>
  );
};

export default PurchaseOrderModal;
