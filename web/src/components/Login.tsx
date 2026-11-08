import { useState } from 'react';
import {
  getSafeAuthErrorMessage,
  loginUser,
  loginWithGoogle,
  loginWithQuickRole,
} from '../services/authService';
import { Icon } from './ui/Icon';

function GoogleLogo() {
  return (
    <svg aria-hidden="true" width="20" height="20" viewBox="0 0 48 48">
      <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.6l6.7-6.7C35.6 2.6 30.2 0 24 0 14.6 0 6.5 5.4 2.6 13.3l7.8 6C12.3 13.6 17.7 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4.1 7.1-10.1 7.1-17.5z" />
      <path fill="#FBBC05" d="M10.4 28.7A14.5 14.5 0 0 1 9.5 24c0-1.6.3-3.2.8-4.7l-7.8-6A24 24 0 0 0 0 24c0 3.9.9 7.5 2.6 10.7l7.8-6z" />
      <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.5-5.8c-2.1 1.4-4.9 2.3-8.4 2.3-6.3 0-11.7-4.1-13.6-9.9l-7.8 6C6.5 42.6 14.6 48 24 48z" />
    </svg>
  );
}

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [quickLoadingRole, setQuickLoadingRole] = useState<string | null>(null);
  const [error, setError] = useState('');

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError('');

    try {
      await loginUser(email, password);
    } catch (err) {
      setError(getSafeAuthErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = async () => {
    setGoogleLoading(true);
    setError('');
    try {
      await loginWithGoogle();
    } catch (err) {
      setError(getSafeAuthErrorMessage(err));
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleQuickAccess = async (
    roleKey: 'admin' | 'cashier' | 'manager' | 'superadmin',
    targetHash?: string
  ) => {
    setQuickLoadingRole(roleKey);
    setError('');
    try {
      await loginWithQuickRole(roleKey);
      if (targetHash) {
        window.location.hash = targetHash;
      }
    } catch (err) {
      setError(getSafeAuthErrorMessage(err));
    } finally {
      setQuickLoadingRole(null);
    }
  };

  const busy = loading || googleLoading || quickLoadingRole !== null;

  return (
    <main className="min-h-screen bg-sf-light text-sf-text font-poppins flex">
      {/* Panel Izquierdo / Branding e Ilustración (Desktop y Tablets grandes) */}
      <section className="hidden lg:flex lg:w-1/2 bg-sf-dark relative overflow-hidden flex-col justify-between p-12 text-white">
        <div className="absolute inset-0 bg-gradient-to-br from-sf-primary/40 via-sf-dark/90 to-sf-dark z-0" />
        <div
          className="absolute inset-0 opacity-15 bg-cover bg-center mix-blend-overlay z-0"
          style={{
            backgroundImage:
              'radial-gradient(circle at 20% 30%, #1565C0 0%, transparent 40%), radial-gradient(circle at 80% 70%, #00BCD4 0%, transparent 40%)',
          }}
        />

        <div className="relative z-10">
          <div className="inline-flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-sf-primary text-2xl font-bold shadow-md shadow-sf-primary/30 text-white">
              S
            </span>
            <div>
              <span className="text-2xl font-bold tracking-tight">SurtiFácil</span>
              <span className="block text-xs font-medium text-sf-cyan">SaaS Multi-Tenant</span>
            </div>
          </div>
          <div className="mt-8 inline-block rounded-full border border-sf-cyan/30 bg-sf-cyan/10 px-3.5 py-1 text-xs font-semibold text-sf-cyan">
            El motor digital de la tienda paisa
          </div>
        </div>

        <div className="relative z-10 my-auto space-y-6 max-w-md">
          <h2 className="text-3xl xl:text-4xl font-bold leading-tight">
            Control total de tu mostrador, fiados y vitrina digital
          </h2>
          <p className="text-slate-300 text-sm leading-relaxed">
            Diseñado para tiendas de barrio, abastos y minimercados en Medellín. Vende rápido con lector de códigos, fía sin papel por WhatsApp y atiende con Kiosco iPad.
          </p>

          <div className="space-y-3 pt-2">
            <div className="flex items-center gap-3 text-sm text-slate-200">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400 font-bold">
                ✓
              </span>
              <span>Cero descuadres con Arqueo físico COP</span>
            </div>
            <div className="flex items-center gap-3 text-sm text-slate-200">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400 font-bold">
                ✓
              </span>
              <span>Libro de Fiados ordenado con cobro a 1 clic</span>
            </div>
            <div className="flex items-center gap-3 text-sm text-slate-200">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400 font-bold">
                ✓
              </span>
              <span>Copiloto Sarin con IA DeepSeek en mostrador</span>
            </div>
          </div>
        </div>

        <div className="relative z-10 border-t border-slate-700/60 pt-6 flex items-center justify-between text-xs text-slate-400">
          <span>Medellín, Colombia · 100% Paisa</span>
          <a
            href="#/landing"
            className="text-sf-cyan hover:underline flex items-center gap-1 font-medium"
          >
            <span>Ver vitrina comercial y planes</span>
            <span>→</span>
          </a>
        </div>
      </section>

      {/* Panel Derecho / Tarjeta de Login */}
      <section className="flex-1 flex flex-col justify-center items-center px-4 py-8 sm:px-6 lg:px-12 xl:px-16">
        <div className="w-full max-w-md">
          {/* Cabecera Móvil del Logo */}
          <div className="lg:hidden mb-6 text-center">
            <div className="inline-flex items-center gap-2.5">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-sf-primary text-xl font-bold text-white shadow-sm">
                S
              </span>
              <span className="text-2xl font-bold text-sf-primary">SurtiFácil</span>
            </div>
            <p className="mt-1 text-xs text-slate-500 font-medium">Plataforma de Abastos y Tiendas de Barrio</p>
          </div>

          <div className="rounded-2xl bg-white p-6 sm:p-8 shadow-sm border border-slate-200/90">
            <header className="mb-6">
              <h1 className="text-2xl font-bold text-sf-text tracking-tight">Iniciar sesión</h1>
              <p className="mt-1 text-sm text-slate-500">
                Bienvenido de vuelta, tendero. Ingresa para gestionar tu local.
              </p>
            </header>

            <button
              type="button"
              onClick={handleGoogle}
              disabled={busy}
              className="btn-secondary w-full min-h-[48px] text-sm font-semibold flex items-center justify-center gap-3 shadow-xs hover:border-slate-300 transition-all"
            >
              <GoogleLogo />
              {googleLoading ? 'Conectando con Google...' : 'Continuar con Google'}
            </button>

            <div className="my-5 flex items-center gap-3 text-xs uppercase tracking-wider text-slate-400" aria-hidden="true">
              <span className="h-px flex-1 bg-slate-200" />
              o con tu correo
              <span className="h-px flex-1 bg-slate-200" />
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="email" className="mb-1 block text-sm font-semibold text-slate-700">
                  Correo electrónico
                </label>
                <div className="relative">
                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    autoComplete="email"
                    inputMode="email"
                    autoCapitalize="none"
                    spellCheck={false}
                    required
                    placeholder="ejemplo@mitienda.com"
                    className="input min-h-[44px] w-full"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label htmlFor="password" className="block text-sm font-semibold text-slate-700">
                    Contraseña
                  </label>
                </div>
                <div className="relative">
                  <input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    autoComplete="current-password"
                    required
                    placeholder="••••••••"
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

              {error && (
                <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs sm:text-sm text-red-700 font-medium">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={busy}
                className="btn-primary w-full min-h-[48px] text-base font-semibold shadow-sm hover:shadow-md transition-all disabled:opacity-60"
              >
                {loading ? 'Iniciando sesión...' : 'Iniciar sesión'}
              </button>
            </form>

            <div className="mt-6 border-t border-slate-200 pt-5 space-y-3" data-testid="quick-access-panel">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  ⚡ Acceso Rápido de Prueba (1 Clic)
                </span>
                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                  Multi-Rol Activo
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => handleQuickAccess('admin', '#/dashboard')}
                  className="min-h-[44px] rounded-xl border border-blue-200 bg-blue-50/70 px-3 py-2 text-left hover:bg-blue-100/80 transition disabled:opacity-50"
                >
                  <span className="block text-xs font-bold text-sf-primary">
                    {quickLoadingRole === 'admin' ? 'Entrando...' : '🏪 Entrar como Admin'}
                  </span>
                  <span className="block text-[10px] text-slate-500 truncate">admin@surtifacil.com</span>
                </button>

                <button
                  type="button"
                  disabled={busy}
                  onClick={() => handleQuickAccess('cashier', '#/create-sale')}
                  className="min-h-[44px] rounded-xl border border-emerald-200 bg-emerald-50/70 px-3 py-2 text-left hover:bg-emerald-100/80 transition disabled:opacity-50"
                >
                  <span className="block text-xs font-bold text-emerald-800">
                    {quickLoadingRole === 'cashier' ? 'Entrando...' : '🛒 Entrar como Cajero'}
                  </span>
                  <span className="block text-[10px] text-slate-500 truncate">cajero@surtifacil.com</span>
                </button>

                <button
                  type="button"
                  disabled={busy}
                  onClick={() => handleQuickAccess('manager', '#/inventory')}
                  className="min-h-[44px] rounded-xl border border-amber-200 bg-amber-50/70 px-3 py-2 text-left hover:bg-amber-100/80 transition disabled:opacity-50"
                >
                  <span className="block text-xs font-bold text-amber-900">
                    {quickLoadingRole === 'manager' ? 'Entrando...' : '📦 Entrar como Gerente'}
                  </span>
                  <span className="block text-[10px] text-slate-500 truncate">gerente@surtifacil.com</span>
                </button>

                <button
                  type="button"
                  disabled={busy}
                  onClick={() => handleQuickAccess('superadmin', '#/super-admin')}
                  className="min-h-[44px] rounded-xl border border-purple-200 bg-purple-50/70 px-3 py-2 text-left hover:bg-purple-100/80 transition disabled:opacity-50"
                >
                  <span className="block text-xs font-bold text-purple-900">
                    {quickLoadingRole === 'superadmin' ? 'Entrando...' : '👑 Entrar como SuperAdmin'}
                  </span>
                  <span className="block text-[10px] text-slate-500 truncate">andres.san1404@gmail.com</span>
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2 pt-1">
                <a
                  href="#/tienda/surtifacil"
                  className="min-h-[44px] rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 flex items-center justify-center gap-1.5 text-xs font-semibold text-slate-700 hover:border-sf-primary hover:text-sf-primary transition"
                >
                  <span>🛍️</span>
                  <span>Vista Cliente Tienda</span>
                </a>
                <a
                  href="#/kiosco/surtifacil"
                  className="min-h-[44px] rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 flex items-center justify-center gap-1.5 text-xs font-semibold text-slate-700 hover:border-sf-primary hover:text-sf-primary transition"
                >
                  <span>📱</span>
                  <span>Vista Cliente Kiosco</span>
                </a>
              </div>
            </div>

            <div className="mt-5 border-t border-slate-100 pt-4 text-center space-y-2.5">
              <p className="text-sm text-slate-600">
                ¿No tienes cuenta aún?{' '}
                <a
                  href="#/registro-negocio"
                  className="font-semibold text-sf-primary hover:text-sf-dark transition"
                >
                  Registra tu tienda gratis
                </a>
              </p>

              <p className="text-xs text-slate-500">
                <a
                  href="#/landing"
                  className="text-slate-500 hover:text-sf-primary underline"
                >
                  ← Ver vitrina comercial y planes
                </a>
              </p>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
};

export default Login;
