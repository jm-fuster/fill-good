/**
 * El pitido del temporizador de cocina, sintetizado con la Web Audio API.
 *
 * Sin fichero de sonido a propósito: son tres tonos: no merecen un `.mp3` en el
 * bundle ni una petición de red, y sintetizarlos evita además el formato que
 * cada navegador decide no soportar. Tampoco hay dependencia nueva.
 *
 * **Por qué hay sonido y no solo vibración.** Un temporizador que solo vibra es
 * medio temporizador: el móvil está bocabajo en la encimera, con ruido de
 * campana extractora, y quien cocina está de espaldas. La vibración sigue ahí
 * (`vibrateAlarm`) porque en un bolsillo es lo único que llega.
 *
 * **La trampa del autoplay.** Un `AudioContext` creado sin gesto del usuario
 * nace `suspended` y no suena. Por eso `primeChime()` se llama al ARRANCAR el
 * temporizador —que sí es un toque— y deja el contexto despierto para cuando
 * toque sonar, minutos después y sin nadie tocando nada.
 */

type AudioContextCtor = new () => AudioContext;

/** Un único contexto para toda la sesión: crear uno por pitido los agota. */
let ctx: AudioContext | null = null;

function audioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: AudioContextCtor })
      .webkitAudioContext;
  if (!Ctor) return null;
  if (!ctx) {
    try {
      ctx = new Ctor();
    } catch {
      return null;
    }
  }
  return ctx;
}

/**
 * Despierta el audio aprovechando un gesto del usuario. Llámalo al arrancar el
 * temporizador: sin esto, el pitido de dentro de 35 minutos se encuentra el
 * contexto suspendido y no suena.
 */
export function primeChime() {
  audioContext()?.resume().catch(() => {});
}

/** Tres pitidos cortos. Falla en silencio donde no haya Web Audio. */
export function playChime() {
  const c = audioContext();
  if (!c) return;
  // Puede haberse suspendido en segundo plano; reanudar no cuesta nada.
  c.resume().catch(() => {});
  try {
    const start = c.currentTime;
    for (let i = 0; i < 3; i++) {
      const at = start + i * 0.28;
      const osc = c.createOscillator();
      const gain = c.createGain();
      osc.type = "sine";
      osc.frequency.value = 880;
      /*
        Envolvente en rampa y no un encendido/apagado seco: un cuadrado
        instantáneo produce un chasquido audible al principio y al final del
        tono (el famoso «click» de Web Audio). El volumen se queda en 0,18: esto
        avisa desde la cocina, no despierta a nadie.
      */
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(0.18, at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.18);
      osc.connect(gain).connect(c.destination);
      osc.start(at);
      osc.stop(at + 0.2);
    }
  } catch {
    // Contexto cerrado por el navegador o sin salida de audio: sin pitido.
  }
}
