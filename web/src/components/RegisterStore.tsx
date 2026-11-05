import { useState, useId } from 'react';
import { SAAS_PLANS, MEDELLIN_NEIGHBORHOODS, type SaaSPlanId, type RegisterStoreInput } from '../types/tenant';
import { registerStore } from '../services/tenantService';
import { formatCOP } from '../utils/currency';
import { Icon } from './ui/Icon';

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

export default function RegisterStore() {
  const storeNameId = useId();
  const slugId = useId();
  const ownerNameId = useId();
  const phoneId = useId();
  const neighborhoodId = useId();
  const addressId = useId();
  const emailId = useId();
  const passwordId = useId();

  const [nombre, setNombre] = useState('');
  const [slug, setSlug] = useState('');
  const [slugEdited, setSlugEdited] = useState(false);
  const [ownerName, setOwnerName] = useState('');
  const [phone, setPhone] = useState('');
  const [barrio, setBarrio] = useState('Laureles');
  const [direccion, setDireccion] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [selectedPlanId, setSelectedPlanId] = useState<SaaSPlanId>('prueba_3d');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [registeredSuccess, setRegisteredSuccess] = useState<any | null>(null);

  const handleNombreChange = (val: string) => {
    setNombre(val);
    if (!slugEdited) {
      setSlug(slugify(val));
    }
  };

  const handleSlugChange = (val: string) => {
    setSlugEdited(true);
    setSlug(slugify(val));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const cleanSlug = slug.trim() || slugify(nombre);
    if (!cleanSlug) {
      setError('Por favor ingresa un identificador (slug) válido para la tienda.');
      return;
    }

    if (!nombre.trim() || !email.trim() || !phone.trim()) {
      setError('Por favor completa todos los campos requeridos.');
      return;
    }

    setLoading(true);

    try {
      const payload: RegisterStoreInput = {
        nombre: nombre.trim(),
        slug: cleanSlug,
        owner_name: ownerName.trim() || nombre.trim(),
        email: email.trim().toLowerCase(),
        password: password || undefined,
        telefono_whatsapp: phone.trim(),
        barrio,
        direccion: direccion.trim() || undefined,
        plan_id: selectedPlanId,
      };

      const result = await registerStore(payload);
      setRegisteredSuccess({
        negocio: result.negocio,
        email: email.trim(),
      });
    } catch (err: any) {
      setError(err?.message || 'No se pudo registrar la tienda. Inténtalo de nuevo.');
    } finally {
      setLoading(false);
    }
  };

  if (registeredSuccess) {
    const negocio = registeredSuccess.negocio;
    return (
      <main className="min-h-screen bg-sf-light text-sf-text font-poppins flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-lg rounded-2xl bg-white p-8 shadow-md border border-slate-200/90 text-center space-y-6">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 text-3xl">
            🎉
          </div>

          <div>
            <h1 className="text-2xl font-bold text-sf-text">¡Bienvenido a SurtiFácil!</h1>
            <p className="mt-2 text-sm text-slate-600">
              Tu tienda <span className="font-semibold text-sf-primary">{negocio?.nombre || nombre}</span> ha sido registrada exitosamente.
            </p>
          </div>

          <div className="rounded-xl bg-slate-50 p-4 border border-slate-200 text-left space-y-2 text-xs sm:text-sm text-slate-700">
            <div className="flex justify-between">
              <span className="text-slate-500">Identificador (Slug):</span>
              <span className="font-mono font-bold text-sf-primary">#{negocio?.slug || slug}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Barrio / Comuna:</span>
              <span className="font-medium">{barrio}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Plan Seleccionado:</span>
              <span className="font-medium capitalize text-emerald-700 font-semibold">
                {SAAS_PLANS.find((p) => p.id === selectedPlanId)?.name || 'Plan Prueba'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Usuario de Administrador:</span>
              <span className="font-medium">{registeredSuccess.email}</span>
            </div>
          </div>

          <div className="pt-2 space-y-3">
            <a
              href="#/login"
              className="btn-primary w-full min-h-[48px] flex items-center justify-center gap-2 text-base font-semibold shadow-sm hover:shadow-md transition"
            >
              <span>Iniciar sesión en mi tienda</span>
              <span>→</span>
            </a>

            <a
              href={`https://wa.me/573001234567?text=Hola,%20acabo%20de%20registrar%20mi%20tienda%20${encodeURIComponent(nombre)}%20en%20SurtiFácil`}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-secondary w-full min-h-[44px] flex items-center justify-center gap-2 text-sm font-semibold text-emerald-700 border-emerald-300 hover:bg-emerald-50 transition"
            >
              <span>💬 Escribir a soporte por WhatsApp</span>
            </a>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-sf-light text-sf-text font-poppins px-4 py-8 md:py-12">
      <div className="mx-auto max-w-3xl">
        {/* Cabecera Superior */}
        <header className="text-center mb-8">
          <div className="inline-flex items-center gap-2.5 mb-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-sf-primary text-xl font-bold text-white shadow-sm">
              S
            </span>
            <span className="text-2xl font-bold text-sf-primary tracking-tight">SurtiFácil</span>
          </div>
          <h1 className="text-2xl md:text-3xl font-bold text-sf-text tracking-tight">
            Registra tu Tienda de Barrio o Abastos
          </h1>
          <p className="mt-2 text-sm md:text-base text-slate-600 max-w-xl mx-auto">
            Comienza hoy y moderniza tu mostrador táctil, fiados por WhatsApp y vitrina vecinal en Medellín.
          </p>
        </header>

        {error && (
          <div role="alert" className="mb-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 font-medium">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-8">
          {/* 1. Selector Visual de Planes */}
          <section className="rounded-2xl bg-white p-6 shadow-xs border border-slate-200">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-bold text-slate-900">1. Selecciona tu Plan de Lanzamiento</h2>
                <p className="text-xs text-slate-500">Puedes cambiar o renovar tu plan en cualquier momento.</p>
              </div>
              <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-700">
                Sin tarjeta de crédito
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {SAAS_PLANS.filter((p) => p.id !== 'enterprise').map((plan) => {
                const isSelected = selectedPlanId === plan.id;
                return (
                  <button
                    key={plan.id}
                    type="button"
                    onClick={() => setSelectedPlanId(plan.id)}
                    className={`relative rounded-xl border-2 p-3.5 text-left transition-all min-h-[140px] flex flex-col justify-between ${
                      isSelected
                        ? 'border-sf-primary bg-blue-50/50 shadow-sm ring-2 ring-sf-primary/20'
                        : 'border-slate-200 bg-white hover:border-slate-300'
                    }`}
                  >
                    {plan.popular && (
                      <span className="absolute -top-2.5 right-2 rounded-full bg-amber-500 px-2 py-0.5 text-[10px] font-bold text-white shadow-xs">
                        {plan.badge || 'Popular'}
                      </span>
                    )}

                    <div>
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-sm text-slate-800">{plan.shortName}</span>
                        <span
                          className={`h-4 w-4 rounded-full border flex items-center justify-center text-[10px] ${
                            isSelected ? 'border-sf-primary bg-sf-primary text-white' : 'border-slate-300'
                          }`}
                        >
                          {isSelected ? '✓' : ''}
                        </span>
                      </div>
                      <div className="mt-1 text-base font-bold text-sf-primary tabular-nums">
                        {formatCOP(plan.priceCOP)}
                      </div>
                      <p className="mt-1 text-[11px] text-slate-500 line-clamp-2">{plan.description}</p>
                    </div>

                    <div className="mt-2 text-[10px] font-semibold text-slate-600 bg-slate-100 px-2 py-1 rounded">
                      🤖 {plan.cuotaIATurnos.toLocaleString('es-CO')} turnos Sarin IA
                    </div>
                  </button>
                );
              })}
            </div>
          </section>

          {/* 2. Información del Local */}
          <section className="rounded-2xl bg-white p-6 shadow-xs border border-slate-200 space-y-4">
            <h2 className="text-lg font-bold text-slate-900 border-b border-slate-100 pb-3">
              2. Datos del Local de Abastos
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label htmlFor={storeNameId} className="block text-sm font-semibold text-slate-700 mb-1">
                  Nombre de la Tienda o Minimercado *
                </label>
                <input
                  id={storeNameId}
                  type="text"
                  required
                  value={nombre}
                  onChange={(e) => handleNombreChange(e.target.value)}
                  placeholder="Ej: Tienda Don Paisa"
                  className="input min-h-[44px] w-full"
                />
              </div>

              <div>
                <label htmlFor={slugId} className="block text-sm font-semibold text-slate-700 mb-1">
                  Identificador / Enlace Público (Slug) *
                </label>
                <input
                  id={slugId}
                  type="text"
                  required
                  value={slug}
                  onChange={(e) => handleSlugChange(e.target.value)}
                  placeholder="tienda-don-paisa"
                  className="input min-h-[44px] w-full font-mono text-sm"
                />
                <span className="block mt-1 text-[11px] text-slate-400">
                  Tu vitrina vecinal quedará en: <span className="font-semibold text-sf-primary">#/tienda/{slug || 'tu-tienda'}</span>
                </span>
              </div>

              <div>
                <label htmlFor={neighborhoodId} className="block text-sm font-semibold text-slate-700 mb-1">
                  Barrio o Comuna en Medellín *
                </label>
                <select
                  id={neighborhoodId}
                  value={barrio}
                  onChange={(e) => setBarrio(e.target.value)}
                  className="input min-h-[44px] w-full bg-white"
                >
                  {MEDELLIN_NEIGHBORHOODS.map((b) => (
                    <option key={b} value={b}>
                      {b}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor={addressId} className="block text-sm font-semibold text-slate-700 mb-1">
                  Dirección del Local (Opcional)
                </label>
                <input
                  id={addressId}
                  type="text"
                  value={direccion}
                  onChange={(e) => setDireccion(e.target.value)}
                  placeholder="Ej: Calle 44 # 105-22"
                  className="input min-h-[44px] w-full"
                />
              </div>
            </div>
          </section>

          {/* 3. Datos del Tendero y Cuenta de Administrador */}
          <section className="rounded-2xl bg-white p-6 shadow-xs border border-slate-200 space-y-4">
            <h2 className="text-lg font-bold text-slate-900 border-b border-slate-100 pb-3">
              3. Datos del Administrador de la Tienda
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label htmlFor={ownerNameId} className="block text-sm font-semibold text-slate-700 mb-1">
                  Tu Nombre Completo *
                </label>
                <input
                  id={ownerNameId}
                  type="text"
                  required
                  value={ownerName}
                  onChange={(e) => setOwnerName(e.target.value)}
                  placeholder="Ej: Andrés Restrepo"
                  className="input min-h-[44px] w-full"
                />
              </div>

              <div>
                <label htmlFor={phoneId} className="block text-sm font-semibold text-slate-700 mb-1">
                  Teléfono WhatsApp *
                </label>
                <input
                  id={phoneId}
                  type="tel"
                  required
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="Ej: 3001234567"
                  className="input min-h-[44px] w-full"
                />
              </div>

              <div>
                <label htmlFor={emailId} className="block text-sm font-semibold text-slate-700 mb-1">
                  Correo Electrónico de Acceso *
                </label>
                <input
                  id={emailId}
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="andres@mitienda.com"
                  className="input min-h-[44px] w-full"
                />
              </div>

              <div>
                <label htmlFor={passwordId} className="block text-sm font-semibold text-slate-700 mb-1">
                  Contraseña de Administrador *
                </label>
                <div className="relative">
                  <input
                    id={passwordId}
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Mínimo 6 caracteres"
                    className="input min-h-[44px] w-full pr-12"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-slate-400 hover:text-slate-600 focus:outline-hidden min-h-[40px] min-w-[40px] flex items-center justify-center"
                    aria-label={showPassword ? 'Ocultar clave' : 'Mostrar clave'}
                  >
                    <Icon name={showPassword ? 'eye-off' : 'eye'} size={18} />
                  </button>
                </div>
              </div>
            </div>
          </section>

          {/* Botón de Envío y Links */}
          <div className="pt-2 text-center space-y-4">
            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full md:w-auto md:min-w-[320px] min-h-[48px] text-base font-semibold shadow-md hover:shadow-lg transition-all disabled:opacity-60"
            >
              {loading ? 'Creando tu tienda...' : 'Comenzar mi Tienda en SurtiFácil →'}
            </button>

            <div>
              <a
                href="#/login"
                className="text-sm font-medium text-slate-600 hover:text-sf-primary transition"
              >
                ¿Ya tienes una cuenta registrada? <span className="font-semibold text-sf-primary">Inicia sesión aquí</span>
              </a>
            </div>
          </div>
        </form>
      </div>
    </main>
  );
}
