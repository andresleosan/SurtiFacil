/**
 * Utilidad de alertas sonoras en mostrador para SurtiFácil SaaS.
 * Implementada con la Web Audio API nativa sin requerir archivos de audio externos.
 */

let sharedAudioContext: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextClass) return null;

  if (!sharedAudioContext || sharedAudioContext.state === 'closed') {
    try {
      sharedAudioContext = new AudioContextClass();
    } catch {
      return null;
    }
  }

  if (sharedAudioContext.state === 'suspended') {
    sharedAudioContext.resume().catch(() => {});
  }

  return sharedAudioContext;
}

/**
 * Reproduce un timbre armónico de 2 notas tipo campanilla de tienda (chime)
 * cuando entra un nuevo pedido desde el Modo Kiosco, Web o WhatsApp.
 */
export function playNewOrderChime(): boolean {
  try {
    const ctx = getAudioContext();
    if (!ctx) return false;

    const now = ctx.currentTime;

    // Nota 1: Mi5 (659.25 Hz)
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(659.25, now);

    gain1.gain.setValueAtTime(0, now);
    gain1.gain.linearRampToValueAtTime(0.3, now + 0.03);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.5);

    osc1.connect(gain1);
    gain1.connect(ctx.destination);

    osc1.start(now);
    osc1.stop(now + 0.5);

    // Nota 2: La5 (880.00 Hz) a los 180ms
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(880.0, now + 0.18);

    gain2.gain.setValueAtTime(0, now + 0.18);
    gain2.gain.linearRampToValueAtTime(0.35, now + 0.21);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.85);

    osc2.connect(gain2);
    gain2.connect(ctx.destination);

    osc2.start(now + 0.18);
    osc2.stop(now + 0.85);

    return true;
  } catch (error) {
    // Si el navegador bloquea el audio antes del primer clic o en tests, silenciar limpiamente
    return false;
  }
}

