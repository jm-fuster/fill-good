/**
 * Marca legible por máquina del contenido generado por IA (Reglamento (UE)
 * 2024/1689, art. 50.2: los proveedores de sistemas que generan texto marcan
 * la salida «en un formato legible por máquina»; a los sistemas en el mercado
 * antes del 2-ago-2026 se les aplica desde el 2-dic-2026).
 *
 * La procedencia ya vive en la base —`menu_entries.source`, `recipes.source` y
 * `weekly_menus.generated_by` valen `'ai'`— y viaja así en la exportación. Esto
 * la lleva también al HTML con dos atributos estables, en la línea del
 * `digitalSourceType` de IPTC que usa C2PA para medios.
 *
 * Qué queda fuera y por qué:
 *  - La lectura de tickets: transcribe lo que ya pone el papel, no genera
 *    contenido (la excepción de «no alterar sustancialmente los datos de
 *    entrada» del mismo artículo).
 *  - Los pasos que la IA escribe en una receta del hogar: en el formulario
 *    llegan como BORRADOR que una persona revisa y guarda (ver la migración
 *    `20260805120000_recetas_pasos.sql`), y la receta sigue siendo del hogar.
 */
export const AI_DIGITAL_SOURCE_TYPE =
  "http://cv.iptc.org/newscodes/digitalsourcetype/trainedAlgorithmicMedia";

/** Atributos para el elemento que envuelve un contenido; vacíos si no es de IA. */
export function aiProvenanceAttrs(isAi: boolean): Record<string, string> {
  return isAi
    ? {
        "data-ai-generated": "true",
        "data-digital-source-type": AI_DIGITAL_SOURCE_TYPE,
      }
    : {};
}
