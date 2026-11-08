import { apiClient, emitDataChange } from './apiClient';
import type {
  CustomerOrder,
  CreateCustomerOrderInput,
  PublicStoreData,
  CustomerOrderStatus,
} from '../types/customerOrder';
import { mockProducts } from './mockData';

function isMockMode(): boolean {
  return import.meta.env.VITE_USE_MOCK_DATA === 'true';
}

// Mock in-memory orders for development & vitest when Firebase/D1 is unconfigured
let mockOrders: CustomerOrder[] = [
  {
    id: 'ord-mock-01',
    negocio_id: 'surtifacil',
    order_code: '#K-01',
    source: 'kiosk',
    customer_name: 'Doña Gloria Hernández',
    customer_phone: '3001112233',
    delivery_type: 'pickup_counter',
    payment_method: 'cash',
    items_json: JSON.stringify([
      {
        product_id: 'p1',
        product_name: 'Manzana Roja',
        quantity: 3,
        unit_price_cents: 250,
        subtotal_cents: 750,
        unit: 'unidad',
      },
      {
        product_id: 'p3',
        product_name: 'Leche Entera 1L',
        quantity: 2,
        unit_price_cents: 350,
        subtotal_cents: 700,
        unit: 'litro',
      },
    ]),
    items: [
      {
        product_id: 'p1',
        product_name: 'Manzana Roja',
        quantity: 3,
        unit_price_cents: 250,
        subtotal_cents: 750,
        unit: 'unidad',
      },
      {
        product_id: 'p3',
        product_name: 'Leche Entera 1L',
        quantity: 2,
        unit_price_cents: 350,
        subtotal_cents: 700,
        unit: 'litro',
      },
    ],
    total_cents: 1450,
    status: 'pending',
    tracking_token: 'tk_mock_k01',
    created_at: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
    updated_at: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
  },
  {
    id: 'ord-mock-02',
    negocio_id: 'surtifacil',
    order_code: '#K-02',
    source: 'kiosk',
    customer_name: 'Carlos Montoya',
    customer_phone: '3124567890',
    delivery_type: 'pickup_counter',
    payment_method: 'transfer',
    items_json: JSON.stringify([
      {
        product_id: 'p5',
        product_name: 'Huevos (Docena)',
        quantity: 1,
        unit_price_cents: 280,
        subtotal_cents: 280,
        unit: 'cubeta',
      },
    ]),
    items: [
      {
        product_id: 'p5',
        product_name: 'Huevos (Docena)',
        quantity: 1,
        unit_price_cents: 280,
        subtotal_cents: 280,
        unit: 'cubeta',
      },
    ],
    total_cents: 280,
    status: 'pending',
    tracking_token: 'tk_mock_k02',
    created_at: new Date(Date.now() - 2 * 60 * 1000).toISOString(),
    updated_at: new Date(Date.now() - 2 * 60 * 1000).toISOString(),
  },
];

/**
 * Obtiene la tienda pública y su catálogo por su slug
 */
