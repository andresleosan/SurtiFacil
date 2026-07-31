import { useEffect, useState } from "react";
import { Product } from "../firebase/db";
import { getProducts } from "../services/saleService";
import { getStockAlertCount } from "../services/stockAlertService";
import AddProductModal from "./AddProductModal";

const Inventory = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [filteredProducts, setFilteredProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>("");
  const [searchTerm, setSearchTerm] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [alertCount, setAlertCount] = useState(0);

  const loadProducts = async () => {
    try {
      setLoading(true);
      const data = await getProducts();
      setProducts(data);
      setAlertCount(getStockAlertCount(data));
      applyFilters(data, searchTerm);
    } catch (err) {
      console.error("Error loading products:", err);
      setError("Error al cargar productos");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProducts();
    const interval = setInterval(loadProducts, 5000);
    return () => clearInterval(interval);
  }, []);

  const applyFilters = (productsToFilter: Product[], search: string) => {
    let filtered = productsToFilter;

    if (search.trim()) {
      filtered = filtered.filter((product) =>
        product.name.toLowerCase().includes(search.toLowerCase()),
      );
    }

    setFilteredProducts(filtered);
  };

  const handleSearch = (value: string) => {
    setSearchTerm(value);
    applyFilters(products, value);
  };

  const handleAddProduct = async (newProduct: {
    name: string;
    price_cents: number;
    stock: number;
    category: string;
  }) => {
    try {
      if (import.meta.env.VITE_FIREBASE_PROJECT_ID) {
        const { addDoc, collection } = await import("firebase/firestore");
        const { db } = await import("../firebase/config");
        const docRef = await addDoc(collection(db, "products"), {
          ...newProduct,
          createdAt: new Date(),
        });
        const productWithId = { id: docRef.id, ...newProduct } as Product;
        setProducts([...products, productWithId]);
        setFilteredProducts([...filteredProducts, productWithId]);
      } else {
        const productWithId = {
          id: `prod-${Date.now()}`,
          ...newProduct,
        } as Product;
        setProducts([...products, productWithId]);
        setFilteredProducts([...filteredProducts, productWithId]);
      }
    } catch (err) {
      setError("Error al agregar producto");
    }
  };

  const handleEditProduct = async (updatedProduct: Product) => {
    try {
      if (import.meta.env.VITE_FIREBASE_PROJECT_ID) {
        const { updateDoc, doc } = await import("firebase/firestore");
        const { db } = await import("../firebase/config");
        const productRef = doc(db, "products", updatedProduct.id);
        await updateDoc(productRef, {
          name: updatedProduct.name,
          price_cents: updatedProduct.price_cents,
          stock: updatedProduct.stock,
          category: updatedProduct.category,
        });
      }
      const updated = products.map((p) =>
        p.id === updatedProduct.id ? updatedProduct : p
      );
      setProducts(updated);
      applyFilters(updated, searchTerm);
      setEditingProduct(null);
    } catch (err) {
      setError("Error al editar producto");
    }
  };

  const handleDeleteProduct = async (productId: string) => {
    if (!confirm("¿Estás seguro de eliminar este producto?")) return;
    try {
      if (import.meta.env.VITE_FIREBASE_PROJECT_ID) {
        const { deleteDoc, doc } = await import("firebase/firestore");
        const { db } = await import("../firebase/config");
        await deleteDoc(doc(db, "products", productId));
      }
      const filtered = products.filter((p) => p.id !== productId);
      setProducts(filtered);
      applyFilters(filtered, searchTerm);
    } catch (err) {
      setError("Error al eliminar producto");
    }
  };

  const formatPrice = (cents: number) => {
    return `$${(cents / 100).toFixed(0)}`;
  };

  if (loading && products.length === 0) {
    return (
      <section className="space-y-4">
        <h2 className="text-2xl font-bold text-sf-text">Inventario</h2>
        <div className="text-center py-8 text-gray-500">
          Cargando productos...
        </div>
      </section>
    );
  }

  if (error) {
    return (
      <section className="space-y-4">
        <h2 className="text-2xl font-bold text-sf-text">Inventario</h2>
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
          {error}
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-sf-text flex items-center gap-2">
          Inventario
          {alertCount > 0 && (
            <span className="bg-red-500 text-white text-sm px-2 py-1 rounded-full font-medium">
              {alertCount} alertas
            </span>
          )}
        </h2>
        <button
          onClick={() => setShowAddModal(true)}
          className="bg-sf-primary text-white px-4 py-2 rounded-lg hover:bg-sf-dark font-medium transition flex items-center gap-2"
        >
          <span>➕</span> Agregar Producto
        </button>
      </div>

      {/* Buscador */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200">
        <input
          type="text"
          placeholder="🔍 Buscar por nombre o categoría..."
          value={searchTerm}
          onChange={(e) => handleSearch(e.target.value)}
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sf-primary text-sf-text placeholder-gray-500"
        />
      </div>

      {/* Tabla */}
      <div className="overflow-x-auto bg-white shadow-sm rounded-xl border border-gray-200">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-sf-primary text-white">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide">
                ID
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide">
                Nombre
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide">
                Categoría
              </th>
              <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide">
                Precio
              </th>
              <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide">
                Stock
              </th>
              <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide">
                Acciones
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-100">
            {filteredProducts.map((product, index) => (
              <tr
                key={product.id}
                className={
                  index % 2 === 0
                    ? "bg-white"
                    : "bg-sf-light hover:bg-gray-50 transition"
                }
              >
                <td className="px-4 py-3 text-sm font-mono text-sf-text">
                  {product.id}
                </td>
                <td className="px-4 py-3 text-sm font-medium text-sf-text">
                  {product.name}
                </td>
                <td className="px-4 py-3 text-sm">
                  <span className="bg-sf-cyan/10 text-sf-cyan px-2 py-1 rounded text-xs font-medium">
                    {product.category || "Sin categoría"}
                  </span>
                </td>
                <td className="px-4 py-3 text-sm text-right font-medium text-sf-primary">
                  {formatPrice(product.price_cents)}
                </td>
                <td className="px-4 py-3 text-sm text-right">
                  <div className="flex items-center justify-end gap-2">
                    <span
                      className={`font-medium ${
                        product.stock === 0
                          ? "text-red-600"
                          : product.stock <= 5
                          ? "text-orange-600"
                          : product.stock <= 10
                          ? "text-yellow-600"
                          : "text-sf-text"
                      }`}
                    >
                      {product.stock}
                    </span>
                    {product.stock === 0 && (
                      <span className="bg-red-100 text-red-700 px-2 py-1 rounded text-xs font-medium">
                        🔴 Sin stock
                      </span>
                    )}
                    {product.stock > 0 && product.stock <= 5 && (
                      <span className="bg-orange-100 text-orange-700 px-2 py-1 rounded text-xs font-medium">
                        🟠 Crítico
                      </span>
                    )}
                    {product.stock > 5 && product.stock <= 10 && (
                      <span className="bg-yellow-100 text-yellow-700 px-2 py-1 rounded text-xs font-medium">
                        🟡 Bajo
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3 text-center">
                  <div className="flex justify-center gap-2">
                    <button
                      title="Editar"
                      onClick={() => setEditingProduct(product)}
                      className="text-sf-primary hover:bg-sf-light rounded px-2 py-1 transition"
                    >
                      ✏️
                    </button>
                    <button
                      title="Eliminar"
                      onClick={() => handleDeleteProduct(product.id)}
                      className="text-red-600 hover:bg-red-50 rounded px-2 py-1 transition"
                    >
                      🗑️
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {filteredProducts.length === 0 && (
        <div className="text-center py-8 text-gray-500">
          {products.length === 0
            ? "No hay productos en el inventario"
            : "No hay resultados para tu búsqueda"}
        </div>
      )}

      {/* Modal para agregar producto */}
      <AddProductModal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        onAddProduct={handleAddProduct}
      />

      {/* Modal para editar producto */}
      {editingProduct && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md shadow-xl">
            <h3 className="text-lg font-bold text-sf-text mb-4">Editar Producto</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Nombre</label>
                <input
                  type="text"
                  value={editingProduct.name}
                  onChange={(e) => setEditingProduct({ ...editingProduct, name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sf-primary"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Precio (centavos)</label>
                <input
                  type="number"
                  value={editingProduct.price_cents}
                  onChange={(e) => setEditingProduct({ ...editingProduct, price_cents: parseInt(e.target.value) || 0 })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sf-primary"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Stock</label>
                <input
                  type="number"
                  value={editingProduct.stock}
                  onChange={(e) => setEditingProduct({ ...editingProduct, stock: parseInt(e.target.value) || 0 })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sf-primary"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Categoría</label>
                <input
                  type="text"
                  value={editingProduct.category || ""}
                  onChange={(e) => setEditingProduct({ ...editingProduct, category: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sf-primary"
                />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setEditingProduct(null)}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition"
              >
                Cancelar
              </button>
              <button
                onClick={() => handleEditProduct(editingProduct)}
                className="flex-1 px-4 py-2 bg-sf-primary text-white rounded-lg hover:bg-sf-dark transition"
              >
                Guardar
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};

export default Inventory;
