import { generateQRMatrix } from './qrCode';

export interface PosterOptions {
  storeName: string;
  neighborhood?: string;
  city?: string;
  phone?: string;
  address?: string;
  hours?: string;
  targetUrl: string;
  posterType: 'storefront' | 'kiosk';
}

/**
 * Genera un afiche publicitario imprimible de alta resolución (1200×1600 px)
 * con diseño profesional paisa para mostrador, vitrina o atril.
 */
export function generatePosterCanvas(options: PosterOptions): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = 1200;
  canvas.height = 1600;

  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  const {
    storeName = 'SurtiFácil Abastos',
    neighborhood = 'Medellín, Antioquia',
    phone = '',
    address = '',
    hours = 'Lunes a Domingo',
    targetUrl,
    posterType = 'storefront',
  } = options;

  // 1. Fondo general degradado de alto contraste (#0D1B2A a #1565C0)
  const bgGrad = ctx.createLinearGradient(0, 0, 0, 1600);
  bgGrad.addColorStop(0, '#0D1B2A');
  bgGrad.addColorStop(0.35, '#102A45');
  bgGrad.addColorStop(0.75, '#1565C0');
  bgGrad.addColorStop(1, '#0D47A1');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, 1200, 1600);

  // Acentos decorativos de fondo (ondas y círculos difusos sutiles)
  ctx.save();
  ctx.fillStyle = 'rgba(0, 188, 212, 0.08)'; // Cian frescura
  ctx.beginPath();
  ctx.arc(1100, 150, 260, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(100, 1450, 320, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // 2. Cabecera Institucional
  ctx.fillStyle = '#FFFFFF';
  ctx.textAlign = 'center';
  ctx.font = '600 24px system-ui, -apple-system, sans-serif';
  ctx.letterSpacing = '3px';
  ctx.fillText('SURTIFÁCIL • COMERCIO VECINAL DE MEDELLÍN', 600, 95);

  // 3. Nombre del Local de Abastos (Grande y centrado)
  ctx.font = 'bold 54px Poppins, system-ui, sans-serif';
  ctx.fillStyle = '#FFFFFF';
  const displayStoreName = storeName.toUpperCase();
  ctx.fillText(displayStoreName, 600, 170, 1060);

  // Barrio y Ciudad
  ctx.font = '500 28px Poppins, system-ui, sans-serif';
  ctx.fillStyle = '#90CAF9'; // Azul claro
  ctx.fillText(`📍 ${neighborhood}`, 600, 220, 1000);

  // 4. Badge Semántico de Modo (Tienda Online o Kiosco)
  const isKiosk = posterType === 'kiosk';
  const badgeText = isKiosk
    ? '⚡ PUNTO TÁCTIL DE AUTOATENCIÓN EN MOSTRADOR'
    : '🛵 CATÁLOGO VECINAL ONLINE Y DOMICILIOS';
  const badgeSubtext = isKiosk
    ? 'Arma tu pedido en segundos, toma tu turno y agiliza tu compra'
    : 'Haz tu mercado desde el celular sin filas ni demoras';

  // Contenedor píldora para el badge
  ctx.save();
  ctx.fillStyle = isKiosk ? '#F59E0B' : '#059669'; // Ámbar o Esmeralda
  ctx.beginPath();
  ctx.roundRect(150, 260, 900, 60, 30);
  ctx.fill();

  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 24px Poppins, system-ui, sans-serif';
  ctx.fillText(badgeText, 600, 298);
  ctx.restore();

  ctx.font = '400 22px system-ui, sans-serif';
  ctx.fillStyle = '#E2E8F0';
  ctx.fillText(badgeSubtext, 600, 355);

  // 5. Marco Central para el Código QR (Tarjeta blanca con esquinas redondeadas)
  const cardX = 260;
  const cardY = 390;
  const cardW = 680;
  const cardH = 750;

  ctx.save();
  ctx.shadowColor = 'rgba(0, 0, 0, 0.4)';
  ctx.shadowBlur = 30;
  ctx.shadowOffsetY = 15;
  ctx.fillStyle = '#FFFFFF';
  ctx.beginPath();
  ctx.roundRect(cardX, cardY, cardW, cardH, 36);
  ctx.fill();
  ctx.restore();

  // Borde sutil a la tarjeta blanca
  ctx.strokeStyle = '#E2E8F0';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.roundRect(cardX, cardY, cardW, cardH, 36);
  ctx.stroke();

  // Etiqueta superior de la tarjeta QR
  ctx.fillStyle = '#0D1B2A';
  ctx.font = 'bold 26px Poppins, system-ui, sans-serif';
  ctx.fillText('ESCANEA CON LA CÁMARA', 600, cardY + 55);

  // 6. Dibujo del Código QR dentro de la tarjeta
  const matrix = generateQRMatrix(targetUrl);
  const qrSize = 510;
  const qrX = cardX + (cardW - qrSize) / 2;
  const qrY = cardY + 80;

  const moduleCount = matrix.length;
  const cellSize = qrSize / moduleCount;

  ctx.fillStyle = '#0D1B2A';
  for (let r = 0; r < moduleCount; r++) {
    for (let c = 0; c < moduleCount; c++) {
      if (matrix[r][c]) {
        ctx.fillRect(
          Math.floor(qrX + c * cellSize),
          Math.floor(qrY + r * cellSize),
          Math.ceil(cellSize),
          Math.ceil(cellSize)
        );
      }
    }
  }

  // URL de respaldo legible al pie del QR
  ctx.fillStyle = '#1565C0';
  ctx.font = '600 20px monospace';
  ctx.fillText(targetUrl, 600, cardY + qrSize + 115, 620);

  // 7. Tres Pasos Didácticos Ilustrados para el Vecino
  const stepsY = 1180;
  const colW = 320;
  const colGap = 40;
  const startX = 600 - (colW * 3 + colGap * 2) / 2;

  const steps = [
    {
      num: '1',
      icon: '📸',
      title: 'Apunta tu cámara',
      desc: 'Enfoca el código con tu celular (no requiere instalar nada).',
    },
    {
      num: '2',
      icon: '🛒',
      title: 'Elige tu mercado',
      desc: 'Explora pasillos de abastos, ofertas frescas y combos.',
    },
    {
      num: '3',
      icon: isKiosk ? '🎟️' : '🛵',
      title: isKiosk ? 'Toma tu turno' : 'Pide a domicilio',
      desc: isKiosk
        ? 'Recibe tu turno en pantalla y el tendero te atiende.'
        : 'Recibe en tu casa o retira en mostrador sin filas.',
    },
  ];

  steps.forEach((step, idx) => {
    const x = startX + idx * (colW + colGap);

    // Fondo del paso
    ctx.save();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.12)';
    ctx.beginPath();
    ctx.roundRect(x, stepsY, colW, 160, 20);
    ctx.fill();

    // Icono y número
    ctx.font = 'bold 36px system-ui';
    ctx.fillText(step.icon, x + colW / 2, stepsY + 50);

    // Título del paso
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 20px Poppins, system-ui, sans-serif';
    ctx.fillText(`${step.num}. ${step.title}`, x + colW / 2, stepsY + 90);

    // Descripción del paso
    ctx.fillStyle = '#E2E8F0';
    ctx.font = '400 15px system-ui, sans-serif';
    ctx.fillText(step.desc, x + colW / 2, stepsY + 120, colW - 24);
    ctx.restore();
  });

  // 8. Pie de Página con Información de Contacto del Local
  const footerY = 1380;
  ctx.save();
  ctx.fillStyle = 'rgba(13, 27, 42, 0.85)';
  ctx.fillRect(0, footerY, 1200, 220);

  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 22px Poppins, system-ui, sans-serif';
  ctx.fillText(storeName, 600, footerY + 45);

  const contactLine = [
    phone ? `💬 WhatsApp: ${phone}` : '',
    address ? `🏠 ${address}` : '',
    hours ? `⏰ ${hours}` : '',
  ]
    .filter(Boolean)
    .join('  •  ');

  ctx.fillStyle = '#CBD5E1';
  ctx.font = '500 18px system-ui, sans-serif';
  ctx.fillText(contactLine || `Medellín • Valle de Aburrá`, 600, footerY + 85, 1100);

  // Línea divisoria
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(150, footerY + 120);
  ctx.lineTo(1050, footerY + 120);
  ctx.stroke();

  // Crédito de plataforma
  ctx.fillStyle = '#94A3B8';
  ctx.font = '500 16px system-ui, sans-serif';
  ctx.fillText(
    'Apoya la tienda y el comercio de tu barrio • Tecnología SurtiFácil SaaS (surtifacil.pages.dev)',
    600,
    footerY + 160
  );
  ctx.restore();

  return canvas;
}

