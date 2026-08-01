import { useState, useEffect } from "react";
import { Product, SaleItem } from "../firebase/db";
import { createSale, getProducts } from "../services/saleService";
import BarcodeScanner from "./BarcodeScanner";
import { useBarcode } from "../hooks/useBarcode";

type PaymentMethod = "cash" | "card" | "other";

const CreateSale = () => {
  // Estado del carrito
  const [cartItems, setCartItems] = useState<SaleItem[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedProductId, setSelectedProductId] = useState<string>("");
  const [quantity, setQuantity] = useState<string>("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");

  // Estado UI
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>("");
  const [success, setSuccess] = useState(false);

  const handleBarcodeScan = (code: string) => {
    setError("");
    const found = products.find((p) => p.barcode === code);
    if (!found) {
      setError(`Codigo ${code} no registrado. Agrega el producto primero.`);
      return;
    }
    if (found.stock <= 0) {
      setError(`Sin stock disponible para ${found.name}`);
      return;
    }

    const existingItem = cartItems.find((item) => item.product_id === found.id);
    if (existingItem) {
      if (existingItem.quantity + 1 > found.stock) {
        setError(
          `Stock insuficiente para ${found.name}. Disponible: ${found.stock}`,
        );
        return;
      }
      setCartItems(
        cartItems.map((item) =>
          item.product_id === found.id
            ? {
                ...item,
                quantity: item.quantity + 1,
                subtotal: (item.quantity + 1) * item.price_cents,
              }
            : item,
        ),
      );
    } else {
      setCartItems([
        ...cartItems,
        {
          product_id: found.id,
          product_name: found.name,
          quantity: 1,
          price_cents: found.price_cents,
          subtotal: found.price_cents,
        },
      ]);
    }
  };

  const { isOpen: isScannerOpen, open: openScanner, close: closeScanner, handleScan } =
    useBarcode(handleBarcodeScan);

  // Cargar productos al montar
  useEffect(() => {
    const loadProducts = async () => {
      try {
        setLoading(true);
        const data = await getProducts();
        setProducts(data);
      } catch (err) {
        console.error("Error loading products:", err);
        setError("Error al cargar productos");
      } finally {
        setLoading(false);
      }
    };
    loadProducts();
  }, []);

  // Agregar producto al carrito
  const handleAddToCart = () => {
    setError("");

    const qty = parseInt(quantity, 10);
    if (!selectedProductId) {
      setError("Selecciona un producto");
      return;
    }
    if (!qty || qty <= 0) {
      setError("Cantidad debe ser mayor a 0");
      return;
    }

    const product = products.find((p) => p.id === selectedProductId);
    if (!product) {
      setError("Producto no encontrado");
      return;
    }

    if (qty > product.stock) {
      setError(`Stock insuficiente. Disponible: ${product.stock}`);
      return;
    }

    // Verificar si el producto ya está en el carrito
    const existingItem = cartItems.find(
      (item) => item.product_id === selectedProductId,
    );
    if (existingItem) {
      const newQty = existingItem.quantity + qty;
      if (newQty > product.stock) {
        setError(
          `Stock insuficiente. Total solicitado: ${newQty}, disponible: ${product.stock}`,
        );
        return;
      }
      setCartItems(
        cartItems.map((item) =>
          item.product_id === selectedProductId
            ? {
                ...item,
                quantity: newQty,
                subtotal: newQty * item.price_cents,
              }
            : item,
        ),
      );
    } else {
      // Agregar nuevo producto
      setCartItems([
        ...cartItems,
        {
          product_id: product.id,
          product_name: product.name,
          quantity: qty,
          price_cents: product.price_cents,
          subtotal: qty * product.price_cents,
        },
      ]);
    }

    setSelectedProductId("");
    setQuantity("");
  };

  // Remover producto del carrito
  const handleRemoveFromCart = (productId: string) => {
    setCartItems(cartItems.filter((item) => item.product_id !== productId));
  };

  // Calcular total
  const total = cartItems.reduce((sum, item) => sum + item.subtotal, 0);

  // Confirmar venta
  const handleConfirmSale = async () => {
    if (cartItems.length === 0) {
      setError("El carrito está vacío");
      return;
    }

    try {
      setLoading(true);
      setError("");
      await createSale(cartItems, paymentMethod);
      setSuccess(true);
      setCartItems([]);
      setPaymentMethod("cash");

      // Recargar productos para actualizar stock
      const data = await getProducts();
      setProducts(data);

      // Limpiar mensaje de éxito después de 3 segundos
      setTimeout(() => setSuccess(false), 3000);
    } catch (err: any) {
      setError(err.message || "Error al crear la venta");
    } finally {
      setLoading(false);
    }
  };

  // Formatear precio
  const formatPrice = (cents: number) => {
    return `$${(cents / 100).toFixed(2)}`;
  };

  return (
    <section className="space-y-6">
      <h2 className="text-2xl font-bold text-sf-text">
        📝 Registrar Nueva Venta
      </h2>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
          {error}
        </div>
      )}

      {success && (
        <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded">
          ✅ Venta registrada exitosamente
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Panel de selección - izquierda */}
        <div className="lg:col-span-2 space-y-4">
          {/* Selector de producto */}
          <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200">
            <h3 className="font-semibold mb-3 text-sf-text">
              Agregar Producto
            </h3>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium mb-1 text-sf-text">
                  Producto
                </label>
                <div className="flex gap-2">
                  <select
                    value={selectedProductId}
                    onChange={(e) => setSelectedProductId(e.target.value)}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sf-primary text-sf-text"
                  >
                    <option value="">-- Selecciona un producto --</option>
                    {products
                      .filter((p) => p.stock > 0)
                      .map((product) => (
                        <option key={product.id} value={product.id}>
                          {product.name} ({product.stock} disponibles) -{" "}
                          {formatPrice(product.price_cents)}
                        </option>
                      ))}
                  </select>
                  <button
                    type="button"
                    onClick={openScanner}
                    className="px-3 py-2 bg-sf-primary text-white rounded-lg hover:opacity-90 whitespace-nowrap"
                  >
                    Escanear
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1 text-sf-text">
                  Cantidad
                </label>
                <input
                  type="number"
                  min="1"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  placeholder="Cantidad a vender"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sf-primary text-sf-text"
                />
              </div>

              <button
                onClick={handleAddToCart}
                disabled={loading}
                className="w-full bg-sf-primary text-white py-2 rounded-lg hover:bg-sf-dark disabled:opacity-50 font-medium transition"
              >
                Agregar al Carrito
              </button>
            </div>
          </div>

          {/* Carrito */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <h3 className="font-semibold p-4 border-b text-sf-text">Carrito</h3>
            {cartItems.length === 0 ? (
              <p className="text-gray-500 p-4">El carrito está vacío</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full divide-y divide-gray-200">
                  <thead className="bg-sf-primary text-white">
                    <tr>
                      <th className="px-4 py-2 text-left text-xs font-semibold uppercase">
                        Producto
                      </th>
                      <th className="px-4 py-2 text-right text-xs font-semibold uppercase">
                        Precio Unit.
                      </th>
                      <th className="px-4 py-2 text-right text-xs font-semibold uppercase">
                        Cantidad
                      </th>
                      <th className="px-4 py-2 text-right text-xs font-semibold uppercase">
                        Subtotal
                      </th>
                      <th className="px-4 py-2 text-center text-xs font-semibold uppercase">
                        Acción
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {cartItems.map((item) => (
                      <tr
                        key={item.product_id}
                        className="hover:bg-sf-light transition"
                      >
                        <td className="px-4 py-2 text-sm text-sf-text">
                          {item.product_name}
                        </td>
                        <td className="px-4 py-2 text-sm text-right text-sf-text">
                          {formatPrice(item.price_cents)}
                        </td>
                        <td className="px-4 py-2 text-sm text-right text-sf-text">
                          {item.quantity}
                        </td>
                        <td className="px-4 py-2 text-sm text-right font-medium text-sf-primary">
                          {formatPrice(item.subtotal)}
                        </td>
                        <td className="px-4 py-2 text-center">
                          <button
                            onClick={() =>
                              handleRemoveFromCart(item.product_id)
                            }
                            className="text-red-600 hover:text-red-900 text-sm font-medium"
                          >
                            ✕
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Panel de resumen - derecha */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 h-fit">
          <h3 className="font-semibold mb-4 text-sf-text">Resumen</h3>

          <div className="space-y-4 mb-6">
            <div className="flex justify-between text-sm text-sf-text">
              <span>Items:</span>
              <span className="font-medium">{cartItems.length}</span>
            </div>
            <div className="flex justify-between text-sm text-sf-text">
              <span>Cantidad total:</span>
              <span className="font-medium">
                {cartItems.reduce((sum, item) => sum + item.quantity, 0)}
              </span>
            </div>
            <div className="border-t pt-4 flex justify-between text-lg font-bold">
              <span className="text-sf-text">Total:</span>
              <span className="text-sf-primary">{formatPrice(total)}</span>
            </div>
          </div>

          <div className="space-y-3 mb-6">
            <label className="block text-sm font-medium text-sf-text">
              Método de Pago
            </label>
            <select
              value={paymentMethod}
              onChange={(e) =>
                setPaymentMethod(e.target.value as PaymentMethod)
              }
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sf-primary text-sf-text"
            >
              <option value="cash">💵 Efectivo</option>
              <option value="card">💳 Tarjeta</option>
              <option value="other">📱 Otro</option>
            </select>
          </div>

          <button
            onClick={handleConfirmSale}
            disabled={loading || cartItems.length === 0}
            className="w-full bg-green-600 text-white py-3 rounded-lg hover:bg-green-700 disabled:opacity-50 font-semibold transition"
          >
            {loading ? "Procesando..." : "✓ Confirmar Venta"}
          </button>
        </div>
      </div>

      {isScannerOpen && (
        <BarcodeScanner onScan={handleScan} onClose={closeScanner} />
      )}
    </section>
  );
};

export default CreateSale;
