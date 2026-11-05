import { useEffect, useState, type FormEvent } from 'react';
import { PageHeader } from './ui/PageHeader';
import { Icon } from './ui/Icon';
import { useHasRole } from '../auth/CurrentUserContext';
import { getStoreSettings, updateStoreSettings } from '../services/settingsService';
import { StoreSettings as IStoreSettings } from '../types/storeSettings';
import { formatCOP } from '../utils/currency';

const BARRIOS_MEDELLIN = [
  'La Candelaria / Centro',
  'Laureles - Estadio',
  'Belén',
  'El Poblado',
  'Robledo',
  'Castilla',
  'Aranjuez',
  'Buenos Aires',
  'Manrique',
  'San Javier (Comuna 13)',
  'Doce de Octubre',
  'Villa Hermosa',
  'Guayabal',
  'Santa Cruz',
  'Popular',
  'San Antonio de Prado',
  'San Cristóbal',
  'Envigado',
  'Itagüí',
  'Bello',
  'Sabaneta',
];

const StoreSettings = () => {
  const canEdit = useHasRole(['admin', 'manager']);
  const [settings, setSettings] = useState<IStoreSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Campos del formulario
  const [nombre, setNombre] = useState('');
  const [barrio, setBarrio] = useState('');
  const [direccion, setDireccion] = useState('');
  const [telefonoWhatsapp, setTelefonoWhatsapp] = useState('');
  const [horario, setHorario] = useState('');
  const [datosPago, setDatosPago] = useState('');
  const [slogan, setSlogan] = useState('');
  const [permiteDomicilio, setPermiteDomicilio] = useState(true);
  const [costoDomicilioPesos, setCostoDomicilioPesos] = useState('3500');
  const [permiteRetiro, setPermiteRetiro] = useState(true);

  useEffect(() => {
    let mounted = true;
    void getStoreSettings()
      .then((data) => {
        if (!mounted) return;
        setSettings(data);
        setNombre(data.nombre || '');
        setBarrio(data.barrio || 'La Candelaria / Centro');
        setDireccion(data.direccion || '');
        setTelefonoWhatsapp(data.telefono_whatsapp || '');
        setHorario(data.horario || 'Lunes a Domingo 7:00 AM - 9:00 PM');
        setDatosPago(data.datos_pago_offline || '');
        setSlogan(data.slogan || '');
        setPermiteDomicilio(data.permite_domicilio);
        setCostoDomicilioPesos(String(Math.round(data.costo_domicilio_cents / 100)));
        setPermiteRetiro(data.permite_retiro);
        setLoading(false);
      })
      .catch((err) => {
        if (!mounted) return;
        setError(err instanceof Error ? err.message : 'Error al cargar la configuración');
        setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, []);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!canEdit) return;

    setError(null);
    setSuccessMessage(null);
    setSaving(true);

    try {
      const costoPesosNum = parseInt(costoDomicilioPesos.replace(/[^0-9]/g, ''), 10) || 0;
      const updated = await updateStoreSettings({
        nombre: nombre.trim(),
        barrio: barrio.trim(),
        direccion: direccion.trim(),
        telefono_whatsapp: telefonoWhatsapp.trim(),
        horario: horario.trim(),
        datos_pago_offline: datosPago.trim(),
        slogan: slogan.trim(),
        permite_domicilio: permiteDomicilio,
        permite_retiro: permiteRetiro,
        costo_domicilio_cents: costoPesosNum * 100,
      });

      setSettings(updated);
      setSuccessMessage('¡Configuración del local guardada exitosamente!');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al guardar configuración');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <section className="space-y-4">
        <PageHeader title="Configuración de la Tienda" />
        <div className="card py-12 text-center text-gray-500">Cargando datos del local...</div>
      </section>
    );
  }

  const parsedCost = parseInt(costoDomicilioPesos.replace(/[^0-9]/g, ''), 10) || 0;

  return (
    <section className="space-y-6">
      <div>
        <PageHeader
          title="Configuración del Negocio"
          badge={
            <span className="chip bg-sf-primary/10 font-semibold text-sf-primary">
              {settings?.plan_id ? `Plan ${settings.plan_id.toUpperCase()}` : 'Plan Activo'}
            </span>
          }
        />
        <p className="mt-1 text-xs text-gray-500">
          Administra la identidad comercial, horarios y reglas de entrega para mostrador, tienda web y WhatsApp
        </p>
      </div>

      {error && (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <div className="flex items-center gap-2">
            <Icon name="alert" size={18} />
            <span>{error}</span>
          </div>
        </div>
      )}

      {successMessage && (
        <div role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
          <div className="flex items-center gap-2">
            <Icon name="check" size={18} />
            <span>{successMessage}</span>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Bloque 1: Identidad del Local y Ubicación Paisa */}
        <div className="card space-y-4 p-5 md:p-6">
          <div className="flex items-center gap-2 border-b border-gray-100 pb-3">
            <Icon name="store" className="text-sf-primary" size={20} />
            <h2 className="text-base font-bold text-sf-text">Identidad Comercial y Ubicación</h2>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label htmlFor="setting-nombre" className="mb-1 block text-sm font-medium text-gray-700">
                Nombre del Negocio / Abasto *
              </label>
              <input
                id="setting-nombre"
                type="text"
                required
                disabled={!canEdit}
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                placeholder="ej: SurtiFácil Abastos Central"
                className="input"
              />
            </div>

            <div>
              <label htmlFor="setting-barrio" className="mb-1 block text-sm font-medium text-gray-700">
                Barrio o Comuna en Medellín *
              </label>
              <input
                id="setting-barrio"
                type="text"
                list="barrios-list"
                required
                disabled={!canEdit}
                value={barrio}
                onChange={(e) => setBarrio(e.target.value)}
                placeholder="Selecciona o escribe el barrio"
                className="input"
              />
              <datalist id="barrios-list">
                {BARRIOS_MEDELLIN.map((b) => (
                  <option key={b} value={b} />
                ))}
              </datalist>
            </div>

            <div>
              <label htmlFor="setting-direccion" className="mb-1 block text-sm font-medium text-gray-700">
                Dirección del Local
              </label>
              <input
                id="setting-direccion"
                type="text"
                disabled={!canEdit}
                value={direccion}
                onChange={(e) => setDireccion(e.target.value)}
                placeholder="ej: Calle 50 # 50-20, Centro"
                className="input"
              />
            </div>

            <div>
              <label htmlFor="setting-whatsapp" className="mb-1 block text-sm font-medium text-gray-700">
                Teléfono WhatsApp de Pedidos
              </label>
              <input
                id="setting-whatsapp"
                type="tel"
                disabled={!canEdit}
                value={telefonoWhatsapp}
                onChange={(e) => setTelefonoWhatsapp(e.target.value)}
                placeholder="ej: +57 300 123 4567"
                className="input"
              />
            </div>

            <div>
              <label htmlFor="setting-horario" className="mb-1 block text-sm font-medium text-gray-700">
                Horario de Atención
              </label>
              <input
                id="setting-horario"
                type="text"
                disabled={!canEdit}
                value={horario}
                onChange={(e) => setHorario(e.target.value)}
                placeholder="ej: Lunes a Domingo 7:00 AM - 9:00 PM"
                className="input"
              />
            </div>

            <div>
              <label htmlFor="setting-slogan" className="mb-1 block text-sm font-medium text-gray-700">
                Slogan o Mensaje de Bienvenida
              </label>
              <input
                id="setting-slogan"
                type="text"
                disabled={!canEdit}
                value={slogan}
                onChange={(e) => setSlogan(e.target.value)}
                placeholder="ej: El motor digital del tendero paisa"
                className="input"
              />
            </div>
          </div>
        </div>

        {/* Bloque 2: Modalidades de Entrega (WhatsApp y Tienda Web) */}
        <div className="card space-y-4 p-5 md:p-6">
          <div className="flex items-center gap-2 border-b border-gray-100 pb-3">
            <Icon name="truck" className="text-sf-primary" size={20} />
            <div>
              <h2 className="text-base font-bold text-sf-text">Modalidades de Entrega y Domicilios</h2>
              <p className="text-xs text-gray-500">
                Estos interruptores configuran en tiempo real las opciones que ofrece el bot Sarin en WhatsApp y el catálogo web
              </p>
            </div>
          </div>

          <div className="space-y-4">
            {/* Switch Domicilios */}
            <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-slate-50/60 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-xl" aria-hidden="true">🛵</span>
                  <span className="font-semibold text-sf-text">Habilitar Servicio de Domicilios</span>
                  {permiteDomicilio ? (
                    <span className="chip bg-emerald-100 text-emerald-800 text-xs">Activo</span>
                  ) : (
                    <span className="chip bg-gray-200 text-gray-600 text-xs">Pausado</span>
                  )}
                </div>
                <p className="mt-1 text-xs text-gray-500">
                  Permite a los vecinos pedir a su casa desde WhatsApp o el catálogo digital.
                </p>
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  role="switch"
                  aria-checked={permiteDomicilio}
                  aria-label="Alternar servicio de domicilios"
                  disabled={!canEdit}
                  onClick={() => setPermiteDomicilio(!permiteDomicilio)}
                  className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-sf-primary focus:ring-offset-2 ${
                    permiteDomicilio ? 'bg-emerald-600' : 'bg-gray-300'
                  }`}
                >
                  <span
                    aria-hidden="true"
                    className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                      permiteDomicilio ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
            </div>

            {/* Campo Costo de Domicilio cuando está activo */}
            {permiteDomicilio && (
              <div className="ml-2 rounded-xl border border-emerald-200 bg-emerald-50/40 p-4 md:ml-8">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label htmlFor="setting-costo-domicilio" className="mb-1 block text-sm font-medium text-emerald-950">
                      Costo del Envío por Domicilio (COP)
                    </label>
                    <div className="relative">
                      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-semibold text-gray-500">
                        $
                      </span>
                      <input
                        id="setting-costo-domicilio"
                        type="number"
                        min="0"
                        step="500"
                        disabled={!canEdit}
                        value={costoDomicilioPesos}
                        onChange={(e) => setCostoDomicilioPesos(e.target.value)}
                        className="input pl-8"
                        placeholder="3500"
                      />
                    </div>
                  </div>
                  <div className="flex flex-col justify-end text-xs text-emerald-900">
                    <p className="font-medium">
                      Vista previa al cliente: <span className="font-bold tabular-nums text-emerald-700">{formatCOP(parsedCost)}</span>
                    </p>
                    <p className="text-gray-500">
                      Este valor se sumará automáticamente a la canasta de pedidos a domicilio.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Switch Retiro en Tienda */}
            <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-slate-50/60 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-xl" aria-hidden="true">🏪</span>
                  <span className="font-semibold text-sf-text">Habilitar Retiro en Tienda / Mostrador</span>
                  {permiteRetiro ? (
                    <span className="chip bg-emerald-100 text-emerald-800 text-xs">Activo</span>
                  ) : (
                    <span className="chip bg-gray-200 text-gray-600 text-xs">Pausado</span>
                  )}
                </div>
                <p className="mt-1 text-xs text-gray-500">
                  Permite a los vecinos encargar por WhatsApp/Web y pasar a recoger su pedido listo al mostrador (costo $ 0).
                </p>
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  role="switch"
                  aria-checked={permiteRetiro}
                  aria-label="Alternar retiro en tienda"
                  disabled={!canEdit}
                  onClick={() => setPermiteRetiro(!permiteRetiro)}
                  className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-sf-primary focus:ring-offset-2 ${
                    permiteRetiro ? 'bg-emerald-600' : 'bg-gray-300'
                  }`}
                >
                  <span
                    aria-hidden="true"
                    className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                      permiteRetiro ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Bloque 3: Datos de Pago Offline (Nequi / Bancolombia) */}
        <div className="card space-y-4 p-5 md:p-6">
          <div className="flex items-center gap-2 border-b border-gray-100 pb-3">
            <Icon name="wallet" className="text-sf-primary" size={20} />
            <h2 className="text-base font-bold text-sf-text">Datos de Pago para Clientes (Nequi / Bancolombia)</h2>
          </div>

          <div>
            <label htmlFor="setting-datos-pago" className="mb-1 block text-sm font-medium text-gray-700">
              Cuentas e Instrucciones de Pago
            </label>
            <input
              id="setting-datos-pago"
              type="text"
              disabled={!canEdit}
              value={datosPago}
              onChange={(e) => setDatosPago(e.target.value)}
              placeholder="ej: Nequi / Bancolombia A la Mano: 300 123 4567 a nombre de Tienda Don Pedro"
              className="input"
            />
            <p className="mt-1 text-xs text-gray-500">
              Este mensaje informativo se adjunta en los tickets y mensajes de WhatsApp cuando el cliente paga por transferencia.
            </p>
          </div>
        </div>

        {/* Bloque 4: Estado del Plan SaaS y Cuota IA Sarin */}
        <div className="card space-y-4 p-5 md:p-6">
          <div className="flex items-center gap-2 border-b border-gray-100 pb-3">
            <Icon name="sparkles" className="text-sf-cyan" size={20} />
            <h2 className="text-base font-bold text-sf-text">Suscripción SaaS y Copiloto Sarin IA</h2>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-xl border border-slate-200 bg-sf-light/50 p-4">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Plan Actual de la Tienda</p>
              <p className="mt-1 text-xl font-bold text-sf-primary capitalize">
                {settings?.plan_id ? `Plan ${settings.plan_id.replace('_', ' ')}` : 'Activo'}
              </p>
              <p className="mt-1 text-xs text-gray-600">
                Estado: <span className="font-semibold text-emerald-600 capitalize">{settings?.estado || 'Activo'}</span>
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-sf-light/50 p-4">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Cuota de Sarin IA</p>
                <span className="text-xs font-bold text-sf-cyan">
                  {settings?.cuota_ia_usada ?? 0} / {settings?.cuota_ia_total ?? 300} turnos
                </span>
              </div>
              <div className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-gray-200">
                <div
                  className="h-full bg-sf-cyan transition-all"
                  style={{
                    width: `${Math.min(
                      100,
                      Math.round(((settings?.cuota_ia_usada ?? 0) / (settings?.cuota_ia_total || 1)) * 100)
                    )}%`,
                  }}
                />
              </div>
              <p className="mt-2 text-xs text-gray-500">
                Turnos de pedidos inteligentes por WhatsApp y copiloto de voz en POS.
              </p>
            </div>
          </div>
        </div>

        {/* Botón de Guardado */}
        {canEdit && (
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="submit"
              disabled={saving}
              className="btn-primary min-h-[44px] px-8 text-base shadow-md"
            >
              {saving ? (
                <>
                  <Icon name="refresh" className="animate-spin" size={18} />
                  <span>Guardando...</span>
                </>
              ) : (
                <>
                  <Icon name="check" size={18} />
                  <span>Guardar Configuración</span>
                </>
              )}
            </button>
          </div>
        )}
      </form>
    </section>
  );
};

export default StoreSettings;