export async function getPublicStore(slug: string): Promise<PublicStoreData> {
  const cleanSlug = (slug || '').trim().toLowerCase();

  if (!isMockMode()) {
    try {
      const response = await apiClient.get<{
        store: any;
        products: any[];
        combos: any[];
      }>(`/public/store/${cleanSlug}`);

      if (response && response.store && response.store.id) {
        return {
          id: response.store.id,
          slug: response.store.slug,
          nombre: response.store.nombre,
          barrio: response.store.barrio,
          ciudad: response.store.ciudad,
          telefono_whatsapp: response.store.telefono_whatsapp,
          direccion: response.store.direccion,
          horario: response.store.horario,
          logo_url: response.store.logo_url,
          estado: response.store.estado,
          costo_domicilio_cents: response.store.costo_domicilio_cents || 0,
          datos_pago_offline: response.store.datos_pago_offline,
          config: response.store.config || {},
          products: response.products || [],
          combos: response.combos || [],
        };
      }
    } catch (error) {
      console.warn(`Error al consultar tienda pública ${slug} desde API, usando mock fallback:`, error);
    }
  }

  // Mock Store Fallback
  return {
    id: 'surtifacil',
    slug: cleanSlug || 'surtifacil',
    nombre: 'SurtiFácil Abastos Central - Medellín',
    barrio: 'La Candelaria / Centro',
    ciudad: 'Medellín',
    telefono_whatsapp: '+573001234567',
    direccion: 'Calle 50 # 50-20, Centro, Medellín',
    horario: 'Lunes a Domingo 7:00 AM - 9:00 PM',
    logo_url: '/icon-192.png',
    estado: 'activo',
    costo_domicilio_cents: 350000, // $ 3.500 COP
    datos_pago_offline: 'Nequi / Bancolombia: 300 123 4567',
    config: {
      slogan: 'El motor digital del tendero paisa',
      allow_kiosk: true,
      allow_whatsapp: true,
      permite_domicilio: true,
      permite_retiro: true,
    },
    products: mockProducts.map((p) => ({
      id: p.id,
      name: p.name,
      price_cents: p.price_cents,
      stock: p.stock,
      unit: p.unit || 'unidad',
      category: p.category || 'General',
      image_url: p.image_url,
      barcode: p.barcode,
      visible_kiosco: 1,
      visible_tienda: 1,
      en_oferta: p.en_oferta ? 1 : 0,
      precio_oferta_cents: p.precio_oferta_cents,
    })),
    combos: [
      {
        id: 'combo-desayuno-paisa',
        name: 'Combo Desayuno Paisa',
        description: 'Chocolate Corona, quesito antioqueño y arepas tela x5',
        price_cents: 950000,
        items_json: JSON.stringify([
          { product_id: 'p3', product_name: 'Leche Entera 1L', quantity: 2, unit_price_cents: 350000 },
          { product_id: 'p4', product_name: 'Queso Cheddar', quantity: 1, unit_price_cents: 650000 },
          { product_id: 'p2', product_name: 'Pan Integral', quantity: 1, unit_price_cents: 150000 },
        ]),
        image_url: undefined,
        visible_kiosco: 1,
        visible_tienda: 1,
      },
    ],
  };
}

/**
 * Crea una orden de cliente desde Modo Kiosco, Web o WhatsApp
 */