/**
 * Descarga el afiche generado como imagen PNG en alta definición.
 */
export async function downloadPosterPNG(
  canvas: HTMLCanvasElement,
  filename = 'afiche-qr-surtifacil.png'
): Promise<void> {
  return new Promise((resolve) => {
    let completed = false;

    const triggerDownload = (href: string) => {
      if (completed) return;
      completed = true;
      try {
        const link = document.createElement('a');
        link.download = filename;
        link.href = href;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      } catch (e) {
        console.warn('Error disparando descarga:', e);
      }
      resolve();
    };

    const fallbackDataUrl = () => {
      try {
        const dataUrl = canvas.toDataURL ? canvas.toDataURL('image/png') : '';
        if (dataUrl) {
          triggerDownload(dataUrl);
          return;
        }
      } catch {}
      if (!completed) {
        completed = true;
        resolve();
      }
    };

    try {
      if (typeof canvas.toBlob === 'function') {
        canvas.toBlob((blob) => {
          if (!blob) {
            fallbackDataUrl();
            return;
          }
          try {
            const url = URL.createObjectURL(blob);
            triggerDownload(url);
            setTimeout(() => {
              try {
                URL.revokeObjectURL(url);
              } catch {}
            }, 1000);
          } catch {
            fallbackDataUrl();
          }
        }, 'image/png');

        // En entornos como jsdom donde toBlob está definido pero no ejecuta callbacks
        setTimeout(() => {
          if (!completed) fallbackDataUrl();
        }, 80);
        return;
      }
    } catch {
      // Ignorar y proceder a fallback
    }

    fallbackDataUrl();
  });
}

/**
 * Abre una ventana emergente limpia para imprimir directamente el afiche generado.
 */
export function printPoster(canvas: HTMLCanvasElement): void {
  const dataUrl = canvas.toDataURL('image/png');
  const printWindow = window.open('', '_blank');
  if (!printWindow) return;

  printWindow.document.write(`
    <!DOCTYPE html>
    <html lang="es">
      <head>
        <meta charset="utf-8" />
        <title>Imprimir Afiche QR - SurtiFácil</title>
        <style>
          @page {
            size: A4 portrait;
            margin: 0;
          }
          body {
            margin: 0;
            display: flex;
            align-items: center;
            justify-content: center;
            background: #ffffff;
            height: 100vh;
          }
          img {
            max-width: 100%;
            max-height: 100vh;
            object-fit: contain;
          }
        </style>
      </head>
      <body>
        <img src="${dataUrl}" alt="Afiche QR SurtiFácil" onload="window.print(); window.close();" />
      </body>
    </html>
  `);
  printWindow.document.close();
}
