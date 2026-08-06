/**
 * Las decisiones del modo cocinado que no son pintar: por qué paso se empieza
 * al entrar y qué se puede ofrecer al terminar.
 *
 * Vive aparte del componente —y con su comprobación, `npm run check:cocina`—
 * porque las dos son reglas que el compilador no defiende: la primera trabaja
 * con un texto de `localStorage`, que es `string | null` diga lo que diga por
 * dentro, y la segunda decide qué botón sale por pantalla, y un botón de más
 * tiene exactamente el mismo tipo que un botón de menos.
 *
 * Puro a propósito: ni React, ni `localStorage`, ni `Date.now()`. La hora entra
 * por parámetro para que la comprobación pueda fijarla.
 */

/**
 * Dónde se guarda por dónde ibas. Por receta y no por entrada del menú: quien
 * cocina el mismo plato dos veces la misma tarde (dos raciones, dos tandas)
 * está en la misma receta, y quien cocina fuera de plan no tiene entrada
 * ninguna.
 */
export function progressStorageKey(recipeId: string): string {
  return `cocinar:${recipeId}`;
}

/**
 * Cuánto vale un progreso guardado. Seis horas es «la misma sesión de cocina»
 * con holgura para un asado largo o para dejar la masa reposando.
 *
 * Hace falta un tope porque el progreso sobrevive al cierre de la app, y sin él
 * volver a cocinar el mismo plato la semana que viene te dejaba en el paso 5 sin
 * más explicación. Y hace falta que sea generoso porque quedarse corto tiene el
 * coste contrario y peor: perder el sitio justo cuando la app se cerró sola con
 * las manos llenas, que es exactamente el caso para el que existe todo esto.
 */
export const PROGRESS_TTL_MS = 6 * 60 * 60 * 1000;

/** Progreso serializado en `localStorage`. */
type StoredProgress = { step: number; at: number };

/**
 * Acota un índice de paso a los pasos que existen. La receta se puede EDITAR
 * entre dos sesiones —o desde el otro móvil mientras cocinas—, así que un
 * índice guardado no es una promesa de nada.
 */
export function clampStep(step: number, totalSteps: number): number {
  if (!Number.isFinite(step) || totalSteps <= 0) return 0;
  return Math.min(Math.max(Math.trunc(step), 0), totalSteps - 1);
}

/**
 * Serializa el progreso; el par de `readProgress`.
 *
 * `sessionStartedAt` es cuándo empezó ESTA sesión de cocina —el instante con el
 * que la pantalla lee—, no el momento de pasar de paso. Los dos son `number`, o
 * sea que confundirlos no rompe ninguna compilación, y confundirlos rompe la
 * pantalla entera: sellando con el reloj de cada avance, el sello queda por
 * delante del instante con el que se lee, `readProgress` lo toma por un reloj
 * movido hacia atrás y devuelve 0. Traducido: el paso volvía al primero en
 * cuanto avanzabas.
 */
export function writeProgress(step: number, sessionStartedAt: number): string {
  return JSON.stringify({ step, at: sessionStartedAt } satisfies StoredProgress);
}

/**
 * Por qué paso se entra, leído de lo guardado. Devuelve 0 —empezar de cero— ante
 * cualquier duda: sin nada guardado, con un texto que no es el que escribimos,
 * o pasado el plazo.
 *
 * Defensivo a mano y no con zod porque esto corre al montar la pantalla, antes
 * del primer paso, y porque lo que hay al otro lado es `localStorage`: lo puede
 * haber escrito una versión anterior de la app, otra pestaña, o nadie.
 */
export function readProgress(
  raw: string | null,
  totalSteps: number,
  now: number,
): number {
  if (!raw) return 0;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return 0;
  }
  if (typeof parsed !== "object" || parsed === null) return 0;
  const { step, at } = parsed as Partial<StoredProgress>;
  if (typeof step !== "number" || typeof at !== "number") return 0;
  // Un `at` en el futuro es un reloj que se ha movido, no un progreso fresco:
  // sin este lado de la comprobación, adelantar la hora del móvil dejaba un
  // progreso guardado que no caducaba nunca.
  if (at > now || now - at > PROGRESS_TTL_MS) return 0;
  return clampStep(step, totalSteps);
}

/** La entrada del menú desde la que se entró a cocinar, si se entró desde una. */
export type CookingEntry = {
  id: string;
  /** Día para el que estaba planificado el plato (ISO local). */
  date: string;
  /** Ya marcada como cocinada antes de entrar aquí. */
  cookedAt: string | null;
};

/**
 * Qué puede ofrecer la pantalla de cierre sobre la marca de «cocinado»:
 *
 *  - `mark`   — hay entrada, es de hoy o de antes y está sin contestar: el botón.
 *  - `already`— ya estaba marcada: no se vuelve a preguntar, se sigue al descuento.
 *  - `future` — el día aún no ha llegado (cocinar el viernes un miércoles).
 *  - `none`   — se cocina fuera de plan, no hay entrada que marcar.
 */
export type FinishOffer = "mark" | "already" | "future" | "none";

/**
 * Qué ofrecer al terminar. El caso que justifica la función entera es `future`:
 * `toggleEntryCookedAction` RECHAZA marcar un día que no ha llegado, y esa regla
 * está aquí duplicada a propósito para que la pantalla no ofrezca un botón cuyo
 * único desenlace posible es un aviso de error — y encima en el momento de
 * celebrar que el plato está hecho.
 *
 * Es el patrón que más veces ha fallado en esta app: una regla razonada en un
 * sitio y ausente en el de al lado. Aquí la copia es deliberada y la
 * comprobación la fija; si algún día el servidor deja de vetar el futuro, este
 * caso se cae con él.
 *
 * Ojo: esto decide SOLO la marca de cocinado. El descuento de la despensa no
 * depende de la entrada del menú —los ingredientes se gastan igual cocinando
 * fuera de plan—, así que se ofrece siempre y no se pregunta aquí.
 */
export function finishOffer(
  entry: CookingEntry | null,
  today: string,
): FinishOffer {
  if (!entry) return "none";
  if (entry.cookedAt) return "already";
  if (entry.date > today) return "future";
  return "mark";
}

/**
 * «Primera vez que lo cocináis», «Es la 3.ª vez»… o nada.
 *
 * Nada por debajo de uno: un plato que no se ha cocinado nunca no tiene una
 * cuenta que enseñar, y un «0 veces» en la pantalla que celebra que acabas de
 * cocinarlo se lee como un fallo. El número es el de la app, no un marcador
 * inventado: sale de las veces que el hogar marcó ese plato como cocinado, que
 * es lo mismo de lo que se alimenta el generador de menús para no repetirlo.
 */
export function timesCookedLabel(times: number): string | null {
  if (!Number.isFinite(times) || times < 1) return null;
  if (times === 1) return "Primera vez que lo cocináis";
  return `Es la ${times}.ª vez que lo cocináis`;
}
