import { useEffect, useMemo, useState } from 'react';
import { Product } from '../firebase/db';
import { useProducts } from '../hooks/useProducts';
import { useIsMobile } from '../hooks/useMediaQuery';
import { useBarcode } from '../hooks/useBarcode';
import { useHasRole } from '../auth/CurrentUserContext';
import { addProduct, deleteProduct, updateProduct, type NewProductInput } from '../services/productService';
import { getStockAlertCount } from '../services/stockAlertService';
import { getCombos, createCombo, updateCombo, deleteCombo, subscribeToCombos } from '../services/comboService';
import { Combo, ComboItem, NewComboInput } from '../types/combo';
import AddProductModal from './AddProductModal';
import BarcodeScanner from './BarcodeScanner';
import { Icon } from './ui/Icon';
import { Modal } from './ui/Modal';
import { PageHeader } from './ui/PageHeader';
import { useConfirm } from './ui/ConfirmDialog';
import { formatCOP, formatCentsCOP } from '../utils/currency';
import { ProductImage } from './ui/ProductImage';

const formatPrice = (cents: number) => `$${(cents / 100).toFixed(0)}`;

interface EditDraft {
  name: string;
  price: string;
  stock: string;
  category: string;
  barcode: string;
  unit: string;
  min_stock: string;
  image_url: string;
  visible_kiosco: boolean;
  visible_tienda: boolean;
  en_oferta: boolean;
  precio_oferta: string;
}

const EMPTY_DRAFT: EditDraft = {
  name: '',
  price: '',
  stock: '',
  category: '',
  barcode: '',
  unit: 'unidad',
  min_stock: '5',
  image_url: '',
  visible_kiosco: true,
  visible_tienda: true,
  en_oferta: false,
  precio_oferta: '',
};

export interface PasilloDef {
  id: string;
  name: string;
  shortName: string;
  emoji: string;
  color: string;
  description: string;
  categories: string[];
}

export const PASILLOS_ABASTOS: PasilloDef[] = [
  {
    id: 'fruver',
    name: 'Frutas y Verduras',
    shortName: 'Fruver',
    emoji: '🥑',
    color: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    description: 'Tomates, plátanos, aguacate, papa y legumbres',
    categories: ['Fruver', 'Frutas y Verduras', 'Verduras', 'Frutas', 'Legumbres'],
  },
  {
    id: 'panaderia',
    name: 'Panadería y Arepas',
    shortName: 'Panadería',
    emoji: '🥖',
    color: 'bg-amber-50 text-amber-800 border-amber-200',
    description: 'Arepas de chócolo, pan campesino, calados y tostadas',
    categories: ['Panadería', 'Panadería y Arepas', 'Arepas', 'Pan'],
  },
  {
    id: 'lacteos',
    name: 'Lácteos y Huevos',
    shortName: 'Lácteos',
    emoji: '🥚',
    color: 'bg-blue-50 text-blue-800 border-blue-200',
    description: 'Leche entera, quesito antioqueño, mantequilla y huevos',
    categories: ['Lácteos', 'Lácteos y Huevos', 'Huevos', 'Quesos'],
  },
  {
    id: 'despensa',
    name: 'Granos y Despensa',
    shortName: 'Granos',
    emoji: '🍚',
    color: 'bg-orange-50 text-orange-800 border-orange-200',
    description: 'Arroz Diana, frijol bola roja, panela, lentejas y aceite',
    categories: ['Granos', 'Granos y Despensa', 'Abarrotes', 'Despensa'],
  },
  {
    id: 'carnes',
    name: 'Carnes y Salsamentaria',
    shortName: 'Carnes',
    emoji: '🥩',
    color: 'bg-rose-50 text-rose-800 border-rose-200',
    description: 'Pollo campesino, tocineta, salchichas y embutidos',
    categories: ['Carnes', 'Carnes y Salsamentaria', 'Pollo', 'Salsamentaria', 'Embutidos'],
  },
  {
    id: 'snacks',
    name: 'Snacks y Confitería',
    shortName: 'Snacks',
    emoji: '🍟',
    color: 'bg-purple-50 text-purple-800 border-purple-200',
    description: 'Papas fritas, galletas festival, chocolatinas y dulces',
    categories: ['Snacks', 'Snacks y Confitería', 'Confitería', 'Dulces', 'Galletas'],
  },
  {
    id: 'bebidas',
    name: 'Bebidas y Licores',
    shortName: 'Bebidas',
    emoji: '🥤',
    color: 'bg-cyan-50 text-cyan-800 border-cyan-200',
    description: 'Gaseosas Postobón, jugos Hit, agua, café y cerveza',
    categories: ['Bebidas', 'Bebidas y Licores', 'Gaseosas', 'Café', 'Licores'],
  },
  {
    id: 'aseo',
    name: 'Aseo y Hogar',
    shortName: 'Aseo',
    emoji: '🧼',
    color: 'bg-teal-50 text-teal-800 border-teal-200',
    description: 'Detergente, límpido, jabón Rey y esponjillas',
    categories: ['Aseo', 'Aseo y Hogar', 'Limpieza', 'Detergentes'],
  },
  {
    id: 'cuidado',
    name: 'Cuidado Personal',
    shortName: 'Cuidado',
    emoji: '🧻',
    color: 'bg-pink-50 text-pink-800 border-pink-200',
    description: 'Papel higiénico, crema dental, champú y jabón de baño',
    categories: ['Cuidado Personal', 'Higiene', 'Farmacia'],
  },
];

