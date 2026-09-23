/**
 * Los tiempos que menciona un paso de la receta, para poder ponerlos en marcha
 * de un toque en vez de ir a buscar el reloj del móvil con las manos sucias.
 *
 * PURO y sin I/O, como `cooking-flow.ts`, y con la misma razón para estar
 * separado del componente: lo que hace es adivinar, y adivinar sobre texto libre
 * escrito por una persona (o por un modelo) se rompe de maneras que ningún tipo
 * enseña. `«20 minutos»` y `«200 g»` son los dos un número seguido de letras.
 *
 * La regla de fondo: **más vale no ofrecer un temporizador que ofrecer uno
 * equivocado.** Un tiempo que no se detecta se pone a mano y no pasa nada; un
 * chip de «180 min» sacado de «180 grados» arruina la cena. Por eso solo se
 * aceptan unidades de tiempo escritas explícitamente y números en cifras: los
 * números en palabras («remueve diez segundos») se quedan fuera a propósito,
 * porque distinguirlos de «diez dientes de ajo» pide entender la frase.
 */

/** Un tiempo detectado en el texto de un paso. */
export type StepTimer = {
  /** Clave estable para React (posición en el texto + duración). */
  key: string;
  seconds: number;
  /** Rótulo del chip: «45 s», «35 min», «1 h 30 min». */
  label: string;
};

/**
 * Por debajo de esto no se ofrece: un temporizador de cinco segundos cuesta más
 * de arrancar que de contar, y suele venir de un número que no era un tiempo.
 */
export const MIN_TIMER_SECONDS = 10;

/**
 * Y por encima tampoco. No es una opinión sobre la cocina —hay guisos de cinco
 * horas— sino sobre lo que esta pantalla puede prometer: la cuenta atrás vive en
 * una pestaña del navegador, y una que dice «12 h» está prometiendo un
 * despertador que no va a sonar. Los reposos de toda una noche son del reloj del
 * móvil, no de aquí.
 */
export const MAX_TIMER_SECONDS = 6 * 60 * 60;

/** Tope de chips por paso: más que esto es ruido debajo del texto. */
export const MAX_TIMERS_PER_STEP = 3;

const NUM = String.raw`\d{1,4}(?:[.,]\d{1,2})?`;
/**
 * Separadores de un intervalo: «10-12 minutos», «10 a 12 minutos», «entre 10 y
 * 12 minutos», «3 o 4 minutos» (y «5 ó 6», «8 u 10»). Los de palabra exigen
 * espacios a los lados para no comerse otras cosas. Sin la «o», «3 o 4
 * minutos» se leía como un «4 minutos» suelto: el extremo ALTO, justo lo que la
 * regla del intervalo quiere evitar.
 */
const RANGE = String.raw`(?:\s*[-–—]\s*|\s+a\s+|\s+y\s+|\s+[oóu]\s+)`;
/**
 * Unidades aceptadas. Ojo con las que NO están: `m` y `s` a secas se quedan
 * fuera porque en una receta son metros y son segundos con la misma
 * probabilidad, y el coste de equivocarse no es simétrico. `h` sí entra: «1 h»
 * es inequívoco y se escribe mucho.
 */
const UNIT = String.raw`(horas?|h|minutos?|mins?|segundos?|segs?)`;
const DURATION = new RegExp(
  `(${NUM})(?:${RANGE}(${NUM}))?\\s*${UNIT}(?![a-záéíóúüñ])`,
  "gi",
);

type Unit = "h" | "min" | "s";

function unitOf(raw: string): Unit {
  const u = raw.toLowerCase();
  if (u === "h" || u.startsWith("hora")) return "h";
  if (u.startsWith("min")) return "min";
  return "s";
}

const FACTOR: Record<Unit, number> = { h: 3600, min: 60, s: 1 };

function toNumber(raw: string): number {
  return Number(raw.replace(",", "."));
}

/**
 * «45 s» · «35 min» · «1 min 30 s» · «1 h» · «1 h 30 min».
 *
 * Por debajo de la hora se dicen los segundos que sobran: redondeando a
 * minutos, «90 segundos» salía como un chip de «2 min» que luego contaba 1:30.
 */
