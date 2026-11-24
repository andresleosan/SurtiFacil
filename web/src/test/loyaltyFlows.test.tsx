import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CurrentUserProvider } from '../auth/CurrentUserContext';
import type { Product, Sale, User } from '../firebase/db';
import type { PublicStoreData } from '../types/customerOrder';
import type {
  DiscountCoupon,
  LoyaltyAccount,
  LoyaltyConfig,
  LoyaltyLookupResponse,
  LoyaltySummary,
  PublicLoyaltyLookupResponse,
} from '../types/loyalty';
import { DEFAULT_LOYALTY_CONFIG } from '../utils/loyaltyEngine';

const hoisted = vi.hoisted(() => ({
  products: [] as Product[],
  publicStore: null as PublicStoreData | null,
  createSale: vi.fn<(...args: unknown[]) => Promise<string>>(async () => 'sale-loyalty-1'),
  createCustomerOrder: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  getLoyaltySummary: vi.fn(),
  getLoyaltyAccounts: vi.fn(),
  getCoupons: vi.fn(),
  enrollLoyaltyMember: vi.fn(),
  createCoupon: vi.fn(),
  updateCoupon: vi.fn(),
  deleteCoupon: vi.fn(),
  updateLoyaltyConfig: vi.fn(),
  lookupLoyaltyByPhone: vi.fn(),
  validateCouponStaff: vi.fn(),
  lookupPublicLoyaltyByPhone: vi.fn(),
  validatePublicCoupon: vi.fn(),
  getLoyaltyMovements: vi.fn(async () => []),
  adjustLoyaltyPoints: vi.fn(),
}));

vi.mock('../services/productService', () => ({
  subscribeToProducts: (onData: (items: Product[]) => void) => {
    onData(hoisted.products);
    return () => {};
  },
}));

vi.mock('../services/saleService', () => ({
  createSale: hoisted.createSale,
}));

vi.mock('../services/creditService', () => ({
  subscribeToCreditCustomers: (onData: (items: unknown[]) => void) => {
    onData([]);
    return () => {};
  },
}));

vi.mock('../services/settingsService', () => ({
  getStoreSettings: vi.fn(async () => ({
    id: 'surtifacil',
    slug: 'surtifacil',
    nombre: 'SurtiFácil Abastos Central',
  })),
}));

vi.mock('../services/loyaltyService', async () => {
  const actual = await vi.importActual<typeof import('../services/loyaltyService')>(
    '../services/loyaltyService'
  );
  return {
    ...actual,
    getLoyaltySummary: hoisted.getLoyaltySummary,
    getLoyaltyAccounts: hoisted.getLoyaltyAccounts,
    getCoupons: hoisted.getCoupons,
    enrollLoyaltyMember: hoisted.enrollLoyaltyMember,
    createCoupon: hoisted.createCoupon,
    updateCoupon: hoisted.updateCoupon,
    deleteCoupon: hoisted.deleteCoupon,
    updateLoyaltyConfig: hoisted.updateLoyaltyConfig,
    lookupLoyaltyByPhone: hoisted.lookupLoyaltyByPhone,
    validateCouponStaff: hoisted.validateCouponStaff,
    lookupPublicLoyaltyByPhone: hoisted.lookupPublicLoyaltyByPhone,
    validatePublicCoupon: hoisted.validatePublicCoupon,
    getLoyaltyMovements: hoisted.getLoyaltyMovements,
    adjustLoyaltyPoints: hoisted.adjustLoyaltyPoints,
  };
});

vi.mock('../services/customerOrderService', () => ({
  getPublicStore: vi.fn(async () => hoisted.publicStore),
  getCustomerOrders: vi.fn(async () => []),
  createCustomerOrder: hoisted.createCustomerOrder,
  convertOrderToSale: vi.fn(),
  updateCustomerOrderStatus: vi.fn(),
  trackCustomerOrder: vi.fn(),
}));

vi.mock('../components/BarcodeScanner', () => ({
  default: () => <div>Escáner</div>,
}));

import CreateSale from '../components/CreateSale';
import KioskMode from '../components/KioskMode';
import LoyaltyClub from '../components/LoyaltyClub';
import PublicStorefront from '../components/PublicStorefront';
import {
  generateSaleReceiptText,
  generateSaleWhatsAppText,
} from '../utils/receiptGenerator';

