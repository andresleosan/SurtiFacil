import { useEffect, useRef, useState } from "react";
import type {
  WhatsAppConversation,
  WhatsAppMessage,
  WhatsAppOrder,
  SarinSimulationResult,
} from "../types/whatsapp";
import {
  getConversations,
  getMessages,
  sendMessage,
  getWhatsAppOrders,
  processMessageForOrder,
  createWhatsAppOrder,
  updateOrderStatus,
  archiveConversation,
  toggleBotStatus,
  simulateSarinMessage,
} from "../services/whatsappService";
import { getProducts } from "../services/saleService";
import { useIsMobile } from "../hooks/useMediaQuery";
import { Icon } from "./ui/Icon";
import { formatCentsCOP } from "../utils/currency";

type TabType = "conversations" | "simulator" | "orders" | "statistics";

const POLL_INTERVAL_MS = 5000;

interface SimMessage {
  id: string;
  sender: "customer" | "bot_sarin";
  text: string;
  timestamp: Date;
  tools?: string[];
  orderCode?: string;
  trackingToken?: string;
}

export default function WhatsAppChat() {
  const isMobile = useIsMobile();
  const [conversations, setConversations] = useState<WhatsAppConversation[]>([]);
  const [selectedConversation, setSelectedConversation] =
    useState<WhatsAppConversation | null>(null);
  const [messages, setMessages] = useState<WhatsAppMessage[]>([]);
  const [orders, setOrders] = useState<WhatsAppOrder[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [activeTab, setActiveTab] = useState<TabType>("conversations");
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [sendError, setSendError] = useState<string | null>(null);
  const [togglingBot, setTogglingBot] = useState(false);

  // Estado para el Simulador de Sarin
  const [simCustomerName, setSimCustomerName] = useState("Doña Gloria (Vecina)");
  const [simCustomerPhone, setSimCustomerPhone] = useState("+573009876543");
  const [simInput, setSimInput] = useState("");
  const [simLoading, setSimLoading] = useState(false);
  const [simMessages, setSimMessages] = useState<SimMessage[]>([
    {
      id: "sim-init",
      sender: "bot_sarin",
      text: "¡Hola vecino/vecina! Soy Sarin, el bot asistente de la tienda. ¿Qué le provoca llevar hoy de nuestro mercado de abastos?",
      timestamp: new Date(),
    },
  ]);
  const [simOrderCreated, setSimOrderCreated] = useState<SarinSimulationResult["orderCreated"]>(null);

  // Referencia a la conversación seleccionada para que el polling lea el valor actual
  const selectedConversationRef = useRef<WhatsAppConversation | null>(null);

  // Cargar conversaciones
  useEffect(() => {
    loadConversations();
    loadOrders();

    let interval: ReturnType<typeof setInterval> | null = null;

    const poll = () => {
      loadConversations();
      const current = selectedConversationRef.current;
      if (current) {
        loadMessages(current.id);
      }
    };

    const startPolling = () => {
      if (interval === null) {
        interval = setInterval(poll, POLL_INTERVAL_MS);
      }
    };

    const stopPolling = () => {
      if (interval !== null) {
        clearInterval(interval);
        interval = null;
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        stopPolling();
      } else {
        startPolling();
      }
    };

    if (document.visibilityState !== "hidden") {
      startPolling();
    }
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      stopPolling();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  // Cargar mensajes cuando se selecciona una conversación
  useEffect(() => {
    selectedConversationRef.current = selectedConversation;
    setSendError(null);
    if (selectedConversation) {
      loadMessages(selectedConversation.id);
    }
  }, [selectedConversation]);

  const loadConversations = async () => {
    try {
      const data = await getConversations();
      setConversations(data);
    } catch {
      console.error("Error loading conversations.");
    }
  };

  const loadMessages = async (conversationId: string) => {
    try {
      const data = await getMessages(conversationId);
      setMessages(data);
    } catch {
      console.error("Error loading messages.");
    }
  };

  const loadOrders = async () => {
    try {
      const data = await getWhatsAppOrders();
      setOrders(data);
    } catch {
      console.error("Error loading orders.");
    }
  };

  const handleSendMessage = async () => {
    if (!newMessage.trim() || !selectedConversation) return;

    setLoading(true);
    try {
      await sendMessage(selectedConversation.id, newMessage);

      const processedData = processMessageForOrder(newMessage);

      if (processedData.hasOrder && processedData.products) {
        const allProducts = await getProducts();
        const findProduct = (name: string) =>
          allProducts.find(
            (p) =>
              p.name.toLowerCase().includes(name.toLowerCase()) ||
              name.toLowerCase().includes(p.name.toLowerCase())
          );

        let totalPrice = 0;
        const items = processedData.products.map((p) => {
          const matched = findProduct(p.name);
          const price = matched ? matched.price_cents : 0;
          totalPrice += p.quantity * price;
          return {
            productId: matched?.id || "",
            productName: matched?.name || p.name,
            quantity: p.quantity,
            price,
          };
        });

        await createWhatsAppOrder({
          conversationId: selectedConversation.id,
          phoneNumber: selectedConversation.phoneNumber,
          customerName: selectedConversation.customerName,
          items,
          deliveryAddress: processedData.address || "Por confirmar",
          totalPrice,
          status: "pending",
          createdAt: new Date(),
          orderNotes: processedData.rawText,
        });
      }

      setSendError(null);
      setNewMessage("");
      loadMessages(selectedConversation.id);
      loadOrders();
    } catch {
      console.error("Error sending message.");
      setSendError("Error al enviar mensaje");
    } finally {
      setLoading(false);
    }
  };

  const handleToggleBot = async () => {
    if (!selectedConversation || togglingBot) return;
    setTogglingBot(true);
    try {
      const currentActive = selectedConversation.botActive !== false && selectedConversation.status !== "paused";
      const nextActive = !currentActive;
      await toggleBotStatus(selectedConversation.id, nextActive, 2);

      const updated = {
        ...selectedConversation,
        botActive: nextActive,
        status: (nextActive ? "active" : "paused") as WhatsAppConversation["status"],
      };
      setSelectedConversation(updated);
      setConversations((prev) =>
        prev.map((c) => (c.id === updated.id ? updated : c))
      );
    } finally {
      setTogglingBot(false);
    }
  };

  const handleArchiveConversation = async () => {
    if (!selectedConversation) return;
    try {
      await archiveConversation(selectedConversation.id);
      loadConversations();
      setSelectedConversation(null);
    } catch {
      console.error("Error archiving conversation.");
    }
  };

  const handleConfirmOrder = async (orderId: string) => {
    try {
      await updateOrderStatus(orderId, "confirmed");
      loadOrders();
    } catch {
      console.error("Error confirming order.");
    }
  };

  // Enviar mensaje en el simulador
  const handleSendSimulation = async (textToSend?: string) => {
    const text = (textToSend || simInput).trim();
    if (!text || simLoading) return;

    const userMsgId = `sim-user-${Date.now()}`;
    const userMsg: SimMessage = {
      id: userMsgId,
      sender: "customer",
      text,
      timestamp: new Date(),
    };

    setSimMessages((prev) => [...prev, userMsg]);
    setSimInput("");
    setSimLoading(true);

    try {
      const res = await simulateSarinMessage({
        messageText: text,
        phoneNumber: simCustomerPhone,
        customerName: simCustomerName,
      });

      if (res?.reply) {
        const botMsg: SimMessage = {
          id: `sim-bot-${Date.now()}`,
          sender: "bot_sarin",
          text: res.reply,
          timestamp: new Date(),
          tools: res.toolsInvoked?.map((t) => t.tool),
          orderCode: res.orderCreated?.orderCode,
          trackingToken: res.orderCreated?.trackingToken,
        };
        setSimMessages((prev) => [...prev, botMsg]);
      }

      if (res?.orderCreated) {
        setSimOrderCreated(res.orderCreated);
        loadOrders();
      }
    } catch {
      const errMsg: SimMessage = {
        id: `sim-err-${Date.now()}`,
        sender: "bot_sarin",
        text: "¡Hola vecino! Hubo una pequeña interrupción en la simulación. Por favor intenta de nuevo.",
        timestamp: new Date(),
      };
      setSimMessages((prev) => [...prev, errMsg]);
    } finally {
      setSimLoading(false);
    }
  };

  const quickResponses = [
    "¿Cuál es tu dirección de envío?",
    "Perfecto, confirmo tu orden. Te llegará hoy.",
    "Lamentablemente ese producto no está disponible.",
    "¿En qué hora prefieres que te entregue?",
    "Gracias por tu compra, que disfrutes 🎉",
  ];

  const simulationPresets = [
    { label: "🥑 Consultar verduras y frutas", text: "¡Hola vecino! ¿Qué verduras y frutas tiene frescas hoy?" },
    { label: "🥛 Pedir leche y arroz", text: "Quiero 2 leches y una libra de arroz" },
    { label: "🛵 Domicilio en Laureles", text: "Por favor a domicilio a la Carrera 70 # 45-20 en Laureles" },
    { label: "📦 Rastrear pedido", text: "¿Cómo va mi pedido #W-01?" },
    { label: "👨‍🌾 Transferir al tendero", text: "Quiero hablar con el tendero" },
  ];

  const filteredConversations = conversations.filter(
    (conv) =>
      conv.customerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      conv.phoneNumber.includes(searchTerm)
  );

  const pendingOrders = orders.filter((o) => o.status === "pending");
  const confirmedOrders = orders.filter((o) => o.status === "confirmed");
  const totalSales = orders.reduce((sum, o) => sum + o.totalPrice, 0);

  // En teléfonos: lista o conversación (maestro–detalle). En md+: ambas.
  const showConversationList = !isMobile || !selectedConversation;
  const showConversationPane = !isMobile || !!selectedConversation;

  const tabClass = (tab: TabType) =>
    `min-h-[44px] shrink-0 whitespace-nowrap px-4 py-3 md:px-6 font-semibold transition-all border-b-2 ${
      activeTab === tab
        ? "border-sf-primary text-sf-primary"
        : "border-transparent text-gray-600 hover:text-sf-text"
    }`;

  const renderConversationList = () => (
    <div className="w-full md:w-80 lg:w-96 border-r border-slate-200 bg-white flex flex-col min-h-0">
      {/* Buscador de clientes */}
      <div className="p-3 md:p-4 border-b border-slate-200">
        <label htmlFor="search-customers" className="sr-only">
          Buscar cliente
        </label>
        <div className="relative">
          <input
            id="search-customers"
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar cliente..."
            className="input pl-9 text-sm w-full"
          />
          <span className="absolute left-3 top-2.5 text-slate-400">🔍</span>
        </div>
      </div>

      {/* Lista de conversaciones */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {filteredConversations.length === 0 ? (
          <div className="text-center text-slate-400 py-12 px-4">
            <p>No se encontraron conversaciones</p>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {filteredConversations.map((conv) => {
              const isBotActive = conv.botActive !== false && conv.status !== "paused";
              return (
                <li key={conv.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedConversation(conv)}
                    className={`w-full text-left p-3 md:p-4 hover:bg-slate-50 transition-all flex items-start justify-between gap-2 min-h-[56px] ${
                      selectedConversation?.id === conv.id
                        ? "bg-blue-50/70 border-l-4 border-sf-primary"
                        : ""
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="font-semibold text-slate-900 truncate text-sm md:text-base">
                          {conv.customerName}
                        </p>
                        {isBotActive ? (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 shrink-0">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                            Sarin
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200 shrink-0">
                            ⏸️ Tendero
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-500 font-mono">
                        {conv.phoneNumber}
                      </p>
                      {conv.lastMessageText && (
                        <p className="text-xs text-slate-600 truncate mt-1">
                          {conv.lastMessageText}
                        </p>
                      )}
                    </div>
                    {isMobile && (
                      <Icon
                        name="chevron-right"
                        className="shrink-0 text-slate-400 mt-2"
                      />
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Sección de Configuración de Meta Webhook */}
      <div className="border-t border-slate-200 p-3 md:p-4 bg-blue-50 shrink-0">
        <p className="text-xs font-semibold text-blue-900 mb-2 flex items-center gap-2">
          <span>⚙️</span> Configuración Requerida
        </p>
        <ul className="space-y-1.5 text-xs text-blue-900">
          <li className="flex items-start gap-2">
            <span className="text-blue-500 mt-0.5">•</span>
            <span>Backend con webhooks de Meta configurado</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-blue-500 mt-0.5">•</span>
            <span>Número de WhatsApp Business verificado en Meta</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-blue-500 mt-0.5">•</span>
            <span>
              Credenciales de Meta Graph API / WhatsApp Cloud API configuradas en variables de entorno
            </span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-blue-500 mt-0.5">•</span>
            <span>
              Servidor de backend desplegado para recibir mensajes
            </span>
          </li>
        </ul>
      </div>
    </div>
  );

  const renderConversationPane = () => (
    <div className="flex-1 min-w-0 flex flex-col bg-white min-h-0">
      {selectedConversation ? (
        <>
          {/* Header del chat */}
          <div className="bg-gradient-to-r from-blue-50 to-slate-50 border-b border-slate-200 px-3 md:px-6 py-2 md:py-3 flex justify-between items-center gap-2 shrink-0">
            <div className="flex items-center gap-2 min-w-0">
              {isMobile && (
                <button
                  type="button"
                  onClick={() => setSelectedConversation(null)}
                  className="icon-btn text-slate-700 hover:bg-slate-100"
                  aria-label="Volver a conversaciones"
                >
                  <Icon name="chevron-left" />
                </button>
              )}
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-bold text-base md:text-lg text-slate-900 truncate">
                    {selectedConversation.customerName}
                  </p>
                  {selectedConversation.botActive !== false && selectedConversation.status !== "paused" ? (
                    <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                      🤖 Sarin Activo
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-200">
                      ⏸️ Pausado (Atención Humana)
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-600 font-mono">
                  {selectedConversation.phoneNumber}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {/* Botón de alternancia de bot */}
              <button
                type="button"
                onClick={handleToggleBot}
                disabled={togglingBot}
                aria-label="Alternar Bot Sarin"
                className={`min-h-[40px] px-3 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 border ${
                  selectedConversation.botActive !== false && selectedConversation.status !== "paused"
                    ? "bg-amber-50 text-amber-700 border-amber-300 hover:bg-amber-100"
                    : "bg-emerald-50 text-emerald-700 border-emerald-300 hover:bg-emerald-100"
                }`}
              >
                {selectedConversation.botActive !== false && selectedConversation.status !== "paused" ? (
                  <>
                    <span>⏸️</span>
                    <span className="hidden sm:inline">Pausar Bot (2h)</span>
                  </>
                ) : (
                  <>
                    <span>🤖</span>
                    <span className="hidden sm:inline">Reanudar Sarin</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={handleArchiveConversation}
                className="min-h-[40px] px-3 bg-red-50 text-red-700 border border-red-200 rounded-lg hover:bg-red-100 text-xs font-semibold transition-all"
              >
                Archivar
              </button>
            </div>
          </div>

          {/* Banner de canasta actual si existe */}
          {selectedConversation.cart && selectedConversation.cart.length > 0 && (
            <div className="bg-emerald-50 border-b border-emerald-200 px-4 py-2 flex items-center justify-between gap-3 text-xs text-emerald-900 shrink-0">
              <div className="flex items-center gap-2 truncate">
                <span className="font-bold">🛒 Canasta en curso:</span>
                <span className="truncate">
                  {selectedConversation.cart.map((c) => `${c.productName} ×${c.quantity}`).join(", ")}
                </span>
              </div>
              <span className="font-bold text-sm shrink-0">
                {formatCentsCOP(
                  selectedConversation.cart.reduce((a, b) => a + (b.subtotalCents || b.quantity * b.priceCents), 0)
                )}
              </span>
            </div>
          )}

          {/* Mensajes */}
          <div className="flex-1 min-h-0 overflow-y-auto p-4 md:p-6 space-y-4 bg-gradient-to-b from-slate-50 to-white">
            {messages.length === 0 ? (
              <div className="text-center text-slate-400 py-12">
                <p>Sin mensajes aún</p>
              </div>
            ) : (
              messages.map((msg) => {
                const isOutbound = msg.sender === "admin" || msg.sender === "bot_sarin";
                const isSarin = msg.sender === "bot_sarin";

                return (
                  <div
                    key={msg.id}
                    className={`flex ${isOutbound ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`max-w-[85%] md:max-w-md px-4 py-3 rounded-2xl shadow-sm ${
                        isSarin
                          ? "bg-emerald-600 text-white rounded-br-none border border-emerald-700"
                          : isOutbound
                          ? "bg-sf-primary text-white rounded-br-none"
                          : "bg-white text-slate-900 rounded-bl-none border border-slate-200"
                      }`}
                    >
                      {isSarin && (
                        <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-emerald-100 mb-1">
                          <span>🤖</span>
                          <span>Bot Sarin (Automático)</span>
                        </div>
                      )}
                      <p className="text-sm break-words whitespace-pre-wrap">{msg.message}</p>
                      
                      {msg.metadata?.orderCode && (
                        <div className="mt-2 pt-2 border-t border-white/20 text-xs">
                          <span className="font-bold">Turno: {msg.metadata.orderCode}</span>
                          {msg.metadata.trackingToken && (
                            <a
                              href={`#/pedido/${msg.metadata.trackingToken}`}
                              target="_blank"
                              rel="noreferrer"
                              className="block mt-1 underline font-semibold text-emerald-100 hover:text-white"
                            >
                              🔍 Ver rastreo en vivo ➔
                            </a>
                          )}
                        </div>
                      )}

                      <p className="text-[10px] mt-1.5 opacity-75 text-right font-mono">
                        {new Date(msg.timestamp).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </p>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Respuestas rápidas */}
          <div className="border-t border-slate-200 bg-slate-50 p-2 md:p-3 shrink-0">
            <p className="text-[11px] font-semibold text-slate-700 mb-1.5">
              Respuestas rápidas para el tendero:
            </p>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {quickResponses.map((response, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setNewMessage(response)}
                  className="min-h-[36px] shrink-0 whitespace-nowrap text-left text-xs px-3 py-1.5 bg-white hover:bg-blue-50 rounded-lg border border-slate-300 transition-all text-slate-700 hover:text-blue-600"
                >
                  {response}
                </button>
              ))}
            </div>
          </div>

          {/* Input de mensaje */}
          <div className="border-t border-slate-200 p-3 md:p-4 bg-white shrink-0">
            {sendError && (
              <div
                role="alert"
                className="mb-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
              >
                {sendError}
              </div>
            )}
            <div className="flex gap-2">
              <label htmlFor="whatsapp-message" className="sr-only">
                Mensaje
              </label>
              <input
                id="whatsapp-message"
                type="text"
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSendMessage();
                }}
                placeholder="Escribe un mensaje..."
                className="input flex-1 text-sm"
                disabled={loading}
              />
              <button
                type="button"
                onClick={handleSendMessage}
                disabled={loading || !newMessage.trim()}
                aria-label="Enviar mensaje"
                className="btn-primary shrink-0"
              >
                {loading ? "Enviando..." : "Enviar"}
              </button>
            </div>
          </div>
        </>
      ) : (
        <div className="flex items-center justify-center h-full text-slate-400 p-6 text-center">
          <p>Selecciona una conversación para comenzar</p>
        </div>
      )}
    </div>
  );

  // Pestaña del Simulador de Sarin IA
  const renderSimulatorPane = () => (
    <div className="flex-1 min-w-0 flex flex-col bg-white min-h-0">
      {/* Cabecera del Simulador */}
      <div className="bg-gradient-to-r from-emerald-600 to-teal-700 text-white p-4 shrink-0 flex flex-col md:flex-row md:items-center justify-between gap-3 shadow-sm">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-2xl">🤖</span>
            <h2 className="text-lg font-bold">Simulador Interactivo de Sarin Vecino (DeepSeek)</h2>
          </div>
          <p className="text-xs text-emerald-100 mt-0.5">
            Prueba cómo Sarin consulta el inventario en D1, arma la canasta y confirma pedidos en tiempo real.
          </p>
        </div>

        <div className="flex items-center gap-2 text-xs">
          <div className="bg-white/10 px-3 py-1.5 rounded-lg border border-white/20">
            <span className="text-emerald-200">Simulando como:</span>{" "}
            <span className="font-bold">{simCustomerName}</span>
          </div>
          <button
            type="button"
            onClick={() => {
              setSimMessages([
                {
                  id: "sim-reset",
                  sender: "bot_sarin",
                  text: "¡Hola vecino! Canasta reiniciada. ¿Qué le colaboro hoy de la tienda?",
                  timestamp: new Date(),
                },
              ]);
              setSimOrderCreated(null);
            }}
            className="px-3 py-1.5 bg-white/20 hover:bg-white/30 rounded-lg font-semibold transition-all"
          >
            🔄 Reiniciar
          </button>
        </div>
      </div>

      {/* Chips de prueba rápida */}
      <div className="bg-emerald-50/80 border-b border-emerald-100 p-3 shrink-0">
        <p className="text-xs font-bold text-emerald-900 mb-2 flex items-center gap-1.5">
          <span>⚡</span>
          <span>Casos de prueba rápida (haz clic para probar al instante):</span>
        </p>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {simulationPresets.map((preset, idx) => (
            <button
              key={idx}
              type="button"
              disabled={simLoading}
              onClick={() => handleSendSimulation(preset.text)}
              className="min-h-[36px] shrink-0 text-xs px-3 py-1.5 bg-white hover:bg-emerald-100 text-emerald-800 rounded-lg border border-emerald-200 transition-all font-medium shadow-2xs"
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>

      {/* Historial de la simulación */}
      <div className="flex-1 min-h-0 overflow-y-auto p-4 md:p-6 space-y-4 bg-slate-50/60">
        {simMessages.map((msg) => {
          const isBot = msg.sender === "bot_sarin";
          return (
            <div
              key={msg.id}
              className={`flex ${isBot ? "justify-start" : "justify-end"}`}
            >
              <div
                className={`max-w-[85%] md:max-w-xl p-4 rounded-2xl shadow-xs ${
                  isBot
                    ? "bg-white text-slate-800 border border-slate-200 rounded-bl-none"
                    : "bg-sf-primary text-white rounded-br-none"
                }`}
              >
                <div className="flex items-center justify-between gap-3 mb-1 text-[11px] opacity-75 font-semibold">
                  <span>{isBot ? "🤖 Sarin Vecino (Bot IA)" : `👤 ${simCustomerName}`}</span>
                  <span className="font-mono">
                    {msg.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>

                <p className="text-sm whitespace-pre-wrap">{msg.text}</p>

                {/* Badges de herramientas invocadas */}
                {msg.tools && msg.tools.length > 0 && (
                  <div className="mt-3 pt-2.5 border-t border-slate-100 flex flex-wrap gap-1.5">
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">
                      Herramientas D1:
                    </span>
                    {msg.tools.map((t, i) => (
                      <span
                        key={i}
                        className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-purple-50 text-purple-700 border border-purple-200"
                      >
                        ⚡ {t}
                      </span>
                    ))}
                  </div>
                )}

                {/* Tarjeta de turno generado */}
                {msg.orderCode && (
                  <div className="mt-3 p-3 bg-emerald-50 rounded-xl border border-emerald-200">
                    <p className="text-xs font-bold text-emerald-800">
                      🎉 Pedido confirmado: {msg.orderCode}
                    </p>
                    {msg.trackingToken && (
                      <a
                        href={`#/pedido/${msg.trackingToken}`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-block mt-1 text-xs text-emerald-700 font-bold underline hover:text-emerald-900"
                      >
                        Ver vista pública de rastreo en vivo ➔
                      </a>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {simLoading && (
          <div className="flex justify-start">
            <div className="bg-white border border-slate-200 p-4 rounded-2xl rounded-bl-none shadow-xs flex items-center gap-3 text-slate-600 text-sm">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping" />
              <span>Sarin está consultando el catálogo y calculando tu pedido...</span>
            </div>
          </div>
        )}
      </div>

      {/* Input de la simulación */}
      <div className="p-3 md:p-4 bg-white border-t border-slate-200 shrink-0">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSendSimulation();
          }}
          className="flex gap-2"
        >
          <input
            type="text"
            value={simInput}
            onChange={(e) => setSimInput(e.target.value)}
            placeholder="Escribe como si fueras un vecino de Medellín pidiendo por WhatsApp..."
            className="input flex-1 text-sm"
            disabled={simLoading}
          />
          <button
            type="submit"
            disabled={simLoading || !simInput.trim()}
            className="btn-primary shrink-0 bg-emerald-600 hover:bg-emerald-700"
          >
            {simLoading ? "Procesando..." : "Enviar a Sarin"}
          </button>
        </form>
      </div>
    </div>
  );

  const renderStatistics = () => (
    <div className="p-4 md:p-6 bg-gradient-to-br from-sf-light to-gray-50">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6 mb-6 md:mb-8">
        <div className="bg-white rounded-lg shadow-md p-4 md:p-6 border-l-4 border-sf-primary">
          <p className="text-gray-600 text-sm font-semibold mb-2">
            Total Conversaciones
          </p>
          <p className="text-3xl md:text-4xl font-bold text-sf-primary">
            {conversations.length}
          </p>
          <p className="text-xs text-gray-500 mt-2">Clientes únicos</p>
        </div>

        <div className="bg-white rounded-lg shadow-md p-4 md:p-6 border-l-4 border-yellow-500">
          <p className="text-gray-600 text-sm font-semibold mb-2">
            Órdenes Pendientes
          </p>
          <p className="text-3xl md:text-4xl font-bold text-yellow-600">
            {pendingOrders.length}
          </p>
          <p className="text-xs text-gray-500 mt-2">Por confirmar</p>
        </div>

        <div className="bg-white rounded-lg shadow-md p-4 md:p-6 border-l-4 border-green-500">
          <p className="text-gray-600 text-sm font-semibold mb-2">
            Órdenes Confirmadas
          </p>
          <p className="text-3xl md:text-4xl font-bold text-green-600">
            {confirmedOrders.length}
          </p>
          <p className="text-xs text-gray-500 mt-2">En procesamiento</p>
        </div>

        <div className="bg-white rounded-lg shadow-md p-4 md:p-6 border-l-4 border-sf-cyan">
          <p className="text-gray-600 text-sm font-semibold mb-2">
            Total Ventas WhatsApp
          </p>
          <p className="text-2xl md:text-3xl font-bold text-sf-cyan break-words">
            ${totalSales.toLocaleString()}
          </p>
          <p className="text-xs text-gray-500 mt-2">Todas las órdenes</p>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-md p-4 md:p-6">
        <h3 className="text-lg font-bold text-sf-text mb-4">Últimas Órdenes</h3>
        <div className="space-y-3 max-h-96 overflow-y-auto">
          {orders.length === 0 ? (
            <p className="text-gray-500 text-center py-8">Sin órdenes aún</p>
          ) : (
            orders.slice(0, 10).map((order) => (
              <div
                key={order.id}
                className="flex justify-between items-center gap-3 p-3 bg-sf-light rounded-lg border border-gray-200"
              >
                <div className="min-w-0">
                  <p className="font-semibold text-sf-text truncate">
                    {order.customerName}
                  </p>
                  <p className="text-xs text-gray-500">
                    {order.phoneNumber} • {order.items.length} productos
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="font-bold text-sf-text">
                    ${order.totalPrice.toLocaleString()}
                  </p>
                  <span
                    className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${
                      order.status === "confirmed"
                        ? "bg-green-100 text-green-800"
                        : order.status === "delivered"
                        ? "bg-blue-100 text-blue-800"
                        : "bg-yellow-100 text-yellow-800"
                    }`}
                  >
                    {order.status}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );

  const renderOrders = () => (
    <div className="flex-1 min-w-0 flex flex-col bg-white min-h-0">
      <div className="flex-1 min-h-0 overflow-y-auto p-4 md:p-6">
        {orders.length === 0 ? (
          <div className="text-center text-slate-400 py-12">
            <p>No hay órdenes de WhatsApp</p>
          </div>
        ) : (
          <div className="space-y-4">
            {orders.map((order) => (
              <div
                key={order.id}
                className="border border-slate-200 rounded-lg p-4 bg-white hover:shadow-lg transition-all"
              >
                <div className="flex justify-between items-start gap-2 mb-4">
                  <div className="min-w-0">
                    <p className="font-bold text-slate-900 truncate">
                      {order.customerName}
                    </p>
                    <p className="text-sm text-slate-600">
                      {order.phoneNumber}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 px-3 py-1 rounded-full text-xs font-semibold ${
                      order.status === "pending"
                        ? "bg-yellow-100 text-yellow-800"
                        : order.status === "confirmed"
                        ? "bg-green-100 text-green-800"
                        : "bg-blue-100 text-blue-800"
                    }`}
                  >
                    {order.status === "pending"
                      ? "Pendiente"
                      : order.status === "confirmed"
                      ? "Confirmada"
                      : "Entregada"}
                  </span>
                </div>

                <div className="mb-4">
                  <p className="text-xs font-semibold text-slate-600 mb-2">
                    Productos:
                  </p>
                  <div className="space-y-1">
                    {order.items.map((item, idx) => (
                      <p
                        key={idx}
                        className="text-sm text-slate-600 flex justify-between gap-2"
                      >
                        <span className="min-w-0 break-words">
                          • {item.productName}
                        </span>
                        <span className="font-semibold shrink-0">
                          ×{item.quantity}
                        </span>
                      </p>
                    ))}
                  </div>
                </div>

                <div className="mb-4 p-3 bg-slate-50 rounded-lg border border-slate-200">
                  <p className="text-xs font-semibold text-slate-600 mb-1">
                    📍 Dirección de entrega:
                  </p>
                  <p className="text-sm text-slate-800 break-words">
                    {order.deliveryAddress}
                  </p>
                </div>

                <div className="flex justify-between items-center mb-4 pb-4 border-b border-slate-200">
                  <p className="font-bold text-lg text-slate-900">
                    ${order.totalPrice.toLocaleString()}
                  </p>
                  <p className="text-xs text-slate-500">
                    {new Date(order.createdAt).toLocaleDateString()}
                  </p>
                </div>

                {order.status === "pending" && (
                  <button
                    type="button"
                    onClick={() => handleConfirmOrder(order.id)}
                    className="btn-success w-full"
                  >
                    ✓ Confirmar Orden
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="flex flex-col h-[calc(100dvh-8rem)] md:h-[calc(100vh-4rem)] min-h-[24rem] bg-gradient-to-br from-sf-light to-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 md:px-6 py-3 md:py-4 shrink-0">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 shrink-0 bg-gradient-to-br from-emerald-500 to-green-600 rounded-full flex items-center justify-center text-white text-xl shadow-xs">
              🤖
            </div>
            <div>
              <h1 className="text-xl md:text-2xl font-bold text-sf-text truncate flex items-center gap-2">
                <span>Bandeja WhatsApp y Bot Sarin</span>
                <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 hidden sm:inline-block">
                  DeepSeek IA
                </span>
              </h1>
              <p className="text-xs text-slate-500 hidden sm:block">
                Atención automática 24/7 y pedidos en vivo desde WhatsApp para tu tienda
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setActiveTab("simulator")}
              className="btn-secondary text-xs px-3 py-1.5 flex items-center gap-1.5 border-emerald-300 text-emerald-800 bg-emerald-50 hover:bg-emerald-100"
            >
              <span>🤖</span>
              <span>Probar Simulador</span>
            </button>
          </div>
        </div>
      </div>

      {/* Tabs principales */}
      <div className="flex overflow-x-auto border-b border-gray-200 bg-white px-3 md:px-6 shrink-0">
        <button
          type="button"
          onClick={() => {
            setActiveTab("conversations");
            setSelectedConversation(null);
          }}
          className={tabClass("conversations")}
        >
          Conversaciones ({conversations.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("simulator")}
          className={tabClass("simulator")}
        >
          🤖 Simulador Sarin IA
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("orders")}
          className={tabClass("orders")}
        >
          Órdenes ({pendingOrders.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("statistics")}
          className={tabClass("statistics")}
        >
          Estadísticas
        </button>
      </div>

      {/* Contenido principal */}
      <div className="flex-1 min-h-0 flex overflow-hidden">
        {activeTab === "conversations" ? (
          <>
            {showConversationList && renderConversationList()}
            {showConversationPane && renderConversationPane()}
          </>
        ) : activeTab === "simulator" ? (
          renderSimulatorPane()
        ) : activeTab === "statistics" ? (
          <div className="flex-1 min-w-0 overflow-y-auto">
            {renderStatistics()}
          </div>
        ) : (
          renderOrders()
        )}
      </div>
    </div>
  );
}
