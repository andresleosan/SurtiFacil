import { useEffect, useState } from "react";
import { Product } from "../firebase/db";
import { getProducts } from "../services/saleService";
import AddProductModal from "./AddProductModal";

const Inventory = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [filteredProducts, setFilteredProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>("");
  const [searchTerm, setSearchTerm] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);

  const loadProducts = async () => {
    try {
      setLoading(true);
      const data = await getProducts();
      setProducts(data);
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
    // Recargar productos cada 5 segundos para reflejar cambios en tiempo real
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
      // Aquí deberías agregar la lógica para guardar en Firebase
      // Por ahora solo actualizamos el estado local
      const productWithId = {
        id: `prod-${Date.now()}`,
        ...newProduct,
      } as Product;

      setProducts([...products, productWithId]);
      setFilteredProducts([...filteredProducts, productWithId]);
    } catch (err) {
      setError("Error al agregar producto");
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
        <h2 className="text-2xl font-bold text-sf-text">Inventario</h2>
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
                      className={`font-medium ${product.stock < 15 ? "text-red-600" : "text-sf-text"}`}
                    >
                      {product.stock}
                    </span>
                    {product.stock < 15 && (
                      <span className="bg-red-100 text-red-700 px-2 py-1 rounded text-xs font-medium">
                        ⚠️ Bajo
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3 text-center">
                  <div className="flex justify-center gap-2">
                    <button
                      title="Editar"
                      className="text-sf-primary hover:bg-sf-light rounded px-2 py-1 transition"
                    >
                      ✏️
                    </button>
                    <button
                      title="Eliminar"
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
    </section>
  );
};

export default Inventory;
