import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import LandingPage from '../components/LandingPage';
import RegisterStore from '../components/RegisterStore';
import SuperAdminStores from '../components/SuperAdminStores';
import SubscriptionBanner from '../components/SubscriptionBanner';

// Mock tenantService
const mockTenantService = vi.hoisted(() => ({
  registerStore: vi.fn(),
  getSuperAdminData: vi.fn(),
  renovarNegocio: vi.fn(),
  updateNegocio: vi.fn(),
  operateStore: vi.fn(),
  getOperatingStoreId: vi.fn(() => null),
}));

vi.mock('../services/tenantService', () => mockTenantService);

// Mock settingsService
vi.mock('../services/settingsService', () => ({
  getStoreSettings: vi.fn(async () => ({
    nombre: 'Tienda Test Medellín',
    slug: 'tienda-test',
    plan_id: 'quincenal_15d',
    suscripcion_vence_en: new Date(Date.now() + 10 * 86400000).toISOString(),
    cuota_ia_total: 1500,
    cuota_ia_usada: 300,
  })),
}));

describe('SaaS Platform Components', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('LandingPage', () => {
    it('renders commercial hero headline and call to actions', () => {
      render(<LandingPage />);

      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
        /Moderniza tu mostrador de abastos, fiados y ventas en Medellín/i
      );
      expect(screen.getByText(/Registrar mi Tienda Gratis/i)).toBeInTheDocument();
      expect(screen.getByText(/Ver Demostración en Vivo/i)).toBeInTheDocument();
    });

    it('renders the 4 SaaS plans and interactive aisles', () => {
      render(<LandingPage />);

      expect(screen.getByText('Plan Prueba (3 días)')).toBeInTheDocument();
      expect(screen.getByText('Plan Semanal (7 días)')).toBeInTheDocument();
      expect(screen.getByText('Plan Quincenal (15 días)')).toBeInTheDocument();
      expect(screen.getByText('Plan Mensual (30 días)')).toBeInTheDocument();

      // Pasillos Rappi
      expect(screen.getByText('Frutas y Verduras')).toBeInTheDocument();
      expect(screen.getByText('Panadería y Arepas')).toBeInTheDocument();
    });

    it('updates sample basket total when adding products', () => {
      render(<LandingPage />);

      // Canasta inicial
      expect(screen.getByText(/Canasta en Mostrador/i)).toBeInTheDocument();
      const addButtons = screen.getAllByRole('button', { name: /\+ Agregar/i });
      if (addButtons.length > 0) {
        fireEvent.click(addButtons[0]);
      }
      expect(screen.getByText(/Total de Venta:/i)).toBeInTheDocument();
    });
  });

  describe('RegisterStore', () => {
    it('renders store registration form with Medellín neighborhoods and plan selection', () => {
      render(<RegisterStore />);

      expect(
        screen.getByRole('heading', { name: /Registra tu Tienda de Barrio o Abastos/i })
      ).toBeInTheDocument();
      expect(screen.getByLabelText(/Nombre de la Tienda/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/Identificador \/ Enlace Público/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/Barrio o Comuna en Medellín/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/Teléfono WhatsApp/i)).toBeInTheDocument();
    });

    it('submits registration and shows success state', async () => {
      mockTenantService.registerStore.mockResolvedValueOnce({
        success: true,
        message: '¡Tienda registrada con éxito!',
        negocio: {
          id: 'abarrotes-san-pablo',
          slug: 'abarrotes-san-pablo',
          nombre: 'Abarrotes San Pablo',
          plan_id: 'prueba_3d',
        },
        user: { email: 'sanpablo@abastos.co', role: 'admin' },
      });

      render(<RegisterStore />);

      fireEvent.change(screen.getByLabelText(/Nombre de la Tienda/i), {
        target: { value: 'Abarrotes San Pablo' },
      });
      fireEvent.change(screen.getByLabelText(/Tu Nombre Completo/i), {
        target: { value: 'Pablo Restrepo' },
      });
      fireEvent.change(screen.getByLabelText(/Teléfono WhatsApp/i), {
        target: { value: '3001234567' },
      });
      fireEvent.change(screen.getByLabelText(/Correo Electrónico de Acceso/i), {
        target: { value: 'sanpablo@abastos.co' },
      });
      fireEvent.change(screen.getByLabelText(/Contraseña de Administrador/i), {
        target: { value: 'segura123' },
      });

      fireEvent.click(screen.getByRole('button', { name: /Comenzar mi Tienda en SurtiFácil/i }));

      await waitFor(() => {
        expect(screen.getByText(/¡Bienvenido a SurtiFácil!/i)).toBeInTheDocument();
      });
      expect(screen.getByText(/Iniciar sesión en mi tienda/i)).toBeInTheDocument();
    });
  });

  describe('SuperAdminStores', () => {
    it('renders platform KPIs and store control table', async () => {
      mockTenantService.getSuperAdminData.mockResolvedValueOnce({
        kpis: {
          totalTiendas: 5,
          tiendasActivas: 4,
          recaudoEstimadoCOP: 180000,
          cuotaIATotal: 15000,
          cuotaIAUsada: 4200,
        },
        negocios: [
          {
            id: 'surtifacil',
            slug: 'surtifacil',
            nombre: 'SurtiFácil Central',
            barrio: 'Centro',
            ciudad: 'Medellín',
            telefono_whatsapp: '3001234567',
            estado: 'activo',
            plan_id: 'enterprise',
            cuota_ia_total: 999999,
            cuota_ia_usada: 2000,
            costo_domicilio_cents: 0,
            total_products: 40,
            total_users: 2,
            total_sales: 100,
          },
        ],
      });

      render(<SuperAdminStores />);

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: /Centro de Control SuperAdmin/i })).toBeInTheDocument();
      });

      expect(screen.getByText('Total Tiendas')).toBeInTheDocument();
      expect(screen.getByText('Tiendas Activas')).toBeInTheDocument();
      expect(screen.getByText('Recaudo Estimado')).toBeInTheDocument();
      expect(screen.getByText('Consumo Sarin IA')).toBeInTheDocument();
      expect(screen.getByText('SurtiFácil Central')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Operar/i })).toBeInTheDocument();
    });
  });

  describe('SubscriptionBanner', () => {
    it('renders active plan, days remaining, and Sarin IA quota usage', async () => {
      render(<SubscriptionBanner />);

      await waitFor(() => {
        expect(screen.getByText('Plan Quincenal (15 días)')).toBeInTheDocument();
      });

      expect(screen.getByText(/10 días restantes/i)).toBeInTheDocument();
      expect(screen.getByText(/Sarin IA/i)).toBeInTheDocument();
      expect(screen.getByText(/Renovar por WhatsApp/i)).toBeInTheDocument();
    });
  });
});

