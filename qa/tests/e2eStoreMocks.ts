import type { Page } from '@playwright/test';

export async function mockPublicStoreApi(page: Page) {
  const orders: any[] = [];

  await page.route('**/api/**', async (route) => {
    const req = route.request();
    const url = req.url();
    const method = req.method();

    if (url.includes('/public/store/')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          store: {
            id: 'surtifacil',
            slug: 'surtifacil',
            nombre: 'SurtiFácil Abastos Central - Medellín',
            barrio: 'La Candelaria / Centro',
            ciudad: 'Medellín',
            telefono_whatsapp: '573001234567',
            direccion: 'Calle 50 # 45-12, Medellín',
            horario: 'Lunes a Domingo 7:00 AM - 9:00 PM',
            datos_pago_offline: 'Nequi / Bancolombia: 300 123 4567',
            costo_domicilio_cents: 350000,
            config: {
              slogan: 'El motor digital del tendero paisa',
              allow_kiosk: true,
              allow_whatsapp: true,
              permite_domicilio: true,
              permite_retiro: true,
            },
          },
          products: [
            {
              id: 'prod-leche-1',
              name: 'Leche Colanta Entera 1L',
              price_cents: 420000,
              stock: 40,
              unit: 'bolsa',
              category: 'Lácteos y Huevos',
              visible_kiosco: 1,
              visible_tienda: 1,
              en_oferta: 0,
            },
            {
              id: 'prod-arroz-1',
              name: 'Arroz Diana 1kg',
              price_cents: 450000,
              stock: 50,
              unit: 'bolsa',
              category: 'Granos y Despensa',
              visible_kiosco: 1,
              visible_tienda: 1,
              en_oferta: 0,
            },
            {
              id: 'prod-aguacate-1',
              name: 'Aguacate Hass Maduro',
              price_cents: 350000,
              stock: 30,
              unit: 'unidad',
              category: 'Frutas y Verduras',
              visible_kiosco: 1,
              visible_tienda: 1,
              en_oferta: 0,
            },
          ],
          combos: [
            {
              id: 'combo-1',
              name: 'Combo Desayuno Paisa',
              description: 'Leche + Arroz + Aguacate',
              price_cents: 1100000,
              items_json: '[]',
              visible_kiosco: 1,
              visible_tienda: 1,
            },
          ],
        }),
      });
      return;
    }

    if (url.includes('/customer-orders/track/')) {
      const token = url.split('/customer-orders/track/')[1];
      const found = orders.find((o) => o.tracking_token === token) || orders[0] || {
        id: 'ord-mock',
        order_code: '#T-01',
        customer_name: 'Doña Carmen Belén',
        status: 'pending',
        total_cents: 420000,
        delivery_type: 'delivery',
        delivery_address: 'Carrera 76 # 32-15 Apto 402',
        tracking_token: token || 'tk_default',
      };
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          order: found,
          store: {
            nombre: 'SurtiFácil Abastos Central',
            barrio: 'La Candelaria / Centro',
            telefono_whatsapp: '573001234567',
          },
        }),
      });
      return;
    }

    if (url.includes('/customer-orders') && method === 'POST') {
      const body = req.postDataJSON() || {};
      const newOrder = {
        id: `ord-${Date.now()}`,
        order_code: body.source === 'kiosk' ? '#K-01' : '#T-01',
        customer_name: body.customer_name || 'Cliente',
        customer_phone: body.customer_phone || '573001234567',
        delivery_type: body.delivery_type || 'pickup_counter',
        delivery_address: body.delivery_address || '',
        payment_method: body.payment_method || 'cash',
        total_cents: 420000,
        status: 'pending',
        tracking_token: `trk_${Date.now()}`,
      };
      orders.push(newOrder);
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, order: newOrder }),
      });
      return;
    }

    await route.continue();
  });
}