export async function createCustomerOrder(
  input: CreateCustomerOrderInput
): Promise<{ success: boolean; order: CustomerOrder }> {
  if (!isMockMode()) {
    try {
      const response = await apiClient.post<{
        success: boolean;
        order: CustomerOrder;
      }>('/customer-orders', input);
      if (response && response.success && response.order) {
        emitDataChange('sales');
        return response;
      }
    } catch (error) {
      console.warn('Error enviando customer-order a D1, usando mock fallback:', error);
    }
  }

  // Mock Fallback
  const count = mockOrders.length + 1;
  const prefix = input.source === 'kiosk' ? 'K' : input.source === 'whatsapp' ? 'WA' : 'W';
  const orderCode = `#${prefix}-${String(count).padStart(2, '0')}`;
  const totalCents = input.items.reduce((sum, item) => {
    const price = item.unit_price_cents || 250;
    return sum + price * item.quantity;
  }, 0);

  const newOrder: CustomerOrder = {
    id: `ord-mock-${Date.now()}`,
    negocio_id: input.negocio_id || 'surtifacil',
    order_code: orderCode,
    source: input.source,
    customer_name: input.customer_name,
    customer_phone: input.customer_phone || null,
    delivery_type: input.delivery_type,
    delivery_address: input.delivery_address || null,
    delivery_neighborhood: input.delivery_neighborhood || null,
    payment_method: input.payment_method,
    items_json: JSON.stringify(
      input.items.map((i) => ({
        product_id: i.product_id,
        product_name: i.product_name || 'Producto',
        quantity: i.quantity,
        unit_price_cents: i.unit_price_cents || 250,
        subtotal_cents: (i.unit_price_cents || 250) * i.quantity,
        unit: i.unit || 'unidad',
        image_url: i.image_url,
      }))
    ),
    items: input.items.map((i) => ({
      product_id: i.product_id,
      product_name: i.product_name || 'Producto',
      quantity: i.quantity,
      unit_price_cents: i.unit_price_cents || 250,
      subtotal_cents: (i.unit_price_cents || 250) * i.quantity,
      unit: i.unit || 'unidad',
      image_url: i.image_url,
    })),
    total_cents: totalCents,
    status: 'pending',
    tracking_token: `tk_${Date.now()}`,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  mockOrders = [newOrder, ...mockOrders];
  emitDataChange('sales');
  return { success: true, order: newOrder };
}

/**
 * Obtiene los pedidos del local para la bandeja en mostrador (POS)
 */
export async function getCustomerOrders(status?: string): Promise<CustomerOrder[]> {
  if (!isMockMode()) {
    try {
      const url = status ? `/customer-orders?status=${encodeURIComponent(status)}` : '/customer-orders';
      const orders = await apiClient.get<CustomerOrder[]>(url);
      if (Array.isArray(orders)) {
        return orders.map((o) => {
          let items = o.items;
          if (!items && o.items_json) {
            try {
              items = JSON.parse(o.items_json);
            } catch {
              items = [];
            }
          }
          return { ...o, items };
        });
      }
    } catch (error) {
      console.warn('Error al consultar customer-orders desde API, usando mock:', error);
    }
  }

  // Mock list
  return mockOrders
    .filter((o) => (!status ? true : o.status === status))
    .map((o) => {
      let items = o.items;
      if (!items && o.items_json) {
        try {
          items = JSON.parse(o.items_json);
        } catch {
          items = [];
        }
      }
      return { ...o, items };
    });
}

/**
 * Actualiza el estado de una orden de cliente
 */
export async function updateCustomerOrderStatus(
  orderId: string,
  status: CustomerOrderStatus
): Promise<CustomerOrder> {
  if (!isMockMode()) {
    try {
      const updated = await apiClient.put<CustomerOrder>(`/customer-orders/${orderId}/status`, { status });
      if (updated && updated.id) {
        emitDataChange('sales');
        return updated;
      }
    } catch (error) {
      console.warn('Error actualizando estado en API, usando mock:', error);
    }
  }

  mockOrders = mockOrders.map((o) =>
    o.id === orderId ? { ...o, status, updated_at: new Date().toISOString() } : o
  );
  emitDataChange('sales');
  const found = mockOrders.find((o) => o.id === orderId);
  if (!found) throw new Error('Pedido no encontrado');
  return found;
}

/**
 * Factura y descuenta el pedido en 1 clic desde el POS
 */
export async function convertOrderToSale(
  orderId: string,
  paymentMethod?: string,
  creditCustomerId?: string,
  creditCustomerName?: string
): Promise<{ success: boolean; message: string; sale_id: string }> {
  if (!isMockMode()) {
    try {
      const result = await apiClient.post<{
        success: boolean;
        message: string;
        sale_id: string;
      }>(`/customer-orders/${orderId}/convert-to-sale`, {
        payment_method: paymentMethod,
        credit_customer_id: creditCustomerId,
        credit_customer_name: creditCustomerName,
      });
      if (result && (result.success || (result as any).ok) && result.sale_id) {
        emitDataChange('sales');
        return result;
      }
    } catch (error) {
      console.warn('Error facturando orden en D1, usando mock fallback:', error);
    }
  }

  const found = mockOrders.find((o) => o.id === orderId);
  if (!found) throw new Error('Pedido no encontrado');

  const saleId = `sale-mock-${Date.now()}`;
  mockOrders = mockOrders.map((o) =>
    o.id === orderId ? { ...o, status: 'completed', sale_id: saleId, updated_at: new Date().toISOString() } : o
  );

  emitDataChange('sales');
  return {
    success: true,
    message: `Pedido ${found.order_code} facturado y descontado exitosamente.`,
    sale_id: saleId,
  };
}

/**
 * Rastreo público de un pedido por su tracking_token
 */
export async function trackCustomerOrder(token: string): Promise<{ order: CustomerOrder; store: any }> {
  if (!isMockMode()) {
    try {
      const result = await apiClient.get<{ order: CustomerOrder; store: any }>(
        `/customer-orders/track/${encodeURIComponent(token)}`
      );
      if (result && result.order && result.order.id) {
        return result;
      }
    } catch (error) {
      console.warn('Error rastreando orden en API:', error);
    }
  }

  const found = mockOrders.find((o) => o.tracking_token === token);
  if (!found) throw new Error('Pedido no encontrado con este token.');

  return {
    order: found,
    store: {
      nombre: 'SurtiFácil Abastos Central',
      barrio: 'La Candelaria / Centro',
      telefono_whatsapp: '+573001234567',
    },
  };
}
