import { useEffect, useRef, useState } from "react";
import type {
  WhatsAppConversation,
  WhatsAppMessage,
  WhatsAppOrder,
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
} from "../services/whatsappService";
import { getProducts } from "../services/saleService";
import { useIsMobile } from "../hooks/useMediaQuery";
import { Icon } from "./ui/Icon";

type TabType = "conversations" | "orders" | "statistics";

const POLL_INTERVAL_MS = 5000;

export default function WhatsAppChat() {
  const isMobile = useIsMobile();
  const [conversations, setConversations] = useState<WhatsAppConversation[]>(
    [],
  );
  const [selectedConversation, setSelectedConversation] =
    useState<WhatsAppConversation | null>(null);
  const [messages, setMessages] = useState<WhatsAppMessage[]>([]);
  const [orders, setOrders] = useState<WhatsAppOrder[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [activeTab, setActiveTab] = useState<TabType>("conversations");
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [sendError, setSendError] = useState<string | null>(null);

  // Referencia a la conversación seleccionada para que el polling lea el valor actual
  const selectedConversationRef = useRef<WhatsAppConversation | null>(null);

  // Cargar conversaciones
  useEffect(() => {
    loadConversations();
    loadOrders();

    // Polling cada 5 segundos para simular tiempo real,
    // solo mientras la pestaña está visible.
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
      // Enviar mensaje
      await sendMessage(selectedConversation.id, newMessage);

      // Procesar el mensaje para detectar órdenes
      const processedData = processMessageForOrder(newMessage);

      // Si el mensaje contiene una orden potencial, crear un borrador
      if (processedData.hasOrder && processedData.products) {
        // Buscar precios reales de productos
        const allProducts = await getProducts();
        const findProduct = (name: string) =>
          allProducts.find(
            (p) => p.name.toLowerCase().includes(name.toLowerCase()) ||
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

  const quickResponses = [
    "¿Cuál es tu dirección de envío?",
    "Perfecto, confirmo tu orden. Te llegará hoy.",
    "Lamentablemente ese producto no está disponible.",
    "¿En qué hora prefieres que te entregue?",
    "Gracias por tu compra, que disfrutes 🎉",
  ];

  const filteredConversations = conversations.filter(
    (conv) =>
      conv.customerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      conv.phoneNumber.includes(searchTerm),
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

  const renderStatistics = () => (
    <div className="p-4 md:p-6 bg-gradient-to-br from-sf-light to-gray-50">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6 mb-6 md:mb-8">
        {/* Total de conversaciones */}
        <div className="bg-white rounded-lg shadow-md p-4 md:p-6 border-l-4 border-sf-primary">
          <p className="text-gray-600 text-sm font-semibold mb-2">
            Total Conversaciones
          </p>
          <p className="text-3xl md:text-4xl font-bold text-sf-primary">
            {conversations.length}
          </p>
          <p className="text-xs text-gray-500 mt-2">Clientes únicos</p>
        </div>

        {/* Órdenes pendientes */}
        <div className="bg-white rounded-lg shadow-md p-4 md:p-6 border-l-4 border-yellow-500">
          <p className="text-gray-600 text-sm font-semibold mb-2">
            Órdenes Pendientes
          </p>
          <p className="text-3xl md:text-4xl font-bold text-yellow-600">
            {pendingOrders.length}
          </p>
          <p className="text-xs text-gray-500 mt-2">Por confirmar</p>
        </div>

        {/* Órdenes confirmadas */}
        <div className="bg-white rounded-lg shadow-md p-4 md:p-6 border-l-4 border-green-500">
          <p className="text-gray-600 text-sm font-semibold mb-2">
            Órdenes Confirmadas
          </p>
          <p className="text-3xl md:text-4xl font-bold text-green-600">
            {confirmedOrders.length}
          </p>
          <p className="text-xs text-gray-500 mt-2">En procesamiento</p>
        </div>

        {/* Total de ventas */}
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

      {/* Últimas órdenes */}
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
                    {order.items.length} productos
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="font-bold text-sf-text">${order.totalPrice}</p>
                  <span
                    className={`text-xs font-semibold px-2 py-1 rounded ${
                      order.status === "pending"
                        ? "bg-yellow-100 text-yellow-800"
                        : "bg-green-100 text-green-800"
                    }`}
                  >
                    {order.status === "pending" ? "Pendiente" : "Confirmada"}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );

  const renderConversationList = () => (
    <div
      className={`${
        isMobile ? "w-full" : "w-72 lg:w-80 shrink-0 border-r"
      } border-slate-200 bg-white flex flex-col min-h-0`}
    >
      <div className="p-3 md:p-4 border-b border-slate-200">
        <label htmlFor="whatsapp-search" className="sr-only">
          Buscar cliente
        </label>
        <input
          id="whatsapp-search"
          type="search"
          placeholder="Buscar cliente..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="input text-sm"
        />
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto">
        {filteredConversations.length === 0 ? (
          <div className="text-center text-slate-500 py-12">
            <p className="text-sm">
              {searchTerm
                ? "No coinciden resultados"
                : "No hay conversaciones aún"}
            </p>
          </div>
        ) : (
          <ul className="space-y-1 p-2" aria-label="Conversaciones">
            {filteredConversations.map((conv) => (
              <li key={conv.id}>
                <button
                  type="button"
                  onClick={() => setSelectedConversation(conv)}
                  className={`w-full min-h-[44px] text-left p-3 rounded-lg transition-all text-sm flex items-center justify-between gap-2 ${
                    selectedConversation?.id === conv.id
                      ? "bg-blue-50 border-l-4 border-blue-500 text-slate-900"
                      : "hover:bg-slate-50 text-slate-800"
                  }`}
                >
                  <span className="min-w-0">
                    <span className="block font-semibold truncate">
                      {conv.customerName}
                    </span>
                    <span className="block text-xs text-slate-500">
                      {conv.phoneNumber}
                    </span>
                    <span className="block text-xs text-slate-400 mt-1">
                      {new Date(conv.lastMessageDate).toLocaleTimeString()}
                    </span>
                  </span>
                  {isMobile && (
                    <Icon
                      name="chevron-right"
                      size={18}
                      className="shrink-0 text-slate-400"
                    />
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Sección de Configuración */}
      <div className="border-t border-slate-200 p-3 md:p-4 bg-blue-50">
        <p className="text-xs font-semibold text-blue-900 mb-3 flex items-center gap-2">
          <span>⚙️</span> Configuración Requerida
        </p>
        <ul className="space-y-2 text-xs text-blue-900">
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
          <div className="bg-gradient-to-r from-blue-50 to-slate-50 border-b border-slate-200 px-3 md:px-6 py-2 md:py-4 flex justify-between items-center gap-2">
            <div className="flex items-center gap-1 min-w-0">
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
                <p className="font-bold text-base md:text-lg text-slate-900 truncate">
                  {selectedConversation.customerName}
                </p>
                <p className="text-sm text-slate-600">
                  {selectedConversation.phoneNumber}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleArchiveConversation}
              className="min-h-[44px] shrink-0 px-4 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 text-sm font-semibold transition-all"
            >
              Archivar
            </button>
          </div>

          {/* Mensajes */}
          <div className="flex-1 min-h-0 overflow-y-auto p-4 md:p-6 space-y-4 bg-gradient-to-b from-slate-50 to-white">
            {messages.length === 0 ? (
              <div className="text-center text-slate-400 py-12">
                <p>Sin mensajes aún</p>
              </div>
            ) : (
              messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex ${msg.sender === "admin" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[85%] md:max-w-md px-4 py-3 rounded-lg shadow-sm ${
                      msg.sender === "admin"
                        ? "bg-blue-500 text-white rounded-br-none"
                        : "bg-slate-100 text-slate-900 rounded-bl-none border border-slate-200"
                    }`}
                  >
                    <p className="text-sm break-words">{msg.message}</p>
                    <p className="text-xs mt-2 opacity-70">
                      {new Date(msg.timestamp).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Respuestas rápidas */}
          <div className="border-t border-slate-200 bg-slate-50 p-3 md:p-4">
            <p className="text-xs font-semibold text-slate-700 mb-2">
              Respuestas rápidas:
            </p>
            <div className="flex gap-2 overflow-x-auto pb-1 md:grid md:grid-cols-1 md:overflow-visible md:pb-0">
              {quickResponses.map((response, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setNewMessage(response)}
                  className="min-h-[44px] shrink-0 whitespace-nowrap md:whitespace-normal md:shrink text-left text-xs px-3 py-2 bg-white hover:bg-blue-50 rounded border border-slate-300 transition-all text-slate-700 hover:text-blue-600"
                >
                  {response}
                </button>
              ))}
            </div>
          </div>

          {/* Input de mensaje */}
          <div className="border-t border-slate-200 p-3 md:p-4 bg-white">
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
                          : "bg-slate-100 text-slate-800"
                    }`}
                  >
                    {order.status === "pending"
                      ? "Pendiente"
                      : order.status === "confirmed"
                        ? "Confirmada"
                        : order.status}
                  </span>
                </div>

                <div className="mb-4 space-y-2">
                  <p className="font-semibold text-sm text-slate-800">
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
            <div className="w-10 h-10 shrink-0 bg-gradient-to-br from-green-400 to-green-600 rounded-full flex items-center justify-center text-white text-xl">
              💬
            </div>
            <h1 className="text-xl md:text-2xl font-bold text-sf-text truncate">
              Gestor de WhatsApp
            </h1>
          </div>
          <div className="text-sm text-gray-600 shrink-0 hidden sm:block">
            {conversations.length > 0 &&
              `${conversations.length} conversaciones activas`}
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
