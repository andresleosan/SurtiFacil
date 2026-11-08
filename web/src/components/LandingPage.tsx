import { useState } from 'react';
import { SAAS_PLANS } from '../types/tenant';
import { formatCOP } from '../utils/currency';
import { Icon } from './ui/Icon';

interface SampleItem {
  id: string;
  name: string;
  priceCOP: number;
  unit: string;
  category: string;
  emoji: string;
  image_url?: string;
}

const SAMPLE_PRODUCTS: SampleItem[] = [
  {
    id: '1',
    name: 'Arroz Diana 1kg',
    priceCOP: 4500,
    unit: 'Bolsa 1kg',
    category: 'Granos y Despensa',
    emoji: '🍚',
    image_url: '/images/products/arroz-diana-1lb.svg',
  },
  {
    id: '2',
    name: 'Leche Colanta Entera 1L',
    priceCOP: 4200,
    unit: 'Bolsa 1L',
    category: 'Lácteos y Huevos',
    emoji: '🥛',
    image_url: '/images/products/leche-alqueria-1l.svg',
  },
  {
    id: '3',
    name: 'Huevos AA Cubeta x30',
    priceCOP: 18500,
    unit: 'Cubeta x30',
    category: 'Lácteos y Huevos',
    emoji: '🥚',
    image_url: '/images/products/huevos-aa-x30.svg',
  },
  {
    id: '4',
    name: 'Panela Pastilla 500g',
    priceCOP: 3200,
    unit: 'Pastilla 500g',
    category: 'Granos y Despensa',
    emoji: '🟫',
    image_url: '/images/products/panela-pastilla-unidad.svg',
  },
  {
    id: '5',
    name: 'Arepas de Chócolo x5',
    priceCOP: 4000,
    unit: 'Paquete x5',
    category: 'Panadería y Arepas',
    emoji: '🌽',
    image_url: '/images/products/arepas-antioquenas-x10.svg',
  },
  {
    id: '6',
    name: 'Café Sello Rojo 250g',
    priceCOP: 6800,
    unit: 'Bolsa 250g',
    category: 'Granos y Despensa',
    emoji: '☕',
    image_url: '/images/products/cafe-sello-rojo-500g.svg',
  },
  {
    id: '7',
    name: 'Aguacate Hass Maduro',
    priceCOP: 3500,
    unit: 'Unidad',
    category: 'Frutas y Verduras',
    emoji: '🥑',
    image_url: '/images/products/aguacate-hass.svg',
  },
  {
    id: '8',
    name: 'Quesito Antioqueño 250g',
    priceCOP: 5500,
    unit: 'Bloque 250g',
    category: 'Lácteos y Huevos',
    emoji: '🧀',
    image_url: '/images/products/quesito-antioqueno-400g.svg',
  },
];

const AISLES = [
  { id: 'fruver', name: 'Frutas y Verduras', icon: '🥑', count: '45 productos' },
  { id: 'panaderia', name: 'Panadería y Arepas', icon: '🥖', count: '28 productos' },
  { id: 'lacteos', name: 'Lácteos y Huevos', icon: '🥚', count: '35 productos' },
  { id: 'granos', name: 'Granos y Despensa', icon: '🍚', count: '62 productos' },
  { id: 'carnes', name: 'Carnes y Salsamentaria', icon: '🥩', count: '30 productos' },
  { id: 'bebidas', name: 'Bebidas y Licores', icon: '🥤', count: '54 productos' },
];

