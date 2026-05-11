import { useEffect, useState } from "react";
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

type TabType = "conversations" | "orders" | "statistics";

export default function WhatsAppChat() {
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

  // Cargar conversaciones
  useEffect(() => {
    loadConversations();
    loadOrders();

    // Polling cada 5 segundos para simular tiempo real
    const interval = setInterval(() => {
      loadConversations();
      if (selectedConversation) {
        loadMessages(selectedConversation.id);
      }
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  // Cargar mensajes cuando se selecciona una conversación
  useEffect(() => {
    if (selectedConversation) {
      loadMessages(selectedConversation.id);
    }
  }, [selectedConversation]);

  const loadConversations = async () => {
    try {
      const data = await getConversations();
      setConversations(data);
    } catch (error) {
      console.error("Error loading conversations:", error);
    }
  };

  const loadMessages = async (conversationId: string) => {
    try {
      const data = await getMessages(conversationId);
      setMessages(data);
    } catch (error) {
      console.error("Error loading messages:", error);
    }
  };

  const loadOrders = async () => {
    try {
      const data = await getWhatsAppOrders();
      setOrders(data);
    } catch (error) {
      console.error("Error loading orders:", error);
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
        const totalPrice = processedData.products.reduce(
          (sum, p) => sum + p.quantity * 10, // Precio placeholder
          0,
        );
        console.log(
          "🚀 ~ file: WhatsAppChat.tsx:96 ~ handleSendMessage ~ totalPrice:",
          totalPrice,
        );

        await createWhatsAppOrder({
          conversationId: selectedConversation.id,
          phoneNumber: selectedConversation.phoneNumber,
          customerName: selectedConversation.customerName,
          items: processedData.products.map((p) => ({
            productId: "",
            productName: p.name,
            quantity: p.quantity,
            price: 10, // Placeholder
          })),
          deliveryAddress: processedData.address || "Por confirmar",
          totalPrice,
          status: "pending",
          createdAt: new Date(),
          orderNotes: processedData.rawText,
        });
      }

      setNewMessage("");
      loadMessages(selectedConversation.id);
      loadOrders();
    } catch (error) {
      console.error("Error sending message:", error);
      alert("Error al enviar mensaje");
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
    } catch (error) {
      console.error("Error archiving conversation:", error);
    }
  };

  const handleConfirmOrder = async (orderId: string) => {
    try {
      await updateOrderStatus(orderId, "confirmed");
      loadOrders();
    } catch (error) {
      console.error("Error confirming order:", error);
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

  const renderStatistics = () => (
    <div className="p-6 bg-gradient-to-br from-sf-light to-gray-50">
      <div className="grid grid-cols-2 gap-6 mb-8">
        {/* Total de conversaciones */}
        <div className="bg-white rounded-lg shadow-md p-6 border-l-4 border-sf-primary">
          <p className="text-gray-600 text-sm font-semibold mb-2">
            Total Conversaciones
          </p>
          <p className="text-4xl font-bold text-sf-primary">
            {conversations.length}
          </p>
          <p className="text-xs text-gray-500 mt-2">Clientes únicos</p>
        </div>

        {/* Órdenes pendientes */}
        <div className="bg-white rounded-lg shadow-md p-6 border-l-4 border-yellow-500">
          <p className="text-gray-600 text-sm font-semibold mb-2">
            Órdenes Pendientes
          </p>
          <p className="text-4xl font-bold text-yellow-600">
            {pendingOrders.length}
          </p>
          <p className="text-xs text-gray-500 mt-2">Por confirmar</p>
        </div>

        {/* Órdenes confirmadas */}
        <div className="bg-white rounded-lg shadow-md p-6 border-l-4 border-green-500">
          <p className="text-gray-600 text-sm font-semibold mb-2">
            Órdenes Confirmadas
          </p>
          <p className="text-4xl font-bold text-green-600">
            {confirmedOrders.length}
          </p>
          <p className="text-xs text-gray-500 mt-2">En procesamiento</p>
        </div>

        {/* Total de ventas */}
        <div className="bg-white rounded-lg shadow-md p-6 border-l-4 border-sf-cyan">
          <p className="text-gray-600 text-sm font-semibold mb-2">
            Total Ventas WhatsApp
          </p>
          <p className="text-3xl font-bold text-sf-cyan">
            ${totalSales.toLocaleString()}
          </p>
          <p className="text-xs text-gray-500 mt-2">Todas las órdenes</p>
        </div>
      </div>

      {/* Últimas órdenes */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <h3 className="text-lg font-bold text-sf-text mb-4">Últimas Órdenes</h3>
        <div className="space-y-3 max-h-96 overflow-y-auto">
          {orders.length === 0 ? (
            <p className="text-gray-500 text-center py-8">Sin órdenes aún</p>
          ) : (
            orders.slice(0, 10).map((order) => (
              <div
                key={order.id}
                className="flex justify-between items-center p-3 bg-sf-light rounded-lg border border-gray-200"
              >
                <div>
                  <p className="font-semibold text-sf-text">
                    {order.customerName}
                  </p>
                  <p className="text-xs text-gray-500">
                    {order.items.length} productos
                  </p>
                </div>
                <div className="text-right">
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

  return (
    <div className="h-screen bg-gradient-to-br from-sf-light to-gray-50 flex flex-col">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-green-400 to-green-600 rounded-full flex items-center justify-center text-white text-xl">
              💬
            </div>
            <h1 className="text-2xl font-bold text-sf-text">
              Gestor de WhatsApp
            </h1>
          </div>
          <div className="text-sm text-gray-600">
            {conversations.length > 0 &&
              `${conversations.length} conversaciones activas`}
          </div>
        </div>
      </div>

      {/* Tabs principales */}
      <div className="flex border-b border-gray-200 bg-white px-6">
        <button
          onClick={() => {
            setActiveTab("conversations");
            setSelectedConversation(null);
          }}
          className={`px-6 py-4 font-semibold transition-all border-b-2 ${
            activeTab === "conversations"
              ? "border-sf-primary text-sf-primary"
              : "border-transparent text-gray-600 hover:text-sf-text"
          }`}
        >
          Conversaciones ({conversations.length})
        </button>
        <button
          onClick={() => setActiveTab("orders")}
          className={`px-6 py-4 font-semibold transition-all border-b-2 ${
            activeTab === "orders"
              ? "border-sf-primary text-sf-primary"
              : "border-transparent text-gray-600 hover:text-sf-text"
          }`}
        >
          Órdenes ({pendingOrders.length})
        </button>
        <button
          onClick={() => setActiveTab("statistics")}
          className={`px-6 py-4 font-semibold transition-all border-b-2 ${
            activeTab === "statistics"
              ? "border-sf-primary text-sf-primary"
              : "border-transparent text-gray-600 hover:text-sf-text"
          }`}
        >
          Estadísticas
        </button>
      </div>

      {/* Contenido principal */}
      <div className="flex-1 flex overflow-hidden">
        {/* Panel izquierdo: Conversaciones o Configuración */}
        {activeTab === "conversations" ? (
          <div className="w-80 border-r border-slate-200 bg-white flex flex-col">
            <div className="p-4 border-b border-slate-200">
              <input
                type="text"
                placeholder="Buscar cliente..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              />
            </div>
            <div className="flex-1 overflow-y-auto">
              {filteredConversations.length === 0 ? (
                <div className="text-center text-slate-500 py-12">
                  <p className="text-sm">
                    {searchTerm
                      ? "No coinciden resultados"
                      : "No hay conversaciones aún"}
                  </p>
                </div>
              ) : (
                <div className="space-y-1 p-2">
                  {filteredConversations.map((conv) => (
                    <button
                      key={conv.id}
                      onClick={() => setSelectedConversation(conv)}
                      className={`w-full text-left p-3 rounded-lg transition-all text-sm ${
                        selectedConversation?.id === conv.id
                          ? "bg-blue-50 border-l-4 border-blue-500 text-slate-900"
                          : "hover:bg-slate-50 text-slate-800"
                      }`}
                    >
                      <p className="font-semibold">{conv.customerName}</p>
                      <p className="text-xs text-slate-500">
                        {conv.phoneNumber}
                      </p>
                      <p className="text-xs text-slate-400 mt-1">
                        {new Date(conv.lastMessageDate).toLocaleTimeString()}
                      </p>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Sección de Configuración */}
            <div className="border-t border-slate-200 p-4 bg-blue-50">
              <p className="text-xs font-semibold text-blue-900 mb-3 flex items-center gap-2">
                <span>⚙️</span> Configuración Requerida
              </p>
              <ul className="space-y-2 text-xs text-blue-900">
                <li className="flex items-start gap-2">
                  <span className="text-blue-500 mt-0.5">•</span>
                  <span>Backend con webhooks de Twilio configurado</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-blue-500 mt-0.5">•</span>
                  <span>Número de WhatsApp Business verificado en Twilio</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-blue-500 mt-0.5">•</span>
                  <span>
                    Credenciales de Twilio configuradas en variables de entorno
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
        ) : activeTab === "statistics" ? (
          <div className="flex-1 overflow-y-auto">{renderStatistics()}</div>
        ) : null}

        {/* Panel derecho: Chat o Órdenes */}
        <div className="flex-1 flex flex-col bg-white">
          {activeTab === "conversations" ? (
            <>
              {selectedConversation ? (
                <>
                  {/* Header del chat */}
                  <div className="bg-gradient-to-r from-blue-50 to-slate-50 border-b border-slate-200 px-6 py-4 flex justify-between items-center">
                    <div>
                      <p className="font-bold text-lg text-slate-900">
                        {selectedConversation.customerName}
                      </p>
                      <p className="text-sm text-slate-600">
                        {selectedConversation.phoneNumber}
                      </p>
                    </div>
                    <button
                      onClick={handleArchiveConversation}
                      className="px-4 py-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 text-sm font-semibold transition-all"
                    >
                      Archivar
                    </button>
                  </div>

                  {/* Mensajes */}
                  <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-gradient-to-b from-slate-50 to-white">
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
                            className={`max-w-md px-4 py-3 rounded-lg shadow-sm ${
                              msg.sender === "admin"
                                ? "bg-blue-500 text-white rounded-br-none"
                                : "bg-slate-100 text-slate-900 rounded-bl-none border border-slate-200"
                            }`}
                          >
                            <p className="text-sm">{msg.message}</p>
                            <p className={`text-xs mt-2 opacity-70`}>
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
                  <div className="border-t border-slate-200 bg-slate-50 p-4">
                    <p className="text-xs font-semibold text-slate-700 mb-3">
                      Respuestas rápidas:
                    </p>
                    <div className="grid grid-cols-1 gap-2">
                      {quickResponses.map((response, idx) => (
                        <button
                          key={idx}
                          onClick={() => setNewMessage(response)}
                          className="text-left text-xs p-2 bg-white hover:bg-blue-50 rounded border border-slate-300 transition-all text-slate-700 hover:text-blue-600"
                        >
                          {response}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Input de mensaje */}
                  <div className="border-t border-slate-200 p-4 bg-white">
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={newMessage}
                        onChange={(e) => setNewMessage(e.target.value)}
                        onKeyPress={(e) => {
                          if (e.key === "Enter") handleSendMessage();
                        }}
                        placeholder="Escribe un mensaje..."
                        className="flex-1 px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                        disabled={loading}
                      />
                      <button
                        onClick={handleSendMessage}
                        disabled={loading || !newMessage.trim()}
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all font-semibold text-sm"
                      >
                        {loading ? "Enviando..." : "Enviar"}
                      </button>
                    </div>
                  </div>
                </>
              ) : (
                <div className="flex items-center justify-center h-full text-slate-400">
                  <p>Selecciona una conversación para comenzar</p>
                </div>
              )}
            </>
          ) : activeTab === "orders" ? (
            <div className="flex-1 overflow-y-auto p-6">
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
                      <div className="flex justify-between items-start mb-4">
                        <div>
                          <p className="font-bold text-slate-900">
                            {order.customerName}
                          </p>
                          <p className="text-sm text-slate-600">
                            {order.phoneNumber}
                          </p>
                        </div>
                        <span
                          className={`px-3 py-1 rounded-full text-xs font-semibold ${
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
                              className="text-sm text-slate-600 flex justify-between"
                            >
                              <span>• {item.productName}</span>
                              <span className="font-semibold">
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
                        <p className="text-sm text-slate-800">
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
                          onClick={() => handleConfirmOrder(order.id)}
                          className="w-full px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-all font-semibold text-sm"
                        >
                          ✓ Confirmar Orden
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
