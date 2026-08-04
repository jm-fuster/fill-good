/**
 * Por qué no se hizo un plato planificado (R2). Vocabulario cerrado de cuatro
 * motivos, compartido por las tres pantallas que preguntan —la tira de hoy, el
 * repaso de días pasados y el panel del plato— y por el generador, que es el
 * único que hace algo distinto según la respuesta.
 *
 * Contestar es OPCIONAL: `null` significa «no lo dijo», no «ninguno de estos».
 * Por eso no hay un motivo «otros» y no hay texto libre; el gesto que importa es
 * resolver el plato, y el motivo es un toque de propina que se puede ignorar.
 *
 * El módulo es puro a propósito (sin React ni Supabase): el rótulo lo necesita
 * la UI y la regla la necesita el contexto del prompt, que se comprueba con
 * `npm run check:menu` sin base ni credenciales.
 */

/**
 * Los cuatro motivos, en el orden en que se ofrecen. Empieza por los dos que
 * hablan del día porque son los que más veces rompen una semana planificada.
 */
export const SKIP_REASONS = [
  "ate_out",
  "takeaway",
  "not_appealing",
  "missing_ingredients",
] as const;

export type SkipReason = (typeof SKIP_REASONS)[number];

/** Rótulo de cada motivo, tal cual se lee en el chip. */
export const SKIP_REASON_LABEL: Record<SkipReason, string> = {
  ate_out: "Comimos fuera",
  takeaway: "Pedimos algo",
  not_appealing: "No nos apetecía",
  missing_ingredients: "Faltaban ingredientes",
};

/**
 * Valida lo que llega de fuera (el cliente, o una fila vieja de la base, donde
 * la columna es `text`). La lista de la base y esta tienen que decir lo mismo:
 * si divergen, el check de la migración rechaza la escritura.
 */
export function isSkipReason(value: unknown): value is SkipReason {
  return (
    typeof value === "string" &&
    (SKIP_REASONS as readonly string[]).includes(value)
  );
}

/** Rótulo de un motivo guardado, o null si no hay motivo (o no se reconoce). */
export function skipReasonLabel(reason: string | null): string | null {
  return isSkipReason(reason) ? SKIP_REASON_LABEL[reason] : null;
}

/**
 * ¿El descarte fue un rechazo DEL PLATO (y no un imprevisto DEL DÍA)?
 *
 * Es la única consecuencia que tiene hoy el motivo, y decide una cosa concreta
 * en `collectRecentDishes`: si el plato sigue contando como «reciente» —o sea,
 * si el generador tiene prohibido volver a proponerlo la semana siguiente—.
 *
 *  · Rechazo (`not_appealing`): el plato tuvo su oportunidad y no gustó.
 *    Recuperarlo dentro de siete días es ofrecer otra vez lo mismo.
 *  · Imprevisto (comimos fuera, pedimos algo, faltaban ingredientes): el plato
 *    no llegó a la mesa por algo ajeno a él, así que se puede recuperar.
 *
 * Sin motivo (`null`) NO es rechazo, y esa es la decisión que conserva el
 * comportamiento anterior a que existiera esta columna: un descarte a secas se
 * recupera, que es lo que la app venía haciendo con TODOS los descartes. Un
 * silencio es más veces «cambió el día» que «no nos gusta», y equivocarse hacia
 * el rechazo es peor: esconde un plato del recetario sin que nadie lo haya dicho.
 */
export function skipRejectedTheDish(reason: string | null): boolean {
  return reason === "not_appealing";
}