const ADMIN_USER: User = {
  id: 'admin-1',
  email: 'admin@surtifacil.com',
  displayName: 'Don Carlos',
  role: 'admin',
  active: true,
};

const CASHIER_USER: User = {
  id: 'cashier-1',
  email: 'cajero@surtifacil.com',
  displayName: 'Mateo Cajero',
  role: 'cashier',
  active: true,
};

const SAMPLE_ACCOUNT: LoyaltyAccount = {
  id: 'loy-carlos',
  negocio_id: 'surtifacil',
  phone: '3004567890',
  customer_name: 'Don Carlos Restrepo',
  points_balance: 85,
  lifetime_points_earned: 120,
  lifetime_points_redeemed: 35,
  total_purchases_count: 9,
  total_spent_cents: 12000000,
  active: 1,
};

const SAMPLE_COUPON: DiscountCoupon = {
  id: 'coup-vecino10',
  negocio_id: 'surtifacil',
  code: 'VECINO10',
  description: '10% de descuento vecinos',
  discount_type: 'percentage',
  discount_value: 10,
  min_purchase_cents: 1000000,
  max_discount_cents: 1000000,
  max_uses: 100,
  used_count: 3,
  active: 1,
};

const SAMPLE_MILK: Product = {
  id: 'p-leche',
  name: 'Leche Entera 1L',
  price_cents: 450000,
  stock: 30,
  category: 'Lácteos y Huevos',
  unit: 'litro',
  wholesale_tiers: [{ min_quantity: 3, unit_price_cents: 400000 }],
};

function makePublicStore(): PublicStoreData {
  return {
    id: 'surtifacil',
    slug: 'surtifacil',
    nombre: 'SurtiFácil Abastos Central',
    barrio: 'Centro',
    ciudad: 'Medellín',
    telefono_whatsapp: '+573001234567',
    direccion: 'Calle 50 # 50-20',
    horario: '7:00 AM - 9:00 PM',
    estado: 'activo',
    costo_domicilio_cents: 350000,
    config: { permite_domicilio: true, permite_retiro: true },
    loyalty_config: { ...DEFAULT_LOYALTY_CONFIG },
    products: [
      {
        id: 'p-leche',
        name: 'Leche Entera 1L',
        price_cents: 450000,
        stock: 30,
        unit: 'litro',
        category: 'Lácteos y Huevos',
        visible_kiosco: 1,
        visible_tienda: 1,
        en_oferta: 0,
        precio_oferta_cents: null,
        wholesale_tiers: [{ min_quantity: 3, unit_price_cents: 400000 }],
      },
      {
        id: 'p-arroz',
        name: 'Arroz Diana 1kg',
        price_cents: 480000,
        stock: 30,
        unit: 'kilo',
        category: 'Granos y Despensa',
        visible_kiosco: 1,
        visible_tienda: 1,
        en_oferta: 0,
        precio_oferta_cents: null,
      },
    ],
    combos: [],
  };
}

