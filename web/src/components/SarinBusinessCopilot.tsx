import React, { useState, useRef, useEffect } from 'react';
import { askSarinCopilot, CopilotResponse, CopilotAnalyticalResult } from '../services/sarinCopilotService';
import { speakSarinResponse } from '../utils/sarinVoiceParser';
import { Icon } from './ui/Icon';

interface ChatMessage {
  id: string;
  sender: 'user' | 'sarin';
  text: string;
  toolsInvoked?: CopilotAnalyticalResult[];
  timestamp: string;
}

interface SarinBusinessCopilotProps {
  isOpen: boolean;
  onClose: () => void;
}

const PRESET_QUERIES = [
  {
    label: '📊 Ventas y Ganancias de Hoy',
    query: '¿Cuánto llevamos vendido hoy y cuál es la ganancia estimada?',
  },
  {
    label: '📒 Top Clientes en Fiados',
    query: '¿Quiénes son los 5 clientes que más me deben en fiados?',
  },
  {
    label: '⚠️ Stock Crítico y Agotados',
    query: '¿Qué productos tienen stock crítico o están agotados hoy?',
  },
  {
    label: '🚚 Lista Sugerida de Compra',
    query: 'Ármame la lista sugerida de compra para reponer a proveedores',
  },
];

export const SarinBusinessCopilot: React.FC<SarinBusinessCopilotProps> = ({ isOpen, onClose }) => {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      sender: 'sarin',
      text: '¡Hola patrón! Soy **Sarin**, su copiloto inteligente de mostrador en SurtiFácil. ' +
        'Puedo analizar en tiempo real sus ventas, deudores de fiados, productos por agotarse y compras a proveedores. ' +
        '¿Qué desea consultar hoy?',
      timestamp: 'Ahora',
    },
  ]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(false);
  const [quotaRemaining, setQuotaRemaining] = useState<number | null>(null);
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (isOpen) {
      scrollToBottom();
    }
  }, [isOpen, messages]);

  // Manejo de reconocimiento de voz para consultas
  useEffect(() => {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) return;

    try {
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.lang = 'es-CO';

      recognition.onstart = () => setIsListening(true);
      recognition.onresult = (event: any) => {
        const text = event.results[0][0].transcript;
        if (text) {
          setInputText(text);
          sendMessage(text);
        }
      };
      recognition.onerror = () => setIsListening(false);
      recognition.onend = () => setIsListening(false);

      recognitionRef.current = recognition;
    } catch {}

    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch {}
      }
    };
  }, []);

  const toggleMic = () => {
    if (!recognitionRef.current) return;
    if (isListening) {
      try {
        recognitionRef.current.stop();
      } catch {}
      setIsListening(false);
    } else {
      try {
        recognitionRef.current.start();
        setIsListening(true);
      } catch {}
    }
  };

  const sendMessage = async (textToSend: string) => {
    const query = textToSend.trim();
    if (!query || loading) return;

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      sender: 'user',
      text: query,
      timestamp: new Date().toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputText('');
    setLoading(true);

    try {
      const history = messages.slice(-4).map((m) => ({
        role: (m.sender === 'user' ? 'user' : 'assistant') as 'user' | 'assistant',
        content: m.text,
      }));

      const res: CopilotResponse = await askSarinCopilot(query, history);

      if (res.quota) {
        setQuotaRemaining(res.quota.remaining);
      }

      const botMsg: ChatMessage = {
        id: `sarin-${Date.now()}`,
        sender: 'sarin',
        text: res.reply,
        toolsInvoked: res.toolsInvoked,
        timestamp: new Date().toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' }),
      };

      setMessages((prev) => [...prev, botMsg]);

      // Leer resumen automáticamente si el usuario usó la voz
      if (isListening) {
        setIsSpeaking(true);
        speakSarinResponse(res.reply.slice(0, 150), () => setIsSpeaking(false));
      }
    } catch {
      const errorMsg: ChatMessage = {
        id: `err-${Date.now()}`,
        sender: 'sarin',
        text: 'Lo siento, hubo un problema al consultar la información. Por favor inténtalo de nuevo.',
        timestamp: new Date().toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setLoading(false);
    }
  };

  const handleReadAloud = (text: string) => {
    setIsSpeaking(true);
    speakSarinResponse(text, () => setIsSpeaking(false));
  };

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="copilot-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-xs p-3 md:p-6"
    >
      <div className="relative flex flex-col h-full max-h-[640px] w-full max-w-2xl rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden animate-in zoom-in-95 duration-200">
        {/* Cabecera del Copiloto */}
        <div className="flex items-center justify-between border-b border-slate-200 bg-sf-dark px-4 py-3.5 text-white">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-sf-primary text-xl shadow-inner">
              🤖
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h2 id="copilot-title" className="text-base font-bold text-white">
                  Sarin Copiloto Gerencial
                </h2>
                <span className="rounded-full bg-sf-cyan/20 border border-sf-cyan/40 px-2 py-0.5 text-[10px] font-bold text-sf-cyan">
                  DeepSeek IA
                </span>
              </div>
              <p className="text-xs text-slate-300">
                Asesor financiero y operativo de mostrador en tiempo real
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {quotaRemaining !== null && (
              <span className="hidden sm:inline-flex rounded-full bg-slate-800 px-2.5 py-1 text-xs font-semibold text-slate-300">
                {quotaRemaining} turnos IA
              </span>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar Copiloto Sarin"
              className="icon-btn text-slate-400 hover:bg-slate-800 hover:text-white"
            >
              <Icon name="close" size={20} />
            </button>
          </div>
        </div>

        {/* Chips de Preguntas Frecuentes de Alto Valor */}
        <div className="border-b border-slate-100 bg-slate-50 px-3 py-2 overflow-x-auto no-scrollbar">
          <div className="flex items-center gap-2 min-w-max">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider pl-1">
              Atajos:
            </span>
            {PRESET_QUERIES.map((preset, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => sendMessage(preset.query)}
                disabled={loading}
                className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700 shadow-2xs hover:border-sf-primary hover:bg-sf-primary/5 transition active:scale-95 disabled:opacity-50"
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>

        {/* Feed de Conversación */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50/50">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex flex-col ${msg.sender === 'user' ? 'items-end' : 'items-start'}`}
            >
              <div className="flex items-center gap-1.5 mb-1 px-1">
                <span className="text-[11px] font-bold text-slate-500">
                  {msg.sender === 'user' ? 'Tú' : 'Sarin'}
                </span>
                <span className="text-[10px] text-slate-400">{msg.timestamp}</span>
              </div>

              <div
                className={`max-w-[90%] rounded-2xl px-4 py-3 text-sm shadow-xs ${
                  msg.sender === 'user'
                    ? 'bg-sf-primary text-white rounded-br-xs'
                    : 'bg-white text-slate-800 border border-slate-200/90 rounded-bl-xs'
                }`}
              >
                {/* Texto del Mensaje con formato limpio */}
                <div className="whitespace-pre-line space-y-1">
                  {msg.text.split('\n').map((line, i) => (
                    <p key={i}>{line}</p>
                  ))}
                </div>

                {/* Tarjetas Analíticas Ricas según herramientas invocadas */}
                {msg.toolsInvoked && msg.toolsInvoked.length > 0 && (
                  <div className="mt-3 space-y-2 pt-2 border-t border-slate-100">
                    {msg.toolsInvoked.map((tool, idx) => (
                      <ToolResultCard key={idx} tool={tool} />
                    ))}
                  </div>
                )}

                {/* Botón de Locución para el mensaje de Sarin */}
                {msg.sender === 'sarin' && (
                  <div className="mt-2 flex items-center justify-end pt-1 border-t border-slate-100/60">
                    <button
                      type="button"
                      onClick={() => handleReadAloud(msg.text)}
                      aria-label="Escuchar respuesta"
                      className="text-[11px] font-semibold text-slate-400 hover:text-sf-primary flex items-center gap-1"
                    >
                      <span>🔊 Escuchar</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}

          {loading && (
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 bg-white p-3 rounded-2xl border border-slate-200 w-fit shadow-xs">
              <span className="h-2 w-2 rounded-full bg-sf-primary animate-ping" />
              <span>Sarin está analizando la base de datos...</span>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Barra de Entrada de Consulta */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            sendMessage(inputText);
          }}
          className="flex items-center gap-2 border-t border-slate-200 bg-white p-3"
        >
          <button
            type="button"
            onClick={toggleMic}
            aria-label={isListening ? 'Detener micrófono' : 'Hablar con Sarin'}
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition ${
              isListening
                ? 'bg-emerald-600 text-white animate-pulse ring-4 ring-emerald-200'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <span className="text-lg">🎙️</span>
          </button>

          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder='Pregúntale a Sarin (ej: "¿Cuánto vendimos hoy?")'
            className="input flex-1 text-sm min-h-[44px]"
            disabled={loading}
          />

          <button
            type="submit"
            disabled={!inputText.trim() || loading}
            aria-label="Enviar mensaje a Sarin"
            className="btn-primary min-h-[44px] px-4 shrink-0 text-sm font-bold disabled:opacity-50"
          >
            <Icon name="chevron-right" size={18} />
          </button>
        </form>
      </div>
    </div>
  );
};

/** Tarjeta renderizadora de herramientas analíticas */
function ToolResultCard({ tool }: { tool: CopilotAnalyticalResult }) {
  const { tool: name, data } = tool;

  if (name === 'consultar_ventas_y_ganancias') {
    return (
      <div className="rounded-xl bg-slate-900 p-3 text-white text-xs space-y-2 border border-emerald-500/30">
        <div className="flex items-center justify-between border-b border-slate-800 pb-1.5">
          <span className="font-bold text-emerald-400">📊 Balance de Ventas ({data.period_label as string})</span>
          <span className="text-slate-400">{data.numero_ventas as number} ventas</span>
        </div>
        <div className="grid grid-cols-2 gap-2 text-center pt-1">
          <div className="bg-slate-800/90 rounded-lg p-2">
            <span className="block text-[10px] text-slate-400">Ventas Totales</span>
            <span className="text-sm font-bold text-white tabular-nums">{data.total_ventas_cop as string}</span>
          </div>
          <div className="bg-emerald-950/60 border border-emerald-500/30 rounded-lg p-2">
            <span className="block text-[10px] text-emerald-300">Ganancia Bruta</span>
            <span className="text-sm font-extrabold text-emerald-300 tabular-nums">{data.ganancia_neta_cop as string}</span>
          </div>
        </div>
      </div>
    );
  }

  if (name === 'consultar_deudores_fiados') {
    const deudores = (data.top_deudores as any[]) || [];
    return (
      <div className="rounded-xl bg-amber-950/20 p-3 text-xs space-y-2 border border-amber-300/40">
        <div className="flex items-center justify-between border-b border-amber-200/40 pb-1.5">
          <span className="font-bold text-amber-900">📒 Cartera Morosa ({data.total_clientes_deudores as number} clientes)</span>
          <span className="font-bold text-amber-900 tabular-nums">{data.total_cartera_pendiente_cop as string}</span>
        </div>
        <ul className="divide-y divide-amber-200/30 text-amber-950">
          {deudores.map((d, i) => (
            <li key={i} className="flex items-center justify-between py-1">
              <span className="font-medium truncate max-w-[150px]">{d.nombre}</span>
              <span className="font-bold tabular-nums">{d.saldo_pendiente_cop}</span>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  if (name === 'consultar_stock_critico') {
    const prods = (data.productos_criticos as any[]) || [];
    return (
      <div className="rounded-xl bg-red-950/10 p-3 text-xs space-y-2 border border-red-200">
        <div className="flex items-center justify-between border-b border-red-100 pb-1.5">
          <span className="font-bold text-red-900">⚠️ Inventario Crítico ({data.total_productos_criticos as number} items)</span>
        </div>
        <ul className="divide-y divide-red-100 text-red-950">
          {prods.slice(0, 4).map((p, i) => (
            <li key={i} className="flex items-center justify-between py-1">
              <span className="truncate max-w-[160px]">{p.nombre}</span>
              <span className="font-bold text-red-600">Quedan {p.stock_actual} {p.unidad}</span>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  if (name === 'sugerir_orden_compra') {
    const items = (data.items_sugeridos as any[]) || [];
    return (
      <div className="rounded-xl bg-sky-950/10 p-3 text-xs space-y-2 border border-sky-200">
        <div className="flex items-center justify-between border-b border-sky-100 pb-1.5">
          <span className="font-bold text-sky-900">🚚 Propuesta de Abastecimiento ({data.total_items as number} productos)</span>
          <span className="font-bold text-sky-900 tabular-nums">{data.inversion_total_estimada_cop as string}</span>
        </div>
        <ul className="divide-y divide-sky-100 text-sky-950">
          {items.slice(0, 4).map((item, i) => (
            <li key={i} className="flex items-center justify-between py-1">
              <span className="truncate max-w-[160px]">{item.nombre}</span>
              <span className="font-semibold text-sky-700">Pedir {item.cantidad_sugerida} {item.unidad}</span>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return null;
}

export default SarinBusinessCopilot;
