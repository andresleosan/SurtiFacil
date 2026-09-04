import { useMemo, useState } from 'react';
import { Product } from '../firebase/db';
import { useProducts } from '../hooks/useProducts';
import { useIsMobile } from '../hooks/useMediaQuery';
import { useBarcode } from '../hooks/useBarcode';
import { useHasRole } from '../auth/CurrentUserContext';
import { addProduct, deleteProduct, updateProduct, type NewProductInput } from '../services/productService';
import { getStockAlertCount } from '../services/stockAlertService';
import AddProductModal from './AddProductModal';
import BarcodeScanner from './BarcodeScanner';
import { Icon } from './ui/Icon';
import { Modal } from './ui/Modal';
import { PageHeader } from './ui/PageHeader';
import { useConfirm } from './ui/ConfirmDialog';

const formatPrice = (cents: number) => `$${(cents / 100).toFixed(0)}`;

interface EditDraft {
  name: string;
  price: string;
  stock: string;
  category: string;
  barcode: string;
}

const EMPTY_DRAFT: EditDraft = { name: '', price: '', stock: '', category: '', barcode: '' };

function parseNonNegativeInt(value: string): number | null {
  if (!/^\d+$/.test(value.trim())) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

function stockTone(stock: number): { text: string; chip: string; label: string | null } {
  if (stock === 0) return { text: 'text-red-600', chip: 'bg-red-100 text-red-700', label: 'Sin stock' };
  if (stock <= 5) return { text: 'text-orange-600', chip: 'bg-orange-100 text-orange-700', label: 'Crítico' };
  if (stock <= 10) return { text: 'text-yellow-600', chip: 'bg-yellow-100 text-yellow-700', label: 'Bajo' };
  return { text: 'text-sf-text', chip: '', label: null };
}

const Inventory = () => {
  const { products, loading, error: loadError } = useProducts();
  const isMobile = useIsMobile();
  const canEdit = useHasRole(['admin', 'manager']);
  const canDelete = useHasRole(['admin']);
  const { confirm, confirmDialog } = useConfirm();

  const [searchTerm, setSearchTerm] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [editDraft, setEditDraft] = useState<EditDraft>(EMPTY_DRAFT);
  const [editError, setEditError] = useState('');
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState('');

  const openEdit = (product: Product) => {
    setEditDraft({
      name: product.name,
      price: String(product.price_cents),
      stock: String(product.stock),
      category: product.category || '',
      barcode: product.barcode ?? '',
    });
    setEditError('');
    setEditingProduct(product);
  };

  const closeEdit = () => {
    setEditingProduct(null);
    setEditError('');
  };

  const filteredProducts = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return products;
    return products.filter(
      (product) =>
        product.name.toLowerCase().includes(term)
        || (product.category || '').toLowerCase().includes(term)
        || (product.barcode || '').includes(term),
    );
  }, [products, searchTerm]);

  const alertCount = useMemo(() => getStockAlertCount(products), [products]);

  const handleBarcodeScan = async (code: string) => {
    const found = products.find((product) => product.barcode === code);
    if (found) {
      if (canEdit) openEdit(found);
      else setSearchTerm(code);
      return;
    }
    if (!canEdit) {
      setActionError(`Código ${code} no encontrado.`);
      return;
    }
    const create = await confirm({
      title: 'Código no encontrado',
      message: `El código ${code} no está registrado. ¿Quieres crear el producto?`,
      confirmLabel: 'Crear producto',
    });
    if (create) setShowAddModal(true);
  };

  const { isOpen: isScannerOpen, open: openScanner, close: closeScanner, handleScan } = useBarcode(handleBarcodeScan);

  const handleAddProduct = async (input: NewProductInput) => {
    setActionError('');
    try {
      await addProduct(input);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Error al agregar producto');
    }
  };

  const handleSaveEdit = async () => {
    if (!editingProduct) return;
    const name = editDraft.name.trim();
    const price = parseNonNegativeInt(editDraft.price);
    const stock = parseNonNegativeInt(editDraft.stock);
    if (!name) {
      setEditError('El nombre es requerido');
      return;
    }
    if (price === null) {
      setEditError('El precio debe ser un entero en centavos mayor o igual a 0');
      return;
    }
    if (stock === null) {
      setEditError('El stock debe ser un entero mayor o igual a 0');
      return;
    }
    setEditError('');
    setActionError('');
    setSaving(true);
    try {
      await updateProduct({
        ...editingProduct,
        name,
        price_cents: price,
        stock,
        category: editDraft.category.trim(),
        barcode: editDraft.barcode.trim() || undefined,
      });
      closeEdit();
    } catch (err) {
      setEditError(err instanceof Error ? err.message : 'Error al editar producto');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (product: Product) => {
    const accepted = await confirm({
      title: 'Eliminar producto',
      message: `¿Seguro que quieres eliminar "${product.name}"? Esta acción no se puede deshacer.`,
      confirmLabel: 'Eliminar',
      danger: true,
    });
    if (!accepted) return;
    setActionError('');
    try {
      await deleteProduct(product.id);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Error al eliminar producto');
    }
  };

  const badge = alertCount > 0 ? (
    <span className="chip bg-red-500 text-white">{alertCount} alertas</span>
  ) : null;

  if (loading && products.length === 0) {
    return (
      <section className="space-y-4">
        <PageHeader title="Inventario" />
        <div className="py-8 text-center text-gray-500">Cargando productos...</div>
      </section>
    );
  }

  if (loadError && products.length === 0) {
    return (
      <section className="space-y-4">
        <PageHeader title="Inventario" />
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-700">
          {loadError}
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <PageHeader
        title="Inventario"
        badge={badge}
        actions={
          <>
            <button type="button" onClick={openScanner} className="btn-secondary">
              <Icon name="scan" size={18} />
              Escanear
            </button>
            {canEdit && !isMobile && (
              <button type="button" onClick={() => setShowAddModal(true)} className="btn-primary">
                <Icon name="plus" size={18} />
                Agregar producto
              </button>
            )}
          </>
        }
      />

      {(actionError || loadError) && (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {actionError || loadError}
        </div>
      )}

      <div className="relative">
        <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
        <label htmlFor="inventory-search" className="sr-only">
          Buscar por nombre, categoría o código
        </label>
        <input
          id="inventory-search"
          type="search"
          inputMode="search"
          placeholder="Buscar por nombre, categoría o código"
          value={searchTerm}
          onChange={(event) => setSearchTerm(event.target.value)}
          className="input pl-10"
        />
      </div>

      {filteredProducts.length === 0 ? (
        <div className="card py-8 text-center text-gray-500">
          {products.length === 0 ? 'No hay productos en el inventario' : 'No hay resultados para tu búsqueda'}
        </div>
      ) : isMobile ? (
        <ul className="space-y-2" aria-label="Productos">
          {filteredProducts.map((product) => {
            const tone = stockTone(product.stock);
            return (
              <li key={product.id} className="card p-3">
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-sf-text">{product.name}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-gray-500">
                      <span className="chip bg-sf-cyan/10 text-sf-cyan">{product.category || 'Sin categoría'}</span>
                      {product.barcode && <span className="font-mono">{product.barcode}</span>}
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-sf-primary">{formatPrice(product.price_cents)}</p>
                    <p className={`text-sm font-medium ${tone.text}`}>
                      {product.stock} <span className="text-xs font-normal text-gray-500">uds.</span>
                    </p>
                  </div>
                </div>
                {(tone.label || canEdit) && (
                  <div className="mt-2 flex items-center justify-between">
                    <span>{tone.label && <span className={`chip ${tone.chip}`}>{tone.label}</span>}</span>
                    {canEdit && (
                      <div className="flex gap-1">
                        <button
                          type="button"
                          onClick={() => openEdit(product)}
                          aria-label={`Editar ${product.name}`}
                          className="icon-btn text-sf-primary hover:bg-sf-light"
                        >
                          <Icon name="pencil" size={20} />
                        </button>
                        {canDelete && (
                          <button
                            type="button"
                            onClick={() => handleDelete(product)}
                            aria-label={`Eliminar ${product.name}`}
                            className="icon-btn text-red-600 hover:bg-red-50"
                          >
                            <Icon name="trash" size={20} />
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="card overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-sf-primary text-white">
              <tr>
                <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide">Nombre</th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide">Categoría</th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide">Código</th>
                <th scope="col" className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide">Precio</th>
                <th scope="col" className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide">Stock</th>
                {canEdit && (
                  <th scope="col" className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide">Acciones</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {filteredProducts.map((product) => {
                const tone = stockTone(product.stock);
                return (
                  <tr key={product.id} className="transition hover:bg-sf-light">
                    <td className="px-4 py-3 text-sm font-medium text-sf-text">{product.name}</td>
                    <td className="px-4 py-3 text-sm">
                      <span className="chip bg-sf-cyan/10 text-sf-cyan">{product.category || 'Sin categoría'}</span>
                    </td>
                    <td className="px-4 py-3 font-mono text-sm text-gray-700">{product.barcode ?? '-'}</td>
                    <td className="px-4 py-3 text-right text-sm font-medium text-sf-primary">{formatPrice(product.price_cents)}</td>
                    <td className="px-4 py-3 text-right text-sm">
                      <div className="flex items-center justify-end gap-2">
                        <span className={`font-medium ${tone.text}`}>{product.stock}</span>
                        {tone.label && <span className={`chip ${tone.chip}`}>{tone.label}</span>}
                      </div>
                    </td>
                    {canEdit && (
                      <td className="px-4 py-2 text-center">
                        <div className="flex justify-center gap-1">
                          <button
                            type="button"
                            onClick={() => openEdit(product)}
                            aria-label={`Editar ${product.name}`}
                            className="icon-btn h-10 w-10 text-sf-primary hover:bg-sf-light"
                          >
                            <Icon name="pencil" size={18} />
                          </button>
                          {canDelete && (
                            <button
                              type="button"
                              onClick={() => handleDelete(product)}
                              aria-label={`Eliminar ${product.name}`}
                              className="icon-btn h-10 w-10 text-red-600 hover:bg-red-50"
                            >
                              <Icon name="trash" size={18} />
                            </button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {canEdit && isMobile && (
        <button
          type="button"
          onClick={() => setShowAddModal(true)}
          aria-label="Agregar producto"
          className="fixed right-4 z-20 flex h-14 w-14 items-center justify-center rounded-full bg-sf-primary text-white shadow-lg transition hover:bg-sf-dark bottom-tabbar mb-4"
        >
          <Icon name="plus" size={26} />
        </button>
      )}

      <AddProductModal isOpen={showAddModal} onClose={() => setShowAddModal(false)} onAddProduct={handleAddProduct} />

      {isScannerOpen && <BarcodeScanner onScan={handleScan} onClose={closeScanner} />}

      <Modal
        open={editingProduct !== null}
        onClose={closeEdit}
        title="Editar producto"
        footer={
          <>
            <button type="button" onClick={closeEdit} className="btn-secondary">
              Cancelar
            </button>
            <button type="submit" form="edit-product-form" disabled={saving} className="btn-primary">
              {saving ? 'Guardando...' : 'Guardar'}
            </button>
          </>
        }
      >
        <form
          id="edit-product-form"
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            void handleSaveEdit();
          }}
        >
          {editError && (
            <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {editError}
            </div>
          )}
          <div>
            <label htmlFor="edit-name" className="mb-1 block text-sm font-medium text-gray-700">Nombre</label>
            <input
              id="edit-name"
              type="text"
              value={editDraft.name}
              onChange={(event) => setEditDraft({ ...editDraft, name: event.target.value })}
              className="input"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="edit-price" className="mb-1 block text-sm font-medium text-gray-700">Precio (centavos)</label>
              <input
                id="edit-price"
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                value={editDraft.price}
                onChange={(event) => setEditDraft({ ...editDraft, price: event.target.value })}
                className="input"
              />
            </div>
            <div>
              <label htmlFor="edit-stock" className="mb-1 block text-sm font-medium text-gray-700">Stock</label>
              <input
                id="edit-stock"
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                value={editDraft.stock}
                onChange={(event) => setEditDraft({ ...editDraft, stock: event.target.value })}
                className="input"
              />
            </div>
          </div>
          <div>
            <label htmlFor="edit-category" className="mb-1 block text-sm font-medium text-gray-700">Categoría</label>
            <input
              id="edit-category"
              type="text"
              value={editDraft.category}
              onChange={(event) => setEditDraft({ ...editDraft, category: event.target.value })}
              className="input"
            />
          </div>
          <div>
            <label htmlFor="edit-barcode" className="mb-1 block text-sm font-medium text-gray-700">Código de barras</label>
            <input
              id="edit-barcode"
              type="text"
              inputMode="numeric"
              value={editDraft.barcode}
              onChange={(event) => setEditDraft({ ...editDraft, barcode: event.target.value })}
              placeholder="EAN-13, UPC-A o QR"
              className="input"
            />
          </div>
        </form>
      </Modal>

      {confirmDialog}
    </section>
  );
};

export default Inventory;
