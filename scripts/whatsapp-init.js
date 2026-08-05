#!/usr/bin/env node

/**
 * Script de Inicialización - WhatsApp Integration
 * Uso: npm run whatsapp:init
 * 
 * Prepara el proyecto para la integración de WhatsApp
 */

const fs = require('fs');
const path = require('path');

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  red: '\x1b[31m'
};

function log(color, ...args) {
  console.log(color, ...args, colors.reset);
}

function checkPath(filePath, name) {
  if (fs.existsSync(filePath)) {
    log(colors.green, `✅ ${name}`);
    return true;
  } else {
    log(colors.red, `❌ ${name} (NO ENCONTRADO)`);
    return false;
  }
}

async function main() {
  log(colors.blue, '\n═══════════════════════════════════════════════════════');
  log(colors.blue, '  🚀 WhatsApp Integration - Initialization Script');
  log(colors.blue, '═══════════════════════════════════════════════════════\n');

  // Verificar estructura de archivos
  log(colors.yellow, '📂 Verificando estructura de archivos...\n');

  const checks = [
    [path.join(__dirname, '../web/src/components/WhatsAppChat.tsx'), 'Componente WhatsApp'],
    [path.join(__dirname, '../web/src/services/whatsappService.ts'), 'Servicio WhatsApp'],
    [path.join(__dirname, '../web/src/types/whatsapp.ts'), 'Tipos TypeScript'],
    [path.join(__dirname, '../backend/whatsapp-webhook.js'), 'Backend Webhook'],
    [path.join(__dirname, '../docs/WHATSAPP_INTEGRATION.md'), 'Documentación'],
    [path.join(__dirname, '../.env.example'), 'Variables de entorno'],
  ];

  let allOk = true;
  checks.forEach(([filePath, name]) => {
    if (!checkPath(filePath, name)) {
      allOk = false;
    }
  });

  log(colors.blue, '\n═══════════════════════════════════════════════════════\n');

  if (allOk) {
    log(colors.green, '✅ Todos los archivos están en su lugar\n');

    log(colors.yellow, '📋 Próximos pasos:\n');
    
    console.log(`
${colors.blue}1. CONFIGURAR VARIABLES DE ENTORNO:${colors.reset}
   • Copia el archivo ${colors.blue}.env.example${colors.reset} a ${colors.blue}.env${colors.reset}
   • Edita ${colors.blue}.env${colors.reset} con tus credenciales de WhatsApp
   
${colors.blue}2. INSTALAR DEPENDENCIAS DEL BACKEND:${colors.reset}
   npm install express cors firebase-admin dotenv

${colors.blue}3. CONFIGURAR FIREBASE:${colors.reset}
   • Ve a: https://console.firebase.google.com
   • Descarga tu serviceAccountKey.json
   • Cópialo a la raíz del proyecto (o especifica la ruta en .env)
   • Publica las reglas canonicas desde ${colors.blue}firestore.rules${colors.reset} con npm run deploy:rules

${colors.blue}4. OBTENER CREDENCIALES DE WHATSAPP:${colors.reset}
   • Ve a: https://business.facebook.com/
   • Crea una aplicación WhatsApp
   • Obtén: API Token, Phone Number ID, Business Account ID
   • Configúralos en tu archivo ${colors.blue}.env${colors.reset}

${colors.blue}5. INICIAR EL PROYECTO:${colors.reset}
   • Terminal 1: ${colors.green}cd web && npm install && npm run dev${colors.reset}
   • Terminal 2: ${colors.green}node ../backend/whatsapp-webhook.js${colors.reset}
   • Accede a: ${colors.green}http://localhost:5173${colors.reset}

${colors.blue}6. PROBAR LOCALMENTE:${colors.reset}
   • Instala ngrok: ${colors.green}https://ngrok.com${colors.reset}
   • Ejecuta: ${colors.green}ngrok http 3000${colors.reset}
   • Usa la URL de ngrok en WhatsApp Webhook Settings

${colors.blue}7. LEE LA DOCUMENTACIÓN:${colors.reset}
   ${colors.green}docs/WHATSAPP_README.md${colors.reset} - Resumen ejecutivo
   ${colors.green}docs/WHATSAPP_IMPLEMENTATION.md${colors.reset} - Guía paso a paso
   ${colors.green}docs/WHATSAPP_ARCHITECTURE.md${colors.reset} - Arquitectura detallada
   ${colors.green}docs/WHATSAPP_BEST_PRACTICES.md${colors.reset} - Mejores prácticas
    `);

    log(colors.green, '\n═══════════════════════════════════════════════════════');
    log(colors.green, '✨ ¡Estás listo para comenzar! ✨');
    log(colors.green, '═══════════════════════════════════════════════════════\n');

  } else {
    log(colors.red, '\n❌ Faltan archivos. Por favor, verifica la instalación.\n');
    process.exit(1);
  }
}

main().catch(err => {
  log(colors.red, '\n❌ Error:', err.message);
  process.exit(1);
});
