import React, { useState, useEffect, useRef } from 'react';
import type { Product } from '../firebase/db';
import {
  parseSarinSaleCommand,
  speakSarinResponse,
  VoiceSaleCommandResult,
} from '../utils/sarinVoiceParser';
import { Icon } from './ui/Icon';

interface SarinVoicePOSProps {
  products: Product[];
  onApplyCommand: (command: VoiceSaleCommandResult) => void;
  onClearCart?: () => void;
  onFinalizeSale?: () => void;
}

export const SarinVoicePOS: React.FC<SarinVoicePOSProps> = ({
  products,
  onApplyCommand,
  onClearCart,
  onFinalizeSale,
}) => {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [simulatedText, setSimulatedText] = useState('');
  const [lastCommand, setLastCommand] = useState<VoiceSaleCommandResult | null>(null);
  const [speechSupported, setSpeechSupported] = useState(true);
  const [showSimulateInput, setShowSimulateInput] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setSpeechSupported(false);
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = false;
      recognition.lang = 'es-CO';

      recognition.onstart = () => {
        setIsListening(true);
      };

      recognition.onresult = (event: any) => {
        const lastResult = event.results[event.results.length - 1];
        if (lastResult.isFinal) {
          const spokenText = lastResult[0].transcript.trim();
          setTranscript(spokenText);
          handleProcessVoice(spokenText);
        }
      };

      recognition.onerror = (event: any) => {
        console.warn('Speech recognition error:', event.error);
        if (event.error !== 'no-speech') {
          setIsListening(false);
        }
      };

      recognition.onend = () => {
        // En modo mostrador, si sigue activo intentamos mantener la escucha viva
        if (isListening) {
          try {
            recognition.start();
          } catch {
            setIsListening(false);
          }
        } else {
          setIsListening(false);
        }
      };

      recognitionRef.current = recognition;
    } catch (e) {
      console.warn('Error initializing SpeechRecognition:', e);
      setSpeechSupported(false);
    }

    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch {}
      }
    };
  }, [isListening, products]);

  const toggleListening = () => {
    if (!speechSupported || !recognitionRef.current) {
      setShowSimulateInput(true);
      return;
    }

    if (isListening) {
      setIsListening(false);
      try {
        recognitionRef.current.stop();
      } catch {}
    } else {
      setIsListening(true);
      try {
        recognitionRef.current.start();
      } catch (e) {
        console.warn('Error starting speech recognition:', e);
        setIsListening(false);
        setShowSimulateInput(true);
      }
    }
  };

  const handleProcessVoice = (text: string) => {
    const result = parseSarinSaleCommand(text, products);
    setLastCommand(result);

    // Ejecución de intenciones de control directo si aplica
    if (result.intent === 'CLEAR_CART') {
      if (onClearCart) onClearCart();
    } else if (result.intent === 'FINALIZE_SALE') {
      if (onFinalizeSale) onFinalizeSale();
    }

    // Doble confirmación didáctica: Locución auditiva
    setIsSpeaking(true);
    speakSarinResponse(result.spokenFeedback, () => {
      setIsSpeaking(false);
    });
  };

  const handleSimulateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!simulatedText.trim()) return;
    setTranscript(simulatedText.trim());
    handleProcessVoice(simulatedText.trim());
    setSimulatedText('');
  };

  const handleApply = () => {
    if (!lastCommand) return;
    onApplyCommand(lastCommand);
    setLastCommand(null);
  };

  const handleUndo = () => {
    setLastCommand(null);
    setTranscript('');
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
  };

  const handleRepeatVoice = () => {
    if (lastCommand) {
      setIsSpeaking(true);
      speakSarinResponse(lastCommand.spokenFeedback, () => {
        setIsSpeaking(false);
      });
    }
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-3 md:p-4 shadow-sm space-y-3">
      {/* Barra de Activación de Micrófono Sarin */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={toggleListening}
            aria-label={isListening ? 'Detener micrófono Sarin' : 'Activar micrófono Sarin'}
            aria-pressed={isListening}
            className={`flex min-h-[44px] items-center gap-2.5 rounded-xl px-4 text-sm font-bold transition shadow-sm ${
              isListening
                ? 'bg-emerald-600 text-white ring-4 ring-emerald-200 animate-pulse'
                : 'bg-slate-900 text-white hover:bg-slate-800'
            }`}
          >
            <span className="text-lg">🎙️</span>
            <span>{isListening ? 'Sarin Escuchando...' : 'Dictar Venta (Voz Sarin)'}</span>
            {isListening && (
              <span className="flex h-2.5 w-2.5 rounded-full bg-emerald-300 animate-ping" />
            )}
          </button>

          <span className="text-xs text-slate-500 hidden sm:inline">
            Palabra de activación: <strong>"Sarin..."</strong> (ej: <em>"Sarin, agrega dos leches y una libra de arroz, pagan con 20 mil"</em>)
          </span>
        </div>

        <button
          type="button"
          onClick={() => setShowSimulateInput(!showSimulateInput)}
          className="text-xs font-semibold text-sf-primary hover:underline flex items-center gap-1"
        >
          <Icon name="chat" size={14} />
          <span>{showSimulateInput ? 'Ocultar teclado' : 'Escribir / Simular comando'}</span>
        </button>
      </div>

      {/* Entrada manual / Simulador de Voz */}
      {showSimulateInput && (
        <form onSubmit={handleSimulateSubmit} className="flex gap-2 pt-1" aria-label="Simulador de comandos de voz">
          <input
            type="text"
            value={simulatedText}
            onChange={(e) => setSimulatedText(e.target.value)}
            placeholder='Ej: "Sarin, dos leches y una libra de arroz, pagan con 20 mil"'
            className="input flex-1 text-sm"
          />
          <button
            type="submit"
            className="btn-primary min-h-[44px] px-4 shrink-0 text-sm font-bold"
          >
            Interpretar Comando
          </button>
        </form>
      )}

      {/* Tarjeta Didáctica de Doble Confirmación Visual de Alto Contraste */}
      {lastCommand && (
        <div
          role="region"
          aria-label="Confirmación didáctica de comando de voz"
          className="rounded-2xl bg-slate-900 p-4 text-white shadow-xl border border-emerald-500/30 animate-in fade-in slide-in-from-top-2 duration-200 space-y-3"
        >
          {/* Cabecera de la tarjeta */}
          <div className="flex items-start justify-between gap-2 border-b border-slate-700/80 pb-2.5">
            <div>
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/20 px-2 py-0.5 text-xs font-semibold text-emerald-300">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                  Sarin Reconoció
                </span>
                {isSpeaking && (
                  <span className="text-xs text-emerald-400 font-medium animate-pulse flex items-center gap-1">
                    🔊 Hablando...
                  </span>
                )}
              </div>
              <p className="mt-1 text-sm italic text-slate-300">
                "{transcript || lastCommand.rawTranscript}"
              </p>
            </div>

            <button
              type="button"
              onClick={handleUndo}
              aria-label="Cerrar tarjeta de voz"
              className="text-slate-400 hover:text-white"
            >
              <Icon name="close" size={18} />
            </button>
          </div>

          {/* Desglose de ítems reconocidos */}
          {lastCommand.items.length > 0 ? (
            <div className="space-y-2">
              <ul className="divide-y divide-slate-800 rounded-xl bg-slate-950/60 p-2.5 text-sm">
                {lastCommand.items.map((item, idx) => (
                  <li key={idx} className="flex items-center justify-between py-1.5 px-1">
                    <span className="font-medium text-slate-200">
                      {item.quantity}× {item.product.name}
                    </span>
                    <span className="font-bold text-emerald-400 tabular-nums">
                      {item.subtotalCents ? `$ ${(item.subtotalCents / 100).toLocaleString('es-CO')}` : '$ 0'}
                    </span>
                  </li>
                ))}
              </ul>

              {/* Cálculos Financieros y Vueltas Gigantes */}
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 pt-1">
                <div className="rounded-xl bg-slate-800/80 p-2.5 text-center">
                  <span className="block text-xs font-medium text-slate-400">Total a Cobrar</span>
                  <span className="text-lg font-bold text-white tabular-nums">
                    {lastCommand.totalCOP}
                  </span>
                </div>

                {lastCommand.paymentMethod === 'credit' ? (
                  <div className="rounded-xl bg-amber-950/50 border border-amber-500/30 p-2.5 text-center col-span-2">
                    <span className="block text-xs font-medium text-amber-300">Método: Fiado</span>
                    <span className="text-base font-bold text-amber-200">
                      {lastCommand.creditCustomerName ? `Para: ${lastCommand.creditCustomerName}` : 'Sin cliente asignado'}
                    </span>
                  </div>
                ) : (
                  <>
                    <div className="rounded-xl bg-slate-800/80 p-2.5 text-center">
                      <span className="block text-xs font-medium text-slate-400">Efectivo Recibido</span>
                      <span className="text-lg font-bold text-slate-200 tabular-nums">
                        {lastCommand.receivedCashCOP || 'No especificado'}
                      </span>
                    </div>

                    <div className={`rounded-xl p-2.5 text-center col-span-2 sm:col-span-1 ${
                      lastCommand.isCashSufficient
                        ? 'bg-emerald-950/60 border border-emerald-500/40 text-emerald-300'
                        : 'bg-red-950/60 border border-red-500/40 text-red-300'
                    }`}>
                      <span className="block text-xs font-bold uppercase tracking-wide">
                        {lastCommand.isCashSufficient ? 'Vueltas a Entregar' : 'Dinero Insuficiente'}
                      </span>
                      <span className="text-2xl font-black tabular-nums">
                        {lastCommand.isCashSufficient
                          ? (lastCommand.changeCOP || '$ 0')
                          : `Faltan ${lastCommand.shortageCOP}`}
                      </span>
                    </div>
                  </>
                )}
              </div>
            </div>
          ) : (
            <p className="text-sm text-amber-300 bg-amber-950/40 p-2.5 rounded-xl border border-amber-500/20">
              {lastCommand.spokenFeedback}
            </p>
          )}

          {/* Botones de Acción Didácticos */}
          <div className="flex flex-wrap items-center justify-end gap-2 pt-1 border-t border-slate-800">
            <button
              type="button"
              onClick={handleRepeatVoice}
              aria-label="Repetir confirmación por voz"
              className="flex min-h-[40px] items-center gap-1.5 rounded-xl bg-slate-800 px-3 text-xs font-semibold text-slate-200 hover:bg-slate-700"
            >
              <span>🔄 Repetir por Voz</span>
            </button>

            <button
              type="button"
              onClick={handleUndo}
              aria-label="Deshacer comando"
              className="flex min-h-[40px] items-center gap-1.5 rounded-xl bg-slate-800 px-3 text-xs font-semibold text-slate-300 hover:bg-slate-700"
            >
              <span>↩️ Deshacer</span>
            </button>

            {lastCommand.items.length > 0 && (
              <button
                type="button"
                onClick={handleApply}
                aria-label="Aplicar productos al carrito"
                className="flex min-h-[40px] items-center gap-2 rounded-xl bg-emerald-600 px-4 text-sm font-bold text-white hover:bg-emerald-500 shadow-sm active:scale-95"
              >
                <span>✅ Aplicar a la Venta</span>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default SarinVoicePOS;
