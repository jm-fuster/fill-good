import type { Suggestion } from "./queries";

/**
 * Por qué se sugiere un producto, en palabras. Vive aparte porque el mismo texto
 * se muestra en tres sitios (la sección de `/lista`, el autocompletado al enfocar
 * el input y los recomendados del modo compra) y tenerlo triplicado ya había
 * empezado a divergir.
 *
 * La razón NO es decorativa: una sugerencia sin motivo se lee como publicidad.
 * Saber que es «Se te ha caducado» y no «Se ha agotado» cambia lo que el usuario
 * hace con ella.
 */
export function suggestionReasonLabel(s: Suggestion): string {
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
      return "Quedan pocas";
  }
}

/** Versión corta para el desplegable del autocompletado, donde no cabe la larga. */
export function suggestionReasonShort(s: Suggestion): string {
  if (s.reason === "restock" && s.intervalDays) {
    return `cada ~${s.intervalDays} días`;
  }
  return suggestionReasonLabel(s);
}
