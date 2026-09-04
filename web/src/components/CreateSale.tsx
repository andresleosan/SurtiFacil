import { useMemo, useState } from 'react';
import { CreditCustomer, PaymentMethod, Product, SaleItem } from '../firebase/db';
import { createSale } from '../services/saleService';
import { useProducts } from '../hooks/useProducts';
import { useCreditCustomers } from '../hooks/useCreditCustomers';
import { useIsMobile } from '../hooks/useMediaQuery';
import { useBarcode } from '../hooks/useBarcode';
import BarcodeScanner from './BarcodeScanner';
import { Icon } from './ui/Icon';
import { Modal } from './ui/Modal';
import { PageHeader } from './ui/PageHeader';

const PAYMENT_OPTIONS: Array<{ value: PaymentMethod; label: string; emoji: string }> = [
  { value: 'cash', label: 'Efectivo', emoji: '💵' },
  { value: 'card', label: 'Tarjeta', emoji: '💳' },
  { value: 'other', label: 'Otro', emoji: '📱' },
  { value: 'credit', label: 'Fiado', emoji: '📒' },
];

const formatPrice = (cents: number) => `$${(cents / 100).toFixed(2)}`;

function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

const CreateSale = () => {
  const { products, loading: productsLoading, error: productsError } = useProducts();
  const { customers: creditCustomers } = useCreditCustomers();
  const isMobile = useIsMobile();

  const [cartItems, setCartItems] = useState<SaleItem[]>([]);
  const [search, setSearch] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');
  const [creditCustomerId, setCreditCustomerId] = useState('');
  const [cartOpen, setCartOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const availableProducts = useMemo(() => {
    const term = normalize(search.trim());
    return products.filter((product) => {
      if (product.stock <= 0) return false;
      if (!term) return true;
      return (
        normalize(product.name).includes(term)
        || normalize(product.category || '').includes(term)
        || (product.barcode || '').includes(term)
      );
    });
  }, [products, search]);

  const total = cartItems.reduce((sum, item) => sum + item.subtotal, 0);
  const unitCount = cartItems.reduce((sum, item) => sum + item.quantity, 0);

  const addToCart = (product: Product, quantity = 1): boolean => {
    setError('');
    setSuccess(false);
    if (product.stock <= 0) {
      setError(`Sin stock disponible para ${product.name}`);
      return false;
    }
    const existing = cartItems.find((item) => item.product_id === product.id);
    const nextQuantity = (existing?.quantity ?? 0) + quantity;
    if (nextQuantity > product.stock) {
      setError(`Stock insuficiente para ${product.name}. Disponible: ${product.stock}`);
      return false;
    }
    setCartItems(
      existing
        ? cartItems.map((item) =>
          item.product_id === product.id
            ? { ...item, quantity: nextQuantity, subtotal: nextQuantity * item.price_cents }
            : item,
        )
        : [
          ...cartItems,
          {
            product_id: product.id,
            product_name: product.name,
            quantity,
            price_cents: product.price_cents,
            subtotal: quantity * product.price_cents,
          },
        ],
    );
    return true;
  };

  const changeQuantity = (productId: string, delta: number) => {
    setError('');
    const existing = cartItems.find((item) => item.product_id === productId);
    if (!existing) return;
    const nextQuantity = existing.quantity + delta;
    if (nextQuantity <= 0) {
      setCartItems(cartItems.filter((item) => item.product_id !== productId));
      return;
    }
    const product = products.find((candidate) => candidate.id === productId);
    if (product && nextQuantity > product.stock) {
      setError(`Stock insuficiente para ${product.name}. Disponible: ${product.stock}`);
      return;
    }
    setCartItems(
      cartItems.map((item) =>
        item.product_id === productId
          ? { ...item, quantity: nextQuantity, subtotal: nextQuantity * item.price_cents }
          : item,
      ),
    );
  };

  const removeFromCart = (productId: string) => {
    setCartItems((current) => current.filter((item) => item.product_id !== productId));
  };

  const handleBarcodeScan = (code: string) => {
    const found = products.find((product) => product.barcode === code);
    if (!found) {
      setError(`Código ${code} no registrado. Agrega el producto primero.`);
      return;
    }
    addToCart(found, 1);
  };

  const { isOpen: isScannerOpen, open: openScanner, close: closeScanner, handleScan } = useBarcode(handleBarcodeScan);

  const handleSearchSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const term = search.trim();
    if (!term) return;
    const byBarcode = products.find((product) => product.barcode === term);
    if (byBarcode) {
      if (addToCart(byBarcode, 1)) setSearch('');
      return;
    }
    if (availableProducts.length === 1) {
      if (addToCart(availableProducts[0], 1)) setSearch('');
    }
  };

  const handleConfirmSale = async () => {
    if (cartItems.length === 0) {
      setError('El carrito está vacío');
      return;
    }
    if (paymentMethod === 'credit' && !creditCustomerId) {
      setError('Selecciona el cliente al que se le fía');
      return;
    }
    try {
      setSubmitting(true);
      setError('');
      await createSale(cartItems, paymentMethod, paymentMethod === 'credit' ? creditCustomerId : undefined);
      setSuccess(true);
      setCartItems([]);
      setPaymentMethod('cash');
      setCreditCustomerId('');
      setCartOpen(false);
      window.setTimeout(() => setSuccess(false), 4000);
    } catch (err: unknown) {
      setError(err instanceof Error && err.message ? err.message : 'Error al crear la venta');
    } finally {
      setSubmitting(false);
    }
  };

  const cartPanel = (
    <CartPanel
      items={cartItems}
      total={total}
      unitCount={unitCount}
      paymentMethod={paymentMethod}
      submitting={submitting}
      onChangeQuantity={changeQuantity}
      onRemove={removeFromCart}
      onPaymentChange={setPaymentMethod}
      onConfirm={handleConfirmSale}
      compact={isMobile}
      creditCustomers={creditCustomers.filter((customer) => customer.active)}
      creditCustomerId={creditCustomerId}
      onCreditCustomerChange={setCreditCustomerId}
    />
  );

  return (
    <section className="space-y-4">
      <PageHeader
        title="Nueva venta"
        description={isMobile ? undefined : 'Toca un producto para agregarlo al carrito.'}
      />

      {error && (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}
      {success && (
        <div role="status" className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
          ✅ Venta registrada exitosamente
        </div>
      )}
      {productsError && !error && (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {productsError}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-5">
        <div className="space-y-3 lg:col-span-3">
          <form onSubmit={handleSearchSubmit} className="flex gap-2" role="search">
            <label htmlFor="pos-search" className="sr-only">
              Buscar producto o código
            </label>
            <div className="relative flex-1">
              <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
              <input
                id="pos-search"
                type="search"
                inputMode="search"
                autoComplete="off"
                enterKeyHint="done"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar producto o código"
                className="input pl-10"
              />
            </div>
            <button type="button" onClick={openScanner} className="btn-primary shrink-0" aria-label="Escanear código de barras">
              <Icon name="scan" />
              <span className="hidden sm:inline">Escanear</span>
            </button>
          </form>

          {productsLoading ? (
            <p className="py-8 text-center text-gray-500">Cargando productos...</p>
          ) : availableProducts.length === 0 ? (
            <p className="card px-4 py-8 text-center text-gray-500">
              {products.length === 0 ? 'No hay productos con stock disponible' : 'Sin resultados para tu búsqueda'}
            </p>
          ) : isMobile ? (
            <ul className="card divide-y divide-gray-100" aria-label="Productos disponibles">
              {availableProducts.map((product) => (
                <li key={product.id} className="flex items-center gap-3 px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-sf-text">{product.name}</p>
                    <p className="text-xs text-gray-500">
                      {formatPrice(product.price_cents)} · {product.stock} disp.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => addToCart(product, 1)}
                    aria-label={`Agregar ${product.name}`}
                    className="icon-btn bg-sf-primary text-white hover:bg-sf-dark"
                  >
                    <Icon name="plus" />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <ul className="grid grid-cols-2 gap-3 xl:grid-cols-3" aria-label="Productos disponibles">
              {availableProducts.map((product) => (
                <li key={product.id}>
                  <button
                    type="button"
                    onClick={() => addToCart(product, 1)}
                    aria-label={`Agregar ${product.name}`}
                    className="card flex min-h-[96px] w-full flex-col justify-between p-3 text-left transition hover:border-sf-primary hover:shadow-md active:scale-[0.99]"
                  >
                    <span className="line-clamp-2 font-medium text-sf-text">{product.name}</span>
                    <span className="mt-2 flex items-center justify-between text-sm">
                      <span className="font-semibold text-sf-primary">{formatPrice(product.price_cents)}</span>
                      <span className="text-xs text-gray-500">{product.stock} disp.</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {!isMobile && (
          <aside className="lg:col-span-2">
            <div className="card sticky top-4 p-4">{cartPanel}</div>
          </aside>
        )}
      </div>

      {isMobile && (
        <>
          <div className="fixed inset-x-0 z-20 border-t border-gray-200 bg-white px-4 py-2 shadow-[0_-4px_12px_rgba(0,0,0,0.06)] bottom-tabbar">
            <button
              type="button"
              onClick={() => setCartOpen(true)}
              disabled={cartItems.length === 0}
              className="btn-success w-full justify-between px-4"
              aria-label={`Ver carrito, ${unitCount} artículos, total ${formatPrice(total)}`}
            >
              <span className="flex items-center gap-2">
                <Icon name="cart" />
                <span>{unitCount} {unitCount === 1 ? 'artículo' : 'artículos'}</span>
              </span>
              <span className="text-base font-bold">{formatPrice(total)}</span>
            </button>
          </div>
          <Modal open={cartOpen} onClose={() => setCartOpen(false)} title={`Carrito (${unitCount})`} size="md">
            {cartPanel}
          </Modal>
        </>
      )}

      {isScannerOpen && <BarcodeScanner onScan={handleScan} onClose={closeScanner} />}
    </section>
  );
};

interface CartPanelProps {
  creditCustomers: CreditCustomer[];
  creditCustomerId: string;
  onCreditCustomerChange: (customerId: string) => void;
  items: SaleItem[];
  total: number;
  unitCount: number;
  paymentMethod: PaymentMethod;
  submitting: boolean;
  compact: boolean;
  onChangeQuantity: (productId: string, delta: number) => void;
  onRemove: (productId: string) => void;
  onPaymentChange: (method: PaymentMethod) => void;
  onConfirm: () => void;
}

function CartPanel({
  creditCustomers,
  creditCustomerId,
  onCreditCustomerChange,
  items,
  total,
  unitCount,
  paymentMethod,
  submitting,
  compact,
  onChangeQuantity,
  onRemove,
  onPaymentChange,
  onConfirm,
}: CartPanelProps) {
  return (
    <div className="space-y-4">
      {!compact && <h3 className="font-semibold text-sf-text">Carrito</h3>}

      {items.length === 0 ? (
        <p className="py-6 text-center text-sm text-gray-500">El carrito está vacío</p>
      ) : (
        <ul className="divide-y divide-gray-100" aria-label="Artículos en el carrito">
          {items.map((item) => (
            <li key={item.product_id} className="flex items-center gap-2 py-2">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-sf-text">{item.product_name}</p>
                <p className="text-xs text-gray-500">
                  {formatPrice(item.price_cents)} c/u · <span className="font-semibold text-sf-primary">{formatPrice(item.subtotal)}</span>
                </p>
              </div>
              <div className="flex items-center rounded-lg border border-gray-300" role="group" aria-label={`Cantidad de ${item.product_name}`}>
                <button
                  type="button"
                  onClick={() => onChangeQuantity(item.product_id, -1)}
                  aria-label={`Quitar uno de ${item.product_name}`}
                  className="icon-btn h-10 w-10 text-sf-text hover:bg-gray-100"
                >
                  <Icon name="minus" size={18} />
                </button>
                <span className="min-w-[2rem] text-center text-sm font-semibold" aria-live="polite">
                  {item.quantity}
                </span>
                <button
                  type="button"
                  onClick={() => onChangeQuantity(item.product_id, 1)}
                  aria-label={`Agregar uno de ${item.product_name}`}
                  className="icon-btn h-10 w-10 text-sf-text hover:bg-gray-100"
                >
                  <Icon name="plus" size={18} />
                </button>
              </div>
              <button
                type="button"
                onClick={() => onRemove(item.product_id)}
                aria-label={`Eliminar ${item.product_name} del carrito`}
                className="icon-btn h-10 w-10 text-red-600 hover:bg-red-50"
              >
                <Icon name="trash" size={18} />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="space-y-1 border-t border-gray-200 pt-3 text-sm text-sf-text">
        <div className="flex justify-between">
          <span>Artículos</span>
          <span className="font-medium">{unitCount}</span>
        </div>
        <div className="flex justify-between text-lg font-bold">
          <span>Total</span>
          <span className="text-sf-primary">{formatPrice(total)}</span>
        </div>
      </div>

      <fieldset>
        <legend className="mb-2 text-sm font-medium text-sf-text">Método de pago</legend>
        <div className="grid grid-cols-4 gap-2" role="radiogroup">
          {PAYMENT_OPTIONS.map((option) => {
            const selected = option.value === paymentMethod;
            return (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => onPaymentChange(option.value)}
                className={`flex min-h-[44px] flex-col items-center justify-center rounded-lg border px-2 text-xs font-medium transition ${
                  selected ? 'border-sf-primary bg-sf-primary/10 text-sf-primary' : 'border-gray-300 text-gray-700 hover:bg-gray-50'
                }`}
              >
                <span aria-hidden="true">{option.emoji}</span>
                {option.label}
              </button>
            );
          })}
        </div>
      </fieldset>

      {paymentMethod === 'credit' && (
        <div>
          <label htmlFor="credit-customer" className="mb-1 block text-sm font-medium text-sf-text">Cliente al que se le fía</label>
          <select
            id="credit-customer"
            value={creditCustomerId}
            onChange={(event) => onCreditCustomerChange(event.target.value)}
            className="input"
          >
            <option value="">-- Selecciona un cliente --</option>
            {creditCustomers.map((customer) => (
              <option key={customer.id} value={customer.id}>
                {customer.name}{customer.balance_cents > 0 ? ` (debe ${formatPrice(customer.balance_cents)})` : ''}
              </option>
            ))}
          </select>
          {creditCustomers.length === 0 && (
            <p className="mt-1 text-xs text-gray-500">No hay clientes de fiado activos. Créalos en la sección Fiados.</p>
          )}
        </div>
      )}

      <button
        type="button"
        onClick={onConfirm}
        disabled={submitting || items.length === 0 || (paymentMethod === 'credit' && !creditCustomerId)}
        className="btn-success w-full py-3 text-base"
      >
        {submitting ? 'Procesando...' : `Confirmar venta · ${formatPrice(total)}`}
      </button>
    </div>
  );
}

export default CreateSale;