export function timerLabel(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)} s`;
  if (seconds < 3600) {
    const whole = Math.round(seconds);
    const min = Math.floor(whole / 60);
    const sec = whole % 60;
    return sec === 0 ? `${min} min` : `${min} min ${sec} s`;
  }
  const totalMin = Math.round(seconds / 60);
  if (totalMin < 60) return `${totalMin} min`;
  const h = Math.floor(totalMin / 60);
  const rest = totalMin % 60;
  return rest === 0 ? `${h} h` : `${h} h ${rest} min`;
}

/**
 * Lo que se lee en la cuenta atrás: `mm:ss`, o `h:mm:ss` a partir de la hora.
 * Redondea hacia ARRIBA, que es como cuenta un reloj de cocina: mientras quede
 * un resto de segundo se sigue viendo ese segundo, y la cuenta llega a `00:00`
 * justo cuando suena, no uno antes.
 */
export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const s = total % 60;
  const m = Math.floor(total / 60) % 60;
  const h = Math.floor(total / 3600);
  const dos = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${dos(m)}:${dos(s)}` : `${dos(m)}:${dos(s)}`;
}

type RawMatch = { start: number; end: number; unit: Unit; seconds: number };

/**
 * Los tiempos que menciona un paso, en el orden en que aparecen.
 *
 * Decisiones que se ven en las comprobaciones y no en el código:
 *
 *  - **De un intervalo se toma el extremo BAJO** («10-12 minutos» → 10). Un
 *    temporizador de cocina sirve para ir a mirar, no para dar algo por acabado:
 *    quedarse corto te lleva a la olla dos minutos antes, pasarse la quema.
 *  - **«1 h 30 min» es UN tiempo, no dos.** Escrito así son dos coincidencias
 *    pegadas, y sin unirlas la pantalla ofrecería un chip de «1 h» y otro de
 *    «30 min», que juntos son hora y media pero por separado no son nada.
 *  - **Se deduplica por duración.** Un paso que repite «5 minutos» dos veces no
 *    necesita dos chips idénticos: es el mismo botón pulsado dos veces.
 */
export function findStepTimers(step: string): StepTimer[] {
  const raw: RawMatch[] = [];
  for (const m of step.matchAll(DURATION)) {
    const unit = unitOf(m[3]);
    // Del intervalo, el extremo bajo: el primer número siempre es ese.
    let value = toNumber(m[1]);
    if (!Number.isFinite(value)) continue;
    const start = m.index ?? 0;
    const end = start + m[0].length;
    // «1 hora y media»: la media hora se suma. Es la única forma con palabras
    // que se acepta, porque no es un número suelto sino una coletilla pegada a
    // un tiempo ya detectado. Solo detrás de HORAS: «10 minutos y media hora»
    // sumaba medio minuto y salía un chip de «11 min».
    if (unit === "h" && /^\s*y\s+media(?![a-záéíóúüñ])/i.test(step.slice(end))) {
      value += 0.5;
    }
    raw.push({ start, end, unit, seconds: value * FACTOR[unit] });
  }

  // «1 h 30 min» → un solo tiempo. Solo cuando van pegados (a lo sumo con una
  // «y» en medio): «hornea 1 h y sirve con 30 min de reposo» no es hora y media.
  const merged: RawMatch[] = [];
  for (let i = 0; i < raw.length; i++) {
    const cur = raw[i];
    const next = raw[i + 1];
    if (
      next &&
      cur.unit === "h" &&
      next.unit === "min" &&
      /^\s*(y\s*)?$/.test(step.slice(cur.end, next.start))
    ) {
      merged.push({
        start: cur.start,
        end: next.end,
        unit: "h",
        seconds: cur.seconds + next.seconds,
      });
      i += 1;
      continue;
    }
    merged.push(cur);
  }

  const timers: StepTimer[] = [];
  const seen = new Set<number>();
  for (const t of merged) {
    const seconds = Math.round(t.seconds);
    if (seconds < MIN_TIMER_SECONDS || seconds > MAX_TIMER_SECONDS) continue;
    if (seen.has(seconds)) continue;
    seen.add(seconds);
    timers.push({
      key: `${t.start}-${seconds}`,
      seconds,
      label: timerLabel(seconds),
    });
    if (timers.length === MAX_TIMERS_PER_STEP) break;
  }
  return timers;
}