function matchPasillo(product: Product, pasilloId: string): boolean {
  if (pasilloId === 'all') return true;
  const def = PASILLOS_ABASTOS.find((p) => p.id === pasilloId);
  if (!def) return false;
  const cat = (product.category || '').toLowerCase();
  return def.categories.some((c) => cat.includes(c.toLowerCase()));
}

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

  // Pestañas principales
  const [activeTab, setActiveTab] = useState<'table' | 'catalog' | 'combos'>('table');

  // Filtros de catálogo y pasillos
  const [selectedPasillo, setSelectedPasillo] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [quickFilter, setQuickFilter] = useState<'all' | 'offers' | 'low_stock'>('all');

  // Modales y edición
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [editDraft, setEditDraft] = useState<EditDraft>(EMPTY_DRAFT);
  const [editError, setEditError] = useState('');
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState('');

  // Edición rápida en línea (Blinkit)
  const [inlineEditingId, setInlineEditingId] = useState<string | null>(null);
  const [inlineStock, setInlineStock] = useState<number>(0);
  const [inlinePriceCents, setInlinePriceCents] = useState<number>(0);

  // Combos
  const [combos, setCombos] = useState<Combo[]>([]);
  const [showComboModal, setShowComboModal] = useState(false);
  const [editingCombo, setEditingCombo] = useState<Combo | null>(null);
  const [comboName, setComboName] = useState('');
  const [comboDescription, setComboDescription] = useState('');
  const [comboPricePesos, setComboPricePesos] = useState('');
  const [comboImageUrl, setComboImageUrl] = useState('');
  const [comboItems, setComboItems] = useState<ComboItem[]>([]);
  const [comboSaving, setComboSaving] = useState(false);
  const [comboError, setComboError] = useState('');

  useEffect(() => {
    return subscribeToCombos(
      (data) => setCombos(data),
      (err) => console.error('Error suscribiendo a combos:', err)
    );
  }, []);

  const openEdit = (product: Product) => {
    setEditDraft({
      name: product.name,
      price: String(product.price_cents),
      stock: String(product.stock),
      category: product.category || '',
      barcode: product.barcode ?? '',
      unit: product.unit || 'unidad',
      min_stock: String(product.min_stock ?? 5),
      image_url: product.image_url ?? '',
      visible_kiosco: product.visible_kiosco !== undefined ? Boolean(product.visible_kiosco) : true,
      visible_tienda: product.visible_tienda !== undefined ? Boolean(product.visible_tienda) : true,
      en_oferta: product.en_oferta !== undefined ? Boolean(product.en_oferta) : false,
      precio_oferta: product.precio_oferta_cents ? String(product.precio_oferta_cents) : '',
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
    return products.filter((product) => {
      // Filtro de pasillo
      if (!matchPasillo(product, selectedPasillo)) return false;

      // Filtro rápido
      if (quickFilter === 'offers' && !product.en_oferta) return false;
      if (quickFilter === 'low_stock' && product.stock > (product.min_stock ?? 5)) return false;

      // Búsqueda por texto
      if (!term) return true;
      return (
        product.name.toLowerCase().includes(term) ||
        (product.category || '').toLowerCase().includes(term) ||
        (product.barcode || '').includes(term)
      );
    });
  }, [products, selectedPasillo, quickFilter, searchTerm]);

  const alertCount = useMemo(() => getStockAlertCount(products), [products]);

  // Conteo de productos por pasillo para Rappi Aisles
  const pasilloCounts = useMemo(() => {
    const counts: Record<string, number> = { all: products.length };
    PASILLOS_ABASTOS.forEach((p) => {
      counts[p.id] = products.filter((prod) => matchPasillo(prod, p.id)).length;
    });
    return counts;
  }, [products]);

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
    const minStock = parseNonNegativeInt(editDraft.min_stock) ?? 5;
    const precioOferta = editDraft.precio_oferta.trim() ? parseNonNegativeInt(editDraft.precio_oferta) : null;

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
        unit: editDraft.unit || 'unidad',
        min_stock: minStock,
        image_url: editDraft.image_url.trim() || undefined,
        visible_kiosco: editDraft.visible_kiosco,
        visible_tienda: editDraft.visible_tienda,
        en_oferta: editDraft.en_oferta,
        precio_oferta_cents: precioOferta ?? undefined,
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

  // Edición rápida en línea (Blinkit)
  const startInlineEdit = (product: Product) => {
    setInlineEditingId(product.id);
    setInlineStock(product.stock);
    setInlinePriceCents(product.price_cents);
  };

  const saveInlineEdit = async (product: Product) => {
    try {
      await updateProduct({
        ...product,
        stock: inlineStock,
        price_cents: inlinePriceCents,
      });
      setInlineEditingId(null);
    } catch (err) {
      setActionError('Error al guardar edición rápida');
    }
  };

  const toggleProductFlag = async (product: Product, flag: 'visible_kiosco' | 'visible_tienda' | 'en_oferta') => {
    try {
      const currentVal = Boolean(product[flag]);
      await updateProduct({
        ...product,
        [flag]: !currentVal,
      });
    } catch (err) {
      setActionError('Error al actualizar visibilidad');
    }
  };

  // Combos
  const openNewCombo = () => {
    setEditingCombo(null);
    setComboName('');
    setComboDescription('');
    setComboPricePesos('');
    setComboImageUrl('/images/products/combo-desayuno-paisa.svg');
    setComboItems([]);
    setComboError('');
    setShowComboModal(true);
  };

  const openEditCombo = (c: Combo) => {
    setEditingCombo(c);
    setComboName(c.name);
    setComboDescription(c.description);
    setComboPricePesos(String(Math.round(c.price_cents / 100)));
    setComboImageUrl(c.image_url || '');
    setComboItems([...c.items]);
    setComboError('');
    setShowComboModal(true);
  };

  const handleAddComboItem = (product: Product) => {
    const existing = comboItems.find((it) => it.product_id === product.id);
    if (existing) {
      setComboItems(
        comboItems.map((it) => (it.product_id === product.id ? { ...it, quantity: it.quantity + 1 } : it))
      );
    } else {
      setComboItems([
        ...comboItems,
        {
          product_id: product.id,
          product_name: product.name,
          quantity: 1,
          unit_price_cents: product.price_cents,
        },
      ]);
    }
  };

  const handleRemoveComboItem = (productId: string) => {
    setComboItems(comboItems.filter((it) => it.product_id !== productId));
  };

  const handleUpdateComboQuantity = (productId: string, delta: number) => {
    setComboItems((prev) =>
      prev
        .map((it) => {
          if (it.product_id === productId) {
            const next = it.quantity + delta;
            return next > 0 ? { ...it, quantity: next } : null;
          }
          return it;
        })
        .filter(Boolean) as ComboItem[]
    );
  };

  const handleSaveCombo = async () => {
    if (!comboName.trim()) {
      setComboError('El nombre del combo es obligatorio');
      return;
    }
    if (comboItems.length === 0) {
      setComboError('Agrega al menos un producto al combo');
      return;
    }
    const pesos = parseInt(comboPricePesos.replace(/[^0-9]/g, ''), 10);
    if (isNaN(pesos) || pesos <= 0) {
      setComboError('Ingresa un precio válido en pesos para el combo');
      return;
    }

    setComboSaving(true);
    setComboError('');

    try {
      if (editingCombo) {
        await updateCombo({
          ...editingCombo,
          name: comboName.trim(),
          description: comboDescription.trim(),
          price_cents: pesos * 100,
          items: comboItems,
          image_url: comboImageUrl.trim() || undefined,
        });
      } else {
        await createCombo({
          name: comboName.trim(),
          description: comboDescription.trim(),
          price_cents: pesos * 100,
          items: comboItems,
          image_url: comboImageUrl.trim() || undefined,
        });
      }
      setShowComboModal(false);
    } catch (err) {
      setComboError(err instanceof Error ? err.message : 'Error al guardar combo');
    } finally {
      setComboSaving(false);
    }
  };

  const handleDeleteCombo = async (comboId: string, name: string) => {
    const accepted = await confirm({
      title: 'Eliminar Combo',
      message: `¿Deseas eliminar "${name}" del catálogo?`,
      confirmLabel: 'Eliminar',
      danger: true,
    });
    if (!accepted) return;
    try {
      await deleteCombo(comboId);
    } catch (err) {
      setActionError('Error al eliminar combo');
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
        title="Inventario y Catálogo"
        badge={badge}
        actions={
          <div className="flex flex-wrap items-center gap-2">
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
          </div>
        }
      />

      {/* Selector de Pestañas Principales (Tabla, Catálogo Táctil, Combos) */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-2">
        <div className="flex rounded-xl bg-slate-100 p-1 shadow-inner">
          <button
            type="button"
            onClick={() => setActiveTab('table')}
            aria-pressed={activeTab === 'table'}
            className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
              activeTab === 'table' ? 'bg-white text-sf-primary shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Icon name="list" size={16} />
            <span>Vista Tabla</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('catalog')}
            aria-pressed={activeTab === 'catalog'}
            className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
              activeTab === 'catalog' ? 'bg-white text-sf-primary shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Icon name="grid" size={16} />
            <span>Catálogo Táctil (Blinkit + Pasillos)</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('combos')}
            aria-pressed={activeTab === 'combos'}
            className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
              activeTab === 'combos' ? 'bg-white text-sf-primary shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Icon name="package" size={16} />
            <span>Combos y Kits ({combos.length})</span>
          </button>
        </div>

        {activeTab === 'combos' && canEdit && (
          <button
            type="button"
            onClick={openNewCombo}
            className="flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white shadow-sm hover:bg-emerald-700"
          >
            <Icon name="plus" size={16} />
            <span>+ Nuevo Combo</span>
          </button>
        )}
      </div>

      {(actionError || loadError) && (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {actionError || loadError}
        </div>
      )}

      {/* ============================================================== */}
      {/* PESTAÑA 1: VISTA TABLA CLÁSICA (Mantiene total compatibilidad) */}
      {/* ============================================================== */}
      {activeTab === 'table' && (
        <>
          <div className="relative">
            <Icon
              name="search"
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
              size={20}
            />
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
                      {product.image_url ? (
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-slate-50 p-1 border border-slate-200 overflow-hidden">
                          <img
                            src={product.image_url}
                            alt=""
                            className="h-full w-full object-contain"
                            loading="lazy"
                          />
                        </div>
                      ) : (
                        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-xl border border-slate-200">
                          📦
                        </span>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium text-sf-text">{product.name}</p>
                        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-gray-500">
                          <span className="chip bg-sf-cyan/10 text-sf-cyan">{product.category || 'Sin categoría'}</span>
                          <span className="chip bg-slate-100 text-slate-700">{product.unit || 'unidad'}</span>
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
                    <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide">
                      Nombre
                    </th>
                    <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide">
                      Categoría
                    </th>
                    <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide">
                      Presentación
                    </th>
                    <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide">
                      Código
                    </th>
                    <th scope="col" className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide">
                      Precio
                    </th>
                    <th scope="col" className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide">
                      Stock
                    </th>
                    {canEdit && (
                      <th scope="col" className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide">
                        Acciones
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 bg-white">
                  {filteredProducts.map((product) => {
                    const tone = stockTone(product.stock);
                    return (
                      <tr key={product.id} className="transition hover:bg-sf-light">
                        <td className="px-4 py-3 text-sm font-medium text-sf-text">
                          <div className="flex items-center gap-3">
                            <ProductImage
                              src={product.image_url}
                              alt={product.name}
                              productName={product.name}
                              barcode={product.barcode}
                              category={product.category}
                              showOfferBadge={false}
                              containerClassName="h-10 w-10 shrink-0 rounded-lg bg-slate-50 p-1 border border-slate-200"
                              className="h-full w-full object-contain"
                              loading="lazy"
                            />
                            <span className="truncate max-w-[220px]" title={product.name}>
                              {product.name}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-sm">
                          <span className="chip bg-sf-cyan/10 text-sf-cyan">{product.category || 'Sin categoría'}</span>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600 capitalize">{product.unit || 'unidad'}</td>
                        <td className="px-4 py-3 font-mono text-sm text-gray-700">{product.barcode ?? '-'}</td>
                        <td className="px-4 py-3 text-right text-sm font-medium text-sf-primary">
                          {formatPrice(product.price_cents)}
                        </td>
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
        </>
      )}

      {/* ============================================================== */}
      {/* PESTAÑA 2: CATÁLOGO TÁCTIL Y PASILLOS (RAPPI AISLES + BLINKIT) */}
      {/* ============================================================== */}
      {activeTab === 'catalog' && (
        <div className="space-y-6">
          {/* Matriz Táctil de Pasillos de Abastos (Rappi Aisles Pattern) */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold uppercase tracking-wider text-slate-700">
                Pasillos de Abastos ({PASILLOS_ABASTOS.length})
              </h2>
              <button
                type="button"
                onClick={() => setSelectedPasillo('all')}
                className={`text-xs font-semibold ${
                  selectedPasillo === 'all' ? 'text-sf-primary underline' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                Ver todos ({products.length})
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-5">
              {PASILLOS_ABASTOS.map((pasillo) => {
                const count = pasilloCounts[pasillo.id] || 0;
                const isSelected = selectedPasillo === pasillo.id;
                return (
                  <button
                    key={pasillo.id}
                    type="button"
                    onClick={() => setSelectedPasillo(isSelected ? 'all' : pasillo.id)}
                    aria-pressed={isSelected}
                    className={`flex flex-col justify-between rounded-xl border p-3 text-left transition-all ${
                      isSelected
                        ? 'border-sf-primary bg-sf-primary/5 shadow-sm ring-2 ring-sf-primary'
                        : 'border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-2xl" aria-hidden="true">
                        {pasillo.emoji}
                      </span>
                      <span className="chip bg-slate-100 text-[10px] font-bold text-slate-600">{count}</span>
                    </div>
                    <div className="mt-2 min-w-0">
                      <p className="truncate text-xs font-bold text-sf-text">{pasillo.name}</p>
                      <p className="line-clamp-1 text-[10px] text-slate-500">{pasillo.description}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Buscador y Riel Vertical con Cuadrícula de Tarjetas (Blinkit Pattern) */}
          <div className="flex gap-4">
            {/* Riel Vertical de Categorías a la Izquierda (Blinkit) */}
            <aside className="hidden w-24 shrink-0 flex-col gap-1.5 md:flex" aria-label="Riel de pasillos">
              <button
                type="button"
                onClick={() => setSelectedPasillo('all')}
                aria-pressed={selectedPasillo === 'all'}
                className={`flex flex-col items-center justify-center rounded-xl p-2.5 text-center transition ${
                  selectedPasillo === 'all'
                    ? 'border-2 border-sf-primary bg-sf-primary/10 font-bold text-sf-primary'
                    : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                }`}
              >
                <span className="text-xl">🏪</span>
                <span className="mt-1 text-[11px] leading-tight">Todos</span>
                <span className="text-[10px] text-slate-400">({products.length})</span>
              </button>

              {PASILLOS_ABASTOS.map((pasillo) => {
                const count = pasilloCounts[pasillo.id] || 0;
                const isSelected = selectedPasillo === pasillo.id;
                return (
                  <button
                    key={pasillo.id}
                    type="button"
                    onClick={() => setSelectedPasillo(pasillo.id)}
                    aria-pressed={isSelected}
                    className={`flex flex-col items-center justify-center rounded-xl p-2.5 text-center transition ${
                      isSelected
                        ? 'border-2 border-sf-primary bg-sf-primary/10 font-bold text-sf-primary'
                        : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <span className="text-xl">{pasillo.emoji}</span>
                    <span className="mt-1 text-[11px] leading-tight">{pasillo.shortName}</span>
                    <span className="text-[10px] text-slate-400">({count})</span>
                  </button>
                );
              })}
            </aside>

            {/* Contenido Central: Buscador, Subfiltros y Tarjetas de Producto */}
            <div className="min-w-0 flex-1 space-y-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="relative flex-1">
                  <Icon
                    name="search"
                    className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                    size={18}
                  />
                  <input
                    type="search"
                    placeholder="Buscar producto en mostrador..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="input pl-9 text-sm"
                  />
                </div>

                {/* Chips de filtro rápido */}
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    onClick={() => setQuickFilter('all')}
                    className={`chip text-xs ${
                      quickFilter === 'all' ? 'bg-sf-primary text-white' : 'bg-slate-100 text-slate-700'
                    }`}
                  >
                    Todos ({filteredProducts.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setQuickFilter(quickFilter === 'offers' ? 'all' : 'offers')}
                    className={`chip text-xs ${
                      quickFilter === 'offers' ? 'bg-sf-primary text-white' : 'bg-slate-100 text-slate-700'
                    }`}
                  >
                    🏷️ En Oferta
                  </button>
                  <button
                    type="button"
                    onClick={() => setQuickFilter(quickFilter === 'low_stock' ? 'all' : 'low_stock')}
                    className={`chip text-xs ${
                      quickFilter === 'low_stock' ? 'bg-red-600 text-white' : 'bg-slate-100 text-slate-700'
                    }`}
                  >
                    ⚠️ Por Agotarse
                  </button>
                </div>
              </div>

              {/* Cuadrícula de Tarjetas Táctiles (Blinkit) */}
              {filteredProducts.length === 0 ? (
                <div className="card py-12 text-center text-gray-500">
                  No hay productos en esta categoría o búsqueda.
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {filteredProducts.map((product) => {
                    const tone = stockTone(product.stock);
                    const isInline = inlineEditingId === product.id;

                    return (
                      <div
                        key={product.id}
                        className="card flex flex-col justify-between border border-slate-200/90 p-4 transition hover:border-sf-primary hover:shadow-md"
                      >
                        <div>
                          <div className="flex items-start justify-between gap-2">
                            <ProductImage
                              src={product.image_url}
                              alt={product.name}
                              productName={product.name}
                              barcode={product.barcode}
                              category={product.category}
                              showOfferBadge={false}
                              containerClassName="h-12 w-12 shrink-0 rounded-xl bg-slate-50 p-1 border border-slate-200"
                              className="h-full w-full object-contain"
                              loading="lazy"
                            />
                            <div className="flex flex-wrap items-center justify-end gap-1">
                              <span className="chip bg-slate-100 text-[10px] font-semibold text-slate-700 capitalize">
                                {product.unit || 'unidad'}
                              </span>
                              {product.en_oferta ? (
                                <span className="chip bg-red-100 text-[10px] font-bold text-red-700">OFERTA</span>
                              ) : null}
                            </div>
                          </div>

                          <div className="mt-2 min-w-0">
                            <h3 className="truncate text-base font-bold text-sf-text" title={product.name}>
                              {product.name}
                            </h3>
                            <p className="text-xs text-slate-500">{product.category || 'General'}</p>
                          </div>
                        </div>

                        {/* Precio y Stock */}
                        <div className="mt-3 border-t border-slate-100 pt-3">
                          {isInline ? (
                            /* Modo Edición Rápida (Quick Inline Edit) */
                            <div className="space-y-2 rounded-lg bg-sf-light p-2.5 text-xs">
                              <div className="flex items-center justify-between">
                                <span className="font-semibold text-slate-700">Stock:</span>
                                <div className="flex items-center gap-1">
                                  <button
                                    type="button"
                                    onClick={() => setInlineStock(Math.max(0, inlineStock - 1))}
                                    className="icon-btn h-7 w-7 bg-white text-slate-700 shadow-sm"
                                  >
                                    -
                                  </button>
                                  <span className="w-8 text-center font-bold text-slate-800">{inlineStock}</span>
                                  <button
                                    type="button"
                                    onClick={() => setInlineStock(inlineStock + 1)}
                                    className="icon-btn h-7 w-7 bg-white text-slate-700 shadow-sm"
                                  >
                                    +
                                  </button>
                                </div>
                              </div>
                              <div className="flex items-center justify-between">
                                <span className="font-semibold text-slate-700">Precio (centavos):</span>
                                <input
                                  type="number"
                                  value={inlinePriceCents}
                                  onChange={(e) => setInlinePriceCents(Number(e.target.value) || 0)}
                                  className="w-20 rounded border border-slate-300 bg-white px-2 py-0.5 text-right font-bold"
                                />
                              </div>
                              <div className="flex justify-end gap-1.5 pt-1">
                                <button
                                  type="button"
                                  onClick={() => setInlineEditingId(null)}
                                  className="rounded px-2 py-1 text-slate-500 hover:bg-slate-200"
                                >
                                  Cancelar
                                </button>
                                <button
                                  type="button"
                                  onClick={() => saveInlineEdit(product)}
                                  className="rounded bg-emerald-600 px-3 py-1 font-bold text-white shadow-sm hover:bg-emerald-700"
                                >
                                  Guardar
                                </button>
                              </div>
                            </div>
                          ) : (
                            /* Visualización Normal */
                            <div className="flex items-center justify-between">
                              <div>
                                <p className="text-lg font-bold tabular-nums text-sf-primary">
                                  {formatPrice(product.price_cents)}
                                </p>
                                <p className={`text-xs font-semibold ${tone.text}`}>
                                  {product.stock} {product.unit || 'uds.'} disponibles
                                </p>
                              </div>

                              {canEdit && (
                                <button
                                  type="button"
                                  onClick={() => startInlineEdit(product)}
                                  title="Edición rápida de stock y precio"
                                  className="flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                                >
                                  <span>⚡ Rápido</span>
                                </button>
                              )}
                            </div>
                          )}

                          {/* Switches de Visibilidad (Kiosco / Tienda / Oferta) */}
                          {canEdit && !isInline && (
                            <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2 text-[11px] text-slate-500">
                              <button
                                type="button"
                                onClick={() => toggleProductFlag(product, 'visible_kiosco')}
                                className={`rounded px-1.5 py-0.5 font-medium transition ${
                                  product.visible_kiosco ? 'bg-blue-50 text-blue-700' : 'bg-slate-100 text-slate-400'
                                }`}
                              >
                                iPad: {product.visible_kiosco ? 'Sí' : 'No'}
                              </button>

                              <button
                                type="button"
                                onClick={() => toggleProductFlag(product, 'visible_tienda')}
                                className={`rounded px-1.5 py-0.5 font-medium transition ${
                                  product.visible_tienda ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-400'
                                }`}
                              >
                                Web: {product.visible_tienda ? 'Sí' : 'No'}
                              </button>

                              <div className="flex gap-1">
                                <button
                                  type="button"
                                  onClick={() => openEdit(product)}
                                  aria-label={`Editar ${product.name}`}
                                  className="text-sf-primary hover:underline"
                                >
                                  Editar
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* PESTAÑA 3: COMBOS Y KITS DE MERCADO                             */}
      {/* ============================================================== */}
      {activeTab === 'combos' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-sf-text">Combos y Kits de Mercado</h2>
              <p className="text-xs text-slate-500">
                Agrupa productos para vender paquetes de mercado con descuento y acelerar la facturación
              </p>
            </div>
          </div>

          {combos.length === 0 ? (
            <div className="card py-12 text-center text-slate-500">
              <span className="text-3xl" aria-hidden="true">🎁</span>
              <p className="mt-2 text-sm font-semibold">No hay combos registrados todavía</p>
              {canEdit && (
                <button
                  type="button"
                  onClick={openNewCombo}
                  className="btn-primary mt-3 text-xs"
                >
                  Crear mi primer combo
                </button>
              )}
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {combos.map((c) => {
                const individualSumCents = c.items.reduce(
                  (sum, it) => sum + it.quantity * it.unit_price_cents,
                  0
                );
                const ahorroCents = Math.max(0, individualSumCents - c.price_cents);

                return (
                  <div
                    key={c.id}
                    className="card flex flex-col justify-between border border-slate-200 p-4 transition hover:border-sf-primary hover:shadow-sm"
                  >
                    <div>
                      <div className="flex items-start justify-between">
                        <ProductImage
                          src={c.image_url}
                          alt={c.name}
                          productName={c.name}
                          showOfferBadge={false}
                          containerClassName="h-12 w-12 shrink-0 rounded-xl bg-amber-50 p-1 border border-amber-200"
                          className="h-full w-full object-contain"
                          loading="lazy"
                        />
                        {ahorroCents > 0 && (
                          <span className="chip bg-emerald-100 text-xs font-bold text-emerald-800">
                            Ahorra {formatCentsCOP(ahorroCents)}
                          </span>
                        )}
                      </div>

                      <div className="mt-2">
                        <h3 className="text-base font-bold text-sf-text">{c.name}</h3>
                        <p className="text-xs text-slate-500">{c.description}</p>
                      </div>

                      {/* Lista de productos incluidos */}
                      <div className="mt-3 rounded-lg bg-slate-50 p-2.5 text-xs text-slate-700">
                        <p className="mb-1 font-semibold text-slate-900">Incluye ({c.items.length} productos):</p>
                        <ul className="space-y-1">
                          {c.items.map((it) => (
                            <li key={it.product_id} className="flex justify-between">
                              <span>
                                {it.quantity}x {it.product_name}
                              </span>
                              <span className="text-slate-500">
                                {formatCentsCOP(it.quantity * it.unit_price_cents)}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>

                    <div className="mt-4 border-t border-slate-100 pt-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-lg font-bold tabular-nums text-sf-primary">
                            {formatCentsCOP(c.price_cents)}
                          </p>
                          {individualSumCents > c.price_cents && (
                            <p className="text-xs text-slate-400 line-through">
                              Antes: {formatCentsCOP(individualSumCents)}
                            </p>
                          )}
                        </div>

                        {canEdit && (
                          <div className="flex gap-1">
                            <button
                              type="button"
                              onClick={() => openEditCombo(c)}
                              aria-label={`Editar ${c.name}`}
                              className="icon-btn text-sf-primary hover:bg-slate-100"
                            >
                              <Icon name="pencil" size={18} />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteCombo(c.id, c.name)}
                              aria-label={`Eliminar ${c.name}`}
                              className="icon-btn text-red-600 hover:bg-red-50"
                            >
                              <Icon name="trash" size={18} />
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Botón flotante en móviles */}
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

      {/* Modal Agregar Producto */}
      <AddProductModal isOpen={showAddModal} onClose={() => setShowAddModal(false)} onAddProduct={handleAddProduct} />

      {/* Escáner de Códigos de Barras */}
      {isScannerOpen && <BarcodeScanner onScan={handleScan} onClose={closeScanner} />}

      {/* Modal Editar Producto Clásico */}
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
            <label htmlFor="edit-name" className="mb-1 block text-sm font-medium text-gray-700">
              Nombre
            </label>
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
              <label htmlFor="edit-price" className="mb-1 block text-sm font-medium text-gray-700">
                Precio (centavos)
              </label>
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
              <label htmlFor="edit-stock" className="mb-1 block text-sm font-medium text-gray-700">
                Stock
              </label>
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

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="edit-category" className="mb-1 block text-sm font-medium text-gray-700">
                Categoría
              </label>
              <input
                id="edit-category"
                type="text"
                value={editDraft.category}
                onChange={(event) => setEditDraft({ ...editDraft, category: event.target.value })}
                className="input"
              />
            </div>
            <div>
              <label htmlFor="edit-unit" className="mb-1 block text-sm font-medium text-gray-700">
                Unidad de Medida
              </label>
              <select
                id="edit-unit"
                value={editDraft.unit}
                onChange={(e) => setEditDraft({ ...editDraft, unit: e.target.value })}
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

          <div>
            <label htmlFor="edit-barcode" className="mb-1 block text-sm font-medium text-gray-700">
              Código de barras
            </label>
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

          <div>
            <label htmlFor="edit-image" className="mb-1 block text-sm font-medium text-gray-700">
              Foto o Ilustración de Empaque (URL)
            </label>
            <div className="flex items-center gap-2">
              <ProductImage
                src={editDraft.image_url}
                alt="Vista previa"
                productName={editDraft.name}
                showOfferBadge={false}
                containerClassName="h-12 w-12 shrink-0 rounded-xl bg-slate-50 p-1 border border-slate-200"
                className="h-full w-full object-contain"
              />
              <input
                id="edit-image"
                type="text"
                value={editDraft.image_url}
                onChange={(event) => setEditDraft({ ...editDraft, image_url: event.target.value })}
                placeholder="/images/products/arroz-diana-1lb.svg o URL web"
                className="input flex-1 text-xs"
              />
            </div>
          </div>

          <div className="flex gap-4 border-t border-slate-100 pt-3">
            <label className="flex items-center gap-2 text-xs font-semibold text-slate-700">
              <input
                type="checkbox"
                checked={editDraft.visible_kiosco}
                onChange={(e) => setEditDraft({ ...editDraft, visible_kiosco: e.target.checked })}
                className="rounded text-sf-primary focus:ring-sf-primary"
              />
              Visible en Kiosco iPad
            </label>
            <label className="flex items-center gap-2 text-xs font-semibold text-slate-700">
              <input
                type="checkbox"
                checked={editDraft.visible_tienda}
                onChange={(e) => setEditDraft({ ...editDraft, visible_tienda: e.target.checked })}
                className="rounded text-sf-primary focus:ring-sf-primary"
              />
              Visible en Tienda Web
            </label>
            <label className="flex items-center gap-2 text-xs font-semibold text-slate-700">
              <input
                type="checkbox"
                checked={editDraft.en_oferta}
                onChange={(e) => setEditDraft({ ...editDraft, en_oferta: e.target.checked })}
                className="rounded text-sf-primary focus:ring-sf-primary"
              />
              En Oferta
            </label>
          </div>
        </form>
      </Modal>

      {/* Modal Crear / Editar Combo de Mercado */}
      <Modal
        open={showComboModal}
        onClose={() => setShowComboModal(false)}
        title={editingCombo ? 'Editar Combo de Mercado' : 'Crear Combo o Kit de Mercado'}
        footer={
          <>
            <button type="button" onClick={() => setShowComboModal(false)} className="btn-secondary">
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleSaveCombo}
              disabled={comboSaving}
              className="btn-primary"
            >
              {comboSaving ? 'Guardando...' : 'Guardar Combo'}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          {comboError && (
            <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">
              {comboError}
            </div>
          )}

          <div>
            <label htmlFor="combo-name" className="mb-1 block text-sm font-medium text-gray-700">
              Nombre del Combo *
            </label>
            <input
              id="combo-name"
              type="text"
              value={comboName}
              onChange={(e) => setComboName(e.target.value)}
              placeholder="ej: Combo Desayuno Paisa"
              className="input"
            />
          </div>

          <div>
            <label htmlFor="combo-desc" className="mb-1 block text-sm font-medium text-gray-700">
              Descripción / Detalle para el Vecino
            </label>
            <input
              id="combo-desc"
              type="text"
              value={comboDescription}
              onChange={(e) => setComboDescription(e.target.value)}
              placeholder="ej: Chocolate Corona, Quesito y Arepas tela x5"
              className="input"
            />
          </div>

          <div>
            <label htmlFor="combo-price" className="mb-1 block text-sm font-medium text-gray-700">
              Precio Especial del Combo (Pesos COP) *
            </label>
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-bold text-slate-500">
                $
              </span>
              <input
                id="combo-price"
                type="number"
                min="0"
                step="500"
                value={comboPricePesos}
                onChange={(e) => setComboPricePesos(e.target.value)}
                placeholder="9500"
                className="input pl-8 font-bold"
              />
            </div>
          </div>

          <div>
            <label htmlFor="combo-image" className="mb-1 block text-sm font-medium text-gray-700">
              Ilustración del Combo (URL)
            </label>
            <div className="flex items-center gap-2">
              <ProductImage
                src={comboImageUrl}
                alt="Vista previa combo"
                productName={comboName || 'Combo'}
                showOfferBadge={false}
                containerClassName="h-12 w-12 shrink-0 rounded-xl bg-amber-50 p-1 border border-amber-200"
                className="h-full w-full object-contain"
              />
              <input
                id="combo-image"
                type="text"
                value={comboImageUrl}
                onChange={(e) => setComboImageUrl(e.target.value)}
                placeholder="/images/products/combo-desayuno-paisa.svg"
                className="input flex-1 text-xs"
              />
            </div>
          </div>

          {/* Selector de productos existentes */}
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-700">Productos en este Combo</p>

            {comboItems.length === 0 ? (
              <p className="py-2 text-xs text-slate-400">Selecciona productos abajo para agregarlos al combo.</p>
            ) : (
              <ul className="my-2 divide-y divide-slate-200">
                {comboItems.map((it) => (
                  <li key={it.product_id} className="flex items-center justify-between py-1.5 text-xs">
                    <span className="font-medium text-slate-800">{it.product_name}</span>
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleUpdateComboQuantity(it.product_id, -1)}
                          className="h-6 w-6 rounded bg-white font-bold shadow-sm"
                        >
                          -
                        </button>
                        <span className="w-6 text-center font-bold">{it.quantity}</span>
                        <button
                          type="button"
                          onClick={() => handleUpdateComboQuantity(it.product_id, 1)}
                          className="h-6 w-6 rounded bg-white font-bold shadow-sm"
                        >
                          +
                        </button>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemoveComboItem(it.product_id)}
                        className="text-red-500 hover:text-red-700"
                      >
                        ✕
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            {/* Selector para agregar producto */}
            <div className="mt-2 border-t border-slate-200 pt-2">
              <label htmlFor="select-combo-product" className="sr-only">
                Agregar producto
              </label>
              <select
                id="select-combo-product"
                onChange={(e) => {
                  const prod = products.find((p) => p.id === e.target.value);
                  if (prod) {
                    handleAddComboItem(prod);
                    e.target.value = '';
                  }
                }}
                defaultValue=""
                className="input text-xs"
              >
                <option value="" disabled>
                  + Selecciona un producto para agregar al combo
                </option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({formatPrice(p.price_cents)})
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </Modal>

      {confirmDialog}
    </section>
  );
};

export default Inventory;
