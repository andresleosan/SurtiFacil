// Punto de entrada del backend Express como funcion serverless de Vercel.
// Todas las rutas /api/* se reescriben aqui (ver vercel.json); la app conserva
// sus rutas originales porque Vercel entrega la URL completa de la peticion.
module.exports = require('../backend/whatsapp-webhook.js');