export default function LandingPage() {
  const [cart, setCart] = useState<Record<string, number>>({ '1': 1, '2': 2 });
  const [activeCategory, setActiveCategory] = useState<string>('Todos');

  const addToCart = (id: string) => {
    setCart((prev) => ({ ...prev, [id]: (prev[id] || 0) + 1 }));
  };

  const removeFromCart = (id: string) => {
    setCart((prev) => {
      const next = { ...prev };
      if (next[id] > 1) {
        next[id] -= 1;
      } else {
        delete next[id];
      }
      return next;
    });
  };

  const cartTotal = Object.entries(cart).reduce((sum, [id, qty]) => {
    const prod = SAMPLE_PRODUCTS.find((p) => p.id === id);
    return sum + (prod ? prod.priceCOP * qty : 0);
  }, 0);

  const cartItemCount = Object.values(cart).reduce((a, b) => a + b, 0);

  const filteredProducts =
    activeCategory === 'Todos'
      ? SAMPLE_PRODUCTS
      : SAMPLE_PRODUCTS.filter((p) => p.category === activeCategory);

  return (
    <div className="min-h-screen bg-sf-light text-sf-text font-poppins selection:bg-sf-primary selection:text-white">
      {/* 1. Barra de Navegación Comercial */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200 shadow-xs">
        <div className="container mx-auto flex h-16 items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-sf-primary text-xl font-bold text-white shadow-sm shadow-sf-primary/20">
              S
            </span>
            <div>
              <span className="text-xl font-bold text-sf-primary tracking-tight">SurtiFácil</span>
              <span className="hidden sm:inline-block ml-2 text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-50 text-sf-primary border border-blue-200">
                SaaS Abastos Medellín
              </span>
            </div>
          </div>

          <nav className="hidden md:flex items-center gap-6 text-sm font-semibold text-slate-600">
            <a href="#funciones" className="hover:text-sf-primary transition">
              Funciones
            </a>
            <a href="#pasillos" className="hover:text-sf-primary transition">
              Pasillos y Vitrina
            </a>
            <a href="#planes" className="hover:text-sf-primary transition">
              Planes
            </a>
            <a href="#kiosco" className="hover:text-sf-primary transition">
              Modo Kiosco iPad
            </a>
          </nav>

          <div className="flex items-center gap-2 sm:gap-3">
            <a
              href="#/login"
              className="btn-secondary min-h-[40px] px-4 text-xs sm:text-sm font-semibold"
            >
              Iniciar sesión
            </a>
            <a
              href="#/registro-negocio"
              className="btn-primary min-h-[40px] px-4 text-xs sm:text-sm font-semibold shadow-xs"
            >
              Registrar Tienda
            </a>
          </div>
        </div>
      </header>

      {/* 2. Hero Section (Patrón Mobbin Food & Drink Home) */}
      <section className="relative overflow-hidden pt-12 pb-16 md:pt-20 md:pb-24 bg-gradient-to-b from-white via-blue-50/30 to-sf-light">
        <div className="container mx-auto px-4 sm:px-6 text-center max-w-4xl relative z-10">
          <div className="inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50/80 px-4 py-1.5 text-xs font-semibold text-sf-primary shadow-2xs mb-6">
            <Icon name="sparkles" size={16} />
            <span>El software POS y vitrina digital de la tienda de barrio paisa</span>
          </div>

          <h1 className="text-3xl sm:text-5xl md:text-6xl font-extrabold text-slate-900 tracking-tight leading-[1.15]">
            Moderniza tu mostrador de abastos, fiados y ventas en Medellín
          </h1>

          <p className="mt-6 text-base sm:text-lg md:text-xl text-slate-600 max-w-2xl mx-auto leading-relaxed">
            Punto de venta táctil con lector de códigos, libro de fiados con cobro por WhatsApp, vitrina vecinal en línea y asistente inteligente <strong className="text-sf-primary">Sarin</strong> para que nunca pierdas una venta.
          </p>

          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4">
            <a
              href="#/registro-negocio"
              className="btn-primary w-full sm:w-auto min-h-[50px] px-8 text-base font-semibold shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2"
            >
              <span>Registrar mi Tienda Gratis</span>
              <span>→</span>
            </a>
            <a
              href="#/login"
              className="btn-secondary w-full sm:w-auto min-h-[50px] px-8 text-base font-semibold hover:border-slate-400 transition-all flex items-center justify-center gap-2"
            >
              <Icon name="store" size={20} />
              <span>Ver Demostración en Vivo</span>
            </a>
          </div>

          <div className="mt-6 text-xs text-slate-500 flex items-center justify-center gap-4">
            <span>✓ Prueba desde $ 5.000 COP</span>
            <span>✓ Sin tarjeta bancaria</span>
            <span>✓ Listo en 2 minutos</span>
          </div>
        </div>
      </section>

      {/* 3. Pilares de Valor (Mobbin Food & Drink Feature Highlights) */}
      <section id="funciones" className="py-12 bg-white border-y border-slate-200/80">
        <div className="container mx-auto px-4 sm:px-6">
          <div className="text-center max-w-2xl mx-auto mb-12">
            <h2 className="text-xs font-bold uppercase tracking-widest text-sf-primary mb-2">Herramientas Reales</h2>
            <p className="text-2xl sm:text-3xl font-bold text-slate-900">
              Hecho a la medida del mostrador de abastos
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="rounded-2xl border border-slate-200 p-6 bg-slate-50/50 hover:bg-white hover:border-sf-primary hover:shadow-md transition-all">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-100 text-sf-primary text-2xl mb-4">
                💵
              </div>
              <h3 className="font-bold text-lg text-slate-900 mb-2">Arqueo Físico COP</h3>
              <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                Cuadrícula táctil con los 6 billetes y 5 monedas de Colombia. Compara el efectivo en caja contra las ventas sin descuadres.
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 p-6 bg-slate-50/50 hover:bg-white hover:border-emerald-600 hover:shadow-md transition-all">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700 text-2xl mb-4">
                📒
              </div>
              <h3 className="font-bold text-lg text-slate-900 mb-2">Fiados por WhatsApp</h3>
              <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                Adiós a los cuadernos viejos. Registra deudas, abonos parciales y envía recordatorios cordiales a los vecinos en 1 clic.
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 p-6 bg-slate-50/50 hover:bg-white hover:border-sf-cyan hover:shadow-md transition-all">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-cyan-100 text-cyan-800 text-2xl mb-4">
                📱
              </div>
              <h3 className="font-bold text-lg text-slate-900 mb-2">Modo Kiosco iPad</h3>
              <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                Coloca una tablet en la entrada del local. Los vecinos arman su canasta, reciben su turno gigante y la caja lo factura en 1 segundo.
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 p-6 bg-slate-50/50 hover:bg-white hover:border-purple-600 hover:shadow-md transition-all">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-purple-100 text-purple-700 text-2xl mb-4">
                🤖
              </div>
              <h3 className="font-bold text-lg text-slate-900 mb-2">Copiloto Sarin con IA</h3>
              <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                Impulsado por DeepSeek. Atiende pedidos automáticamente por WhatsApp y asiste al tendero en el POS con manos libres.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* 4. Vitrina Interactiva de Pasillos de Abastos (Sinergia Rappi + Blinkit) */}
      <section id="pasillos" className="py-16 bg-sf-light">
        <div className="container mx-auto px-4 sm:px-6">
          <div className="text-center max-w-2xl mx-auto mb-10">
            <span className="text-xs font-bold uppercase tracking-widest text-sf-primary">Demostración en Vivo</span>
            <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 mt-1">
              Explora los Pasillos y Vitrina Vecinal
            </h2>
            <p className="text-sm text-slate-600 mt-2">
              Prueba la rapidez con la que el tendero o el vecino arman su mercado con precios en COP:
            </p>
          </div>

          {/* Pasillos Rappi */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-8">
            {AISLES.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => setActiveCategory(a.name === activeCategory ? 'Todos' : a.name)}
                className={`p-3 rounded-xl border text-center transition-all ${
                  activeCategory === a.name
                    ? 'border-sf-primary bg-blue-50/80 shadow-xs ring-1 ring-sf-primary font-bold'
                    : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
              >
                <div className="text-2xl mb-1">{a.icon}</div>
                <div className="text-xs font-semibold text-slate-800 line-clamp-1">{a.name}</div>
                <div className="text-[10px] text-slate-500">{a.count}</div>
              </button>
            ))}
          </div>

          {/* Grid de Productos Blinkit + Carrito Lateral */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-3">
              {filteredProducts.map((prod) => {
                const qty = cart[prod.id] || 0;
                return (
                  <article
                    key={prod.id}
                    className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-3.5 shadow-2xs hover:shadow-xs transition"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-slate-50 p-1 border border-slate-200 shrink-0 overflow-hidden shadow-2xs">
                        {prod.image_url ? (
                          <img
                            src={prod.image_url}
                            alt={prod.name}
                            className="h-full w-full object-contain"
                            loading="lazy"
                          />
                        ) : (
                          <span className="text-2xl">{prod.emoji}</span>
                        )}
                      </div>
                      <div className="min-w-0">
                        <h4 className="font-semibold text-sm text-slate-800 truncate" title={prod.name}>
                          {prod.name}
                        </h4>
                        <span className="text-[11px] text-slate-500 block">{prod.unit}</span>
                        <span className="text-sm font-bold text-sf-primary tabular-nums">
                          {formatCOP(prod.priceCOP)}
                        </span>
                      </div>
                    </div>

                    <div>
                      {qty > 0 ? (
                        <div className="flex items-center gap-1.5 bg-emerald-50 border border-emerald-300 rounded-lg p-1">
                          <button
                            type="button"
                            onClick={() => removeFromCart(prod.id)}
                            className="h-8 w-8 rounded-md bg-white text-emerald-800 font-bold flex items-center justify-center hover:bg-slate-100 text-sm shadow-2xs"
                            aria-label={`Disminuir ${prod.name}`}
                          >
                            -
                          </button>
                          <span className="w-6 text-center font-bold text-sm text-emerald-900 tabular-nums">
                            {qty}
                          </span>
                          <button
                            type="button"
                            onClick={() => addToCart(prod.id)}
                            className="h-8 w-8 rounded-md bg-emerald-600 text-white font-bold flex items-center justify-center hover:bg-emerald-700 text-sm shadow-2xs"
                            aria-label={`Aumentar ${prod.name}`}
                          >
                            +
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => addToCart(prod.id)}
                          className="btn-primary min-h-[38px] px-3.5 text-xs font-semibold flex items-center gap-1.5 shadow-2xs"
                        >
                          <span>+ Agregar</span>
                        </button>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>

            {/* Canasta de Mercado en Vivo */}
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <h3 className="font-bold text-slate-900 flex items-center gap-2">
                    <span>🛒 Canasta en Mostrador</span>
                    <span className="rounded-full bg-sf-primary/10 px-2 py-0.5 text-xs font-bold text-sf-primary">
                      {cartItemCount} {cartItemCount === 1 ? 'ítem' : 'ítems'}
                    </span>
                  </h3>
                  <button
                    type="button"
                    onClick={() => setCart({})}
                    className="text-xs text-slate-400 hover:text-red-600 transition"
                  >
                    Vaciar
                  </button>
                </div>

                <div className="divide-y divide-slate-100 my-3 max-h-[260px] overflow-y-auto space-y-1">
                  {Object.entries(cart).length === 0 ? (
                    <div className="py-8 text-center text-xs text-slate-400">
                      Canasta vacía. Agrega productos de la izquierda para ver el total.
                    </div>
                  ) : (
                    Object.entries(cart).map(([id, qty]) => {
                      const prod = SAMPLE_PRODUCTS.find((p) => p.id === id);
                      if (!prod) return null;
                      return (
                        <div key={id} className="py-2 flex items-center justify-between text-xs gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            {prod.image_url ? (
                              <img
                                src={prod.image_url}
                                alt=""
                                className="h-8 w-8 rounded-lg object-contain bg-slate-50 p-0.5 border border-slate-200 shrink-0"
                              />
                            ) : null}
                            <div className="min-w-0">
                              <span className="font-medium text-slate-800 truncate block">{prod.name}</span>
                              <span className="text-slate-400 block text-[10px]">
                                {qty} × {formatCOP(prod.priceCOP)}
                              </span>
                            </div>
                          </div>
                          <span className="font-bold text-slate-900 tabular-nums shrink-0">
                            {formatCOP(prod.priceCOP * qty)}
                          </span>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              <div className="border-t border-slate-100 pt-3 space-y-3">
                <div className="flex items-center justify-between text-base font-bold text-slate-900">
                  <span>Total de Venta:</span>
                  <span className="text-xl text-emerald-700 tabular-nums">{formatCOP(cartTotal)}</span>
                </div>

                <a
                  href="#/registro-negocio"
                  className="btn-primary w-full min-h-[44px] flex items-center justify-center gap-2 text-sm font-semibold shadow-xs"
                >
                  <span>Cobrar esta venta en mi tienda →</span>
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 5. Selector Oficial de Planes SaaS */}
      <section id="planes" className="py-16 bg-white border-t border-slate-200">
        <div className="container mx-auto px-4 sm:px-6">
          <div className="text-center max-w-2xl mx-auto mb-12">
            <span className="text-xs font-bold uppercase tracking-widest text-sf-primary">Precios Claros y Accesibles</span>
            <h2 className="text-2xl sm:text-4xl font-extrabold text-slate-900 mt-1">
              Planes Flexibles para Todo Tipo de Local
            </h2>
            <p className="text-sm md:text-base text-slate-600 mt-2">
              Sin contratos amarrados. Paga únicamente por los días que operas y renueva a 1 clic por WhatsApp.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 max-w-6xl mx-auto">
            {SAAS_PLANS.filter((p) => p.id !== 'enterprise').map((plan) => (
              <div
                key={plan.id}
                className={`rounded-2xl border-2 p-6 flex flex-col justify-between transition-all ${
                  plan.popular
                    ? 'border-sf-primary bg-white shadow-lg ring-2 ring-sf-primary/20 scale-[1.02]'
                    : 'border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-bold text-lg text-slate-900">{plan.name}</h3>
                    {plan.popular && (
                      <span className="rounded-full bg-amber-500 px-2.5 py-0.5 text-[11px] font-bold text-white shadow-2xs">
                        {plan.badge || 'Más Popular'}
                      </span>
                    )}
                  </div>

                  <div className="my-3">
                    <span className="text-3xl font-extrabold text-sf-primary tabular-nums">
                      {formatCOP(plan.priceCOP)}
                    </span>
                    <span className="text-xs text-slate-500 ml-1">/ {plan.durationDays} días</span>
                  </div>

                  <p className="text-xs text-slate-600 mb-4">{plan.description}</p>

                  <div className="rounded-lg bg-blue-50/80 p-2 text-xs font-semibold text-sf-primary mb-4 flex items-center gap-1.5">
                    <span>🤖</span>
                    <span>{plan.cuotaIATurnos.toLocaleString('es-CO')} turnos Sarin IA</span>
                  </div>

                  <ul className="space-y-2 text-xs text-slate-600">
                    {plan.features.map((feat, idx) => (
                      <li key={idx} className="flex items-start gap-2">
                        <span className="text-emerald-600 font-bold">✓</span>
                        <span>{feat}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="pt-6">
                  <a
                    href="#/registro-negocio"
                    className={`w-full min-h-[44px] rounded-xl font-semibold text-sm flex items-center justify-center transition-all ${
                      plan.popular
                        ? 'btn-primary shadow-sm hover:shadow-md'
                        : 'btn-secondary hover:border-slate-400'
                    }`}
                  >
                    Elegir {plan.shortName}
                  </a>
                </div>
              </div>
            ))}
          </div>

          {/* Tarjeta Plan Enterprise */}
          <div className="mt-8 max-w-4xl mx-auto rounded-2xl border border-slate-300 bg-gradient-to-r from-sf-dark to-slate-900 text-white p-6 sm:p-8 flex flex-col md:flex-row items-center justify-between gap-6 shadow-md">
            <div>
              <div className="inline-block rounded-full bg-sf-cyan/20 border border-sf-cyan/40 px-3 py-1 text-xs font-bold text-sf-cyan mb-2">
                Plan Matriz y Cuentas Corporativas
              </div>
              <h3 className="text-xl sm:text-2xl font-bold">¿Tienes múltiples sedes o abastos mayoristas?</h3>
              <p className="text-xs sm:text-sm text-slate-300 mt-1 max-w-xl">
                Diseñamos una arquitectura dedicada con sincronización multitienda, Sarin IA sin límites de turnos y soporte directo en sitio.
              </p>
            </div>
            <a
              href="https://wa.me/573001234567?text=Hola,%20me%20interesa%20el%20Plan%20Enterprise%20para%20mi%20cadena%20de%20abastos"
              target="_blank"
              rel="noopener noreferrer"
              className="btn-secondary min-h-[46px] px-6 text-sm font-semibold bg-white text-sf-dark hover:bg-slate-100 shrink-0 shadow-md"
            >
              Hablar con un Asesor
            </a>
          </div>
        </div>
      </section>

      {/* 6. Footer Comercial */}
      <footer className="bg-sf-dark text-slate-400 py-12 border-t border-slate-800 text-xs">
        <div className="container mx-auto px-4 sm:px-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-8">
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-white font-bold text-lg">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-sf-primary text-white text-base">
                  S
                </span>
                <span>SurtiFácil SaaS</span>
              </div>
              <p className="text-slate-400 text-xs leading-relaxed">
                Plataforma de software para el comercio vecinal, abastos y tiendas de barrio en Medellín y Colombia.
              </p>
              <div className="text-slate-500 text-[11px]">
                Medellín, Antioquia · Orgullo Paisa
              </div>
            </div>

            <div>
              <h4 className="text-white font-semibold mb-3">Módulos del Sistema</h4>
              <ul className="space-y-2">
                <li><a href="#/login" className="hover:text-white transition">Punto de Venta POS</a></li>
                <li><a href="#/login" className="hover:text-white transition">Libro Digital de Fiados</a></li>
                <li><a href="#/login" className="hover:text-white transition">Arqueo de Caja COP</a></li>
                <li><a href="#/login" className="hover:text-white transition">Bandeja WhatsApp y Sarin</a></li>
              </ul>
            </div>

            <div>
              <h4 className="text-white font-semibold mb-3">Canales Vecinales</h4>
              <ul className="space-y-2">
                <li><a href="#pasillos" className="hover:text-white transition">Vitrina Vecinal Online</a></li>
                <li><a href="#kiosco" className="hover:text-white transition">Modo Kiosco Táctil iPad</a></li>
                <li><a href="#planes" className="hover:text-white transition">Planes y Precios</a></li>
                <li><a href="#/registro-negocio" className="hover:text-white transition">Registro de Nuevos Locales</a></li>
              </ul>
            </div>

            <div>
              <h4 className="text-white font-semibold mb-3">Acceso y Soporte</h4>
              <ul className="space-y-2">
                <li><a href="#/login" className="hover:text-white transition">Iniciar Sesión</a></li>
                <li><a href="#/super-admin" className="hover:text-white transition">👑 Centro SuperAdmin</a></li>
                <li>
                  <a
                    href="https://wa.me/573001234567"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-emerald-400 hover:text-emerald-300 transition flex items-center gap-1"
                  >
                    <span>WhatsApp de Soporte</span>
                  </a>
                </li>
              </ul>
            </div>
          </div>

          <div className="border-t border-slate-800 pt-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-slate-500">
            <p>© {new Date().getFullYear()} SurtiFácil SaaS. Todos los derechos reservados.</p>
            <p>Cloudflare Pages + D1 Edge Database + Firebase Auth</p>
          </div>
        </div>
      </footer>
    </div>
  );
}