describe('Flujos del Club de Puntos del Barrio y Cupones WhatsApp', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.products = [SAMPLE_MILK];
    hoisted.publicStore = makePublicStore();

    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation(() => ({
        matches: false,
        media: '',
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });

    const summaryData: LoyaltySummary = {
      total_members: 1,
      active_points_balance: 85,
      active_points_value_cents: 425000,
      lifetime_points_earned: 120,
      lifetime_points_redeemed: 35,
      active_coupons_count: 1,
      total_coupon_redemptions: 3,
      config: { ...DEFAULT_LOYALTY_CONFIG },
    };

    hoisted.getLoyaltySummary.mockResolvedValue(summaryData);
    hoisted.getLoyaltyAccounts.mockResolvedValue([SAMPLE_ACCOUNT]);
    hoisted.getCoupons.mockResolvedValue([SAMPLE_COUPON]);
    hoisted.enrollLoyaltyMember.mockResolvedValue({
      ...SAMPLE_ACCOUNT,
      id: 'loy-lucia',
      phone: '3005559988',
      customer_name: 'Doña Lucía',
      points_balance: 15,
    });
    hoisted.createCoupon.mockResolvedValue({
      ...SAMPLE_COUPON,
      id: 'coup-paisa15',
      code: 'PAISA15',
      discount_value: 15,
    });
    hoisted.updateCoupon.mockResolvedValue({ ...SAMPLE_COUPON, active: 0 });
    hoisted.deleteCoupon.mockResolvedValue(undefined);
    hoisted.updateLoyaltyConfig.mockImplementation(async (cfg: Partial<LoyaltyConfig>) => ({
      ...DEFAULT_LOYALTY_CONFIG,
      ...cfg,
    }));

    hoisted.lookupLoyaltyByPhone.mockResolvedValue({
      enrolled: true,
      phone: '3004567890',
      account: SAMPLE_ACCOUNT,
      redeemable_value_cents: 425000,
      config: { ...DEFAULT_LOYALTY_CONFIG },
    } satisfies LoyaltyLookupResponse);

    hoisted.validateCouponStaff.mockResolvedValue({
      valid: true,
      coupon: SAMPLE_COUPON,
      discount_cents: 120000,
      final_subtotal_cents: 1080000,
    });

    hoisted.lookupPublicLoyaltyByPhone.mockResolvedValue({
      enrolled: true,
      phone: '3004567890',
      display_name: 'Don Carlos R.',
      points_balance: 85,
      redeemable_value_cents: 425000,
      config: { ...DEFAULT_LOYALTY_CONFIG },
    } satisfies PublicLoyaltyLookupResponse);

    hoisted.validatePublicCoupon.mockResolvedValue({
      valid: true,
      coupon: SAMPLE_COUPON,
      discount_cents: 120000,
      final_subtotal_cents: 1080000,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('LoyaltyClub: admin gestiona vecinos, cupones WhatsApp (sin window.confirm), compartir y reglas; cajero ve vista restringida', async () => {
    const user = userEvent.setup();
    const { unmount } = render(
      <CurrentUserProvider value={ADMIN_USER}>
        <LoyaltyClub />
      </CurrentUserProvider>
    );

    expect(await screen.findByText('Don Carlos Restrepo')).toBeInTheDocument();
    expect(screen.getByText('Vecinos Inscritos')).toBeInTheDocument();
    expect(screen.getByText('Puntos Activos en Calle')).toBeInTheDocument();

    // Inscribir nuevo vecino
    await user.click(screen.getByRole('button', { name: /Inscribir Vecino/i }));
    const enrollDialog = await screen.findByRole('dialog', { name: /Inscribir Vecino al Club de Puntos/i });
    await user.type(within(enrollDialog).getByLabelText(/Número Celular/i), '3005559988');
    await user.type(within(enrollDialog).getByLabelText(/Nombre del Vecino/i), 'Doña Lucía');
    await user.click(within(enrollDialog).getByRole('button', { name: 'Inscribir Vecino' }));
    await waitFor(() => expect(hoisted.enrollLoyaltyMember).toHaveBeenCalledOnce());

    // Pestaña Cupones WhatsApp: crear, compartir, pausar y eliminar en 2 toques
    await user.click(screen.getByRole('tab', { name: /Cupones WhatsApp/i }));
    expect(await screen.findByText('VECINO10')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Nuevo Cupón WhatsApp/i }));
    const coupDialog = await screen.findByRole('dialog', { name: /Crear Cupón Promocional WhatsApp/i });
    await user.type(within(coupDialog).getByLabelText(/Código del Cupón/i), 'PAISA15');
    await user.click(within(coupDialog).getByRole('button', { name: 'Crear Cupón' }));
    await waitFor(() => expect(hoisted.createCoupon).toHaveBeenCalledOnce());

    // Compartir WhatsApp abre modal con vista previa del cupón
    await user.click(screen.getByRole('button', { name: /Compartir WhatsApp/i }));
    const shareDialog = await screen.findByRole('dialog', { name: /Compartir Cupón VECINO10/i });
    expect(within(shareDialog).getByText(/CUPÓN DE REGALO/i)).toBeInTheDocument();
    await user.click(within(shareDialog).getByRole('button', { name: 'Cerrar' }));

    // Eliminación en 2 toques sin window.confirm
    await user.click(screen.getByRole('button', { name: 'Eliminar cupón VECINO10' }));
    await user.click(screen.getByRole('button', { name: 'Confirmar' }));
    await waitFor(() => expect(hoisted.deleteCoupon).toHaveBeenCalledWith('coup-vecino10'));

    // Pestaña Reglas del Club
    await user.click(screen.getByRole('tab', { name: /Reglas del Club/i }));
    await user.click(screen.getByRole('button', { name: 'Guardar Reglas del Club' }));
    await waitFor(() => expect(hoisted.updateLoyaltyConfig).toHaveBeenCalledOnce());

    unmount();

    // Rol Cajero: no puede crear cupones, otorgar bonos ni guardar reglas
    render(
      <CurrentUserProvider value={CASHIER_USER}>
        <LoyaltyClub />
      </CurrentUserProvider>
    );
    expect(await screen.findByText('Don Carlos Restrepo')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Nuevo Cupón WhatsApp/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Bono \/ Ajuste/i })).not.toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: /Reglas del Club/i }));
    expect(screen.queryByRole('button', { name: 'Guardar Reglas del Club' })).not.toBeInTheDocument();
  });

  it('CreateSale (POS) consulta celular, canjea puntos, aplica cupón y genera tirilla térmica con fidelización', async () => {
    const user = userEvent.setup();
    render(<CreateSale />);

    const catalogList = await screen.findByRole('list', { name: 'Productos disponibles' });
    const addMilk = within(catalogList).getByRole('button', { name: 'Agregar Leche Entera 1L' });
    await user.click(addMilk);
    await user.click(addMilk);
    await user.click(addMilk); // 3 × $4.000 = $12.000 (1200000 cents)

    // Abrir bloque Club de Puntos / Cupón
    await user.click(screen.getByRole('button', { name: /Club de Puntos \/ Cupón/i }));
    await user.type(screen.getByLabelText(/Celular del Vecino/i), '3004567890');
    await user.click(screen.getByRole('button', { name: 'Consultar' }));

    expect(await screen.findByText('Don Carlos Restrepo')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Canjear máx\./i }));

    await user.type(screen.getByLabelText(/Código de Cupón WhatsApp/i), 'VECINO10');
    await user.click(screen.getByRole('button', { name: 'Aplicar' }));
    expect(await screen.findByText(/🎟️ VECINO10/i)).toBeInTheDocument();

    // Confirmar venta: verifica 4to argumento loyaltyOptions
    await user.click(screen.getByRole('button', { name: /Confirmar venta/i }));
    await waitFor(() => expect(hoisted.createSale).toHaveBeenCalledOnce());
    expect(hoisted.createSale.mock.calls[0][3]).toEqual(
      expect.objectContaining({
        loyalty_phone: '3004567890',
        loyalty_points_redeemed: 85,
        coupon_code: 'VECINO10',
      })
    );

    // Verificar impresión en tirilla 58mm y WhatsApp
    const loyaltySale: Sale = {
      id: 'sale-loy-58',
      date: new Date('2026-11-24T15:00:00Z'),
      total: 655000,
      subtotal_cents: 1200000,
      coupon_code: 'VECINO10',
      coupon_discount_cents: 120000,
      loyalty_points_redeemed: 85,
      loyalty_discount_cents: 425000,
      loyalty_points_earned: 6,
      loyalty_balance_after: 6,
      payment_method: 'cash',
      items: [
        {
          product_id: 'p-leche',
          product_name: 'Leche Entera 1L',
          quantity: 3,
          price_cents: 400000,
          subtotal: 1200000,
        },
      ],
    };
    const thermal = generateSaleReceiptText(loyaltySale, { nombre: 'SurtiFácil Central' }, { width: '58mm' });
    expect(thermal).toContain('Cupón VECINO10:');
    expect(thermal).toContain('Canje Puntos (85 pts):');
    expect(thermal).toContain('Puntos Ganados Club:');
    expect(thermal).toContain('+6 pts');

    const wa = generateSaleWhatsAppText(loyaltySale, { nombre: 'SurtiFácil Central' });
    expect(wa).toContain('Cupón VECINO10');
    expect(wa).toContain('Canje Puntos (85 pts)');
    expect(wa).toContain('Ganaste *+6 pts*');
  });

  it('KioskMode permite consultar puntos por celular, activar canje, aplicar cupón y mostrar ahorro en Turno Gigante', async () => {
    hoisted.createCustomerOrder.mockResolvedValueOnce({
      success: true,
      order: {
        id: 'ord-k-loy',
        negocio_id: 'surtifacil',
        order_code: '#K-12',
        source: 'kiosk',
        customer_name: 'Don Carlos R.',
        customer_phone: '3004567890',
        delivery_type: 'pickup_counter',
        payment_method: 'cash',
        items_json: '[]',
        coupon_code: 'VECINO10',
        coupon_discount_cents: 120000,
        loyalty_points_redeemed: 85,
        loyalty_discount_cents: 425000,
        loyalty_points_earned: 6,
        total_cents: 655000,
        status: 'pending',
      },
    });

    const user = userEvent.setup();
    render(<KioskMode slug="surtifacil" />);

    const addBtn = await screen.findByRole('button', { name: 'Agregar Leche Entera 1L al pedido' });
    await user.click(addBtn);
    const plusBtn = await screen.findByRole('button', { name: 'Agregar otra unidad de Leche Entera 1L' });
    await user.click(plusBtn);
    await user.click(plusBtn); // 3 uds -> $12.000

    await user.click(screen.getByRole('button', { name: /CONTINUAR PEDIDO/i }));

    await user.type(await screen.findByLabelText(/Teléfono WhatsApp/i), '3004567890');
    await user.click(screen.getByRole('button', { name: /Consultar mis Puntos/i }));
    expect(await screen.findByText(/Don Carlos R\./i)).toBeInTheDocument();

    const redeemToggle = screen.getByRole('button', { name: /Usar \d+ puntos/i });
    await user.click(redeemToggle);

    await user.click(screen.getByRole('button', { name: /Siguiente: Forma de Pago/i }));
    await user.type(await screen.findByLabelText(/¿Tienes un cupón de descuento\?/i), 'VECINO10');
    await user.click(screen.getByRole('button', { name: 'Aplicar' }));
    expect(await screen.findByText(/🎟️ VECINO10/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Confirmar y Sacar Turno/i }));
    await waitFor(() => expect(hoisted.createCustomerOrder).toHaveBeenCalledOnce());
    expect(hoisted.createCustomerOrder.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        coupon_code: 'VECINO10',
        loyalty_points_redeemed: 85,
      })
    );
    expect(await screen.findByText('#K-12')).toBeInTheDocument();
    expect(screen.getByText(/Acumulas \+6 pts en tu Club/i)).toBeInTheDocument();
  });

  it('PublicStorefront muestra precios reales COP ($ 4.800), consulta puntos y aplica cupón al confirmar pedido', async () => {
    hoisted.createCustomerOrder.mockResolvedValueOnce({
      success: true,
      order: {
        id: 'ord-w-loy',
        negocio_id: 'surtifacil',
        order_code: '#W-08',
        source: 'web',
        customer_name: 'Don Carlos R.',
        delivery_type: 'pickup_counter',
        payment_method: 'cash',
        items_json: '[]',
        total_cents: 655000,
        status: 'pending',
        tracking_token: 'tk_loy_08',
      },
    });

    render(<PublicStorefront slug="surtifacil" />);

    expect(await screen.findByText('$ 4.800')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Agregar Leche Entera 1L a la canasta/i }));
    fireEvent.click(await screen.findByRole('button', { name: /Abrir canasta y confirmar pedido/i }));

    const sumBtn = await screen.findByRole('button', { name: 'Sumar uno de Leche Entera 1L' });
    fireEvent.click(sumBtn);
    fireEvent.click(sumBtn); // 3 uds = $12.000

    fireEvent.click(screen.getByRole('button', { name: /Retiro en Tienda/i }));
    fireEvent.change(screen.getByLabelText(/Teléfono \/ WhatsApp de Contacto/i), {
      target: { value: '3004567890' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Ver Puntos/i }));

    expect(await screen.findByText(/Don Carlos R\./i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Usar \d+ puntos/i }));

    fireEvent.change(screen.getByLabelText(/¿Tienes un cupón de descuento\?/i), {
      target: { value: 'VECINO10' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar' }));
    expect(await screen.findByText(/🎟️ VECINO10/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Confirmar Pedido Vecinal/i }));
    await waitFor(() => expect(hoisted.createCustomerOrder).toHaveBeenCalledOnce());
    expect(hoisted.createCustomerOrder.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        coupon_code: 'VECINO10',
        loyalty_points_redeemed: 85,
      })
    );
  });
});
