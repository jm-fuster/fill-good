import type { SuggestionReason } from "./queries";

/**
 * Lo que hace falta para redactar el motivo. Se declara aquí, en vez de pedir un
 * `Suggestion` entero, porque el mismo rótulo lo usan los candidatos a reponer al
 * marcar un plato como cocinado (`RestockCandidate`): pidiendo solo estos tres
 * campos, los dos tipos valen sin tener que copiarse la forma el uno del otro.
 */
type ReasonSource = {
  /** Qué REGLA ha disparado la sugerencia (no si queda algo: eso es `stock`). */
  reason: SuggestionReason;
  /** Existencias totales al calcular. */
  stock: number;
  /** Cadencia habitual en días (solo con reason "restock"). */
  intervalDays?: number;
};

/**
 * Por qué se sugiere un producto, en palabras. Vive aparte porque el mismo texto
 * se muestra en cuatro sitios (la sección de `/lista`, el autocompletado al
 * enfocar el input, los recomendados del modo compra y el paso de «¿lo
 * apuntamos?» al cocinar) y tenerlo repetido ya había empezado a divergir.
 *
 * La razón NO es decorativa: una sugerencia sin motivo se lee como publicidad.
 * Saber que es «Se te ha caducado» y no «Se ha agotado» cambia lo que el usuario
 * hace con ella. Por eso el rótulo mira el `stock` y no solo la regla: son dos
 * hechos distintos y el que le importa a quien lee es cuánto le queda.
 */
export function suggestionReasonLabel(s: ReasonSource): string {
  switch (s.reason) {
    case "expired":
      return "Se te ha caducado";
    case "out_of_stock":
      return "Se ha agotado";
    case "restock":
      return s.intervalDays
        ? `Sueles comprarlo cada ~${s.intervalDays} días`
        : "Toca reponer";
    case "low_stock":
      /*
        Aquí llega también lo que se ha quedado a CERO teniendo mínimo: la fuente
        "low_stock" gana la precedencia en `getSuggestions` (manda la regla que
        escribió el usuario). Anunciar entonces que queda poco es simplemente
        falso, así que manda el hecho, y de paso coincide con lo que dice el paso
        de «¿lo apuntamos?» del mismo producto.

        Con existencias, «Bajo tu mínimo» en vez de «Quedan pocas»: el género y el
        número del producto no se saben (arroz, leche, huevos piden «queda poco»,
        «queda poca», «quedan pocos»), y esta forma vale para todos. Además nombra
        la regla del usuario, que es lo que explica la cantidad sugerida al lado.
      */
      return s.stock <= 0 ? "Se ha agotado" : "Bajo tu mínimo";
  }
}

/** Versión corta para el desplegable del autocompletado, donde no cabe la larga. */
export function suggestionReasonShort(s: ReasonSource): string {
  if (s.reason === "restock" && s.intervalDays) {
    return `cada ~${s.intervalDays} días`;
  }
  return suggestionReasonLabel(s);
}
