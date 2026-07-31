/**
 * Sello de color de cada cadena de supermercado: un cuadradito con la inicial,
 * en el color de la marca. Sirve para reconocer la tienda de un vistazo en la
 * lista, en los chips y en Ajustes, donde antes todas llevaban el mismo icono
 * genérico de tienda y solo se distinguían leyendo el nombre.
 *
 * NO son los logotipos oficiales, y es a propósito:
 *
 *  1. Son marcas registradas. Empaquetar el logotipo de Mercadona o Carrefour en
 *     una app que se publica es una decisión legal, no de diseño, y no se toma
 *     desde aquí.
 *  2. Casi todos son LOGOTIPOS DE TEXTO (Mercadona, Día, Eroski, Ahorramás). Al
 *     tamaño al que se usan aquí —12 px dentro de un badge de la lista— un
 *     logotipo de texto es una manchita ilegible.
 *  3. Los pocos que tienen símbolo compacto (la C de Carrefour, el círculo de
 *     Lidl) no salvan al resto: quedaría media lista con símbolo y media con
 *     mancha.
 *
 * El color sí es el de la marca, que es lo que de verdad se reconoce a 12 px, y
 * el nombre va SIEMPRE al lado (el sello es `aria-hidden`): el color acompaña,
 * nunca identifica por sí solo. Eso también resuelve que en España casi todas
 * las cadenas sean roja, azul o verde — Carrefour, Lidl y Aldi son las tres
 * azules, y se distinguen por el nombre, no por el sello.
 *
 * ── Por qué hay hex aquí, con lo que dice AGENTS.md ────────────────────────────
 * La regla es que los COMPONENTES usen solo tokens semánticos, y sigue en pie:
 * ningún componente escribe un color, lo lee de aquí. Un color de marca no es un
 * token del tema (no hay un "azul Carrefour" claro y otro oscuro: es ESE azul en
 * los dos), así que vive como dato, igual que los rellenos de los iconos de
 * producto en `src/lib/product-icons/registry.ts`. Es la única excepción, y esta
 * es su frontera.
 *
 * ── Contraste (misma regla que scripts/gen-product-icons.ps1) ─────────────────
 * Cada color se midió contra los CUATRO fondos reales de `globals.css`
 * (--card y --background, en claro y en oscuro) exigiendo ≥ 2,2:1 en los dos
 * temas, y la inicial encima del sello exigiendo ≥ 3:1. Por eso varios no son el
 * hex oficial exacto: el azul de Carrefour (#004E9F) da 2,18:1 sobre la tarjeta
 * oscura y desaparece, así que se aclara lo justo. Los números medidos van en
 * cada línea: «claro / oscuro (inicial)». Si tocas un color, vuelve a medirlo.
 */

/** Color de la inicial: blanca en los sellos oscuros, tinta en los claros. */
export type MarkInk = "light" | "dark";

/**
 * Tinta oscura de las iniciales. Es el tono de `--card` en oscuro y no negro
 * puro, para que el sello no parezca un agujero recortado.
 */
export const MARK_INK_DARK = "#101614";

export type ChainMark = { fill: string; ink: MarkInk };

/**
 * Color de marca por cadena conocida. Lo que no esté aquí —«otros» y las tiendas
 * propias del hogar— cae en un sello neutro con tokens del tema, que es correcto:
 * de una tienda que el hogar acaba de escribir no sabemos ningún color.
 */
export const CHAIN_MARKS: Record<string, ChainMark> = {
  mercadona: { fill: "#008B45", ink: "light" }, // 4,29 / 4,03 (4,39)
  carrefour: { fill: "#1A5FB4", ink: "light" }, // 6,14 / 2,82 (6,29)
  lidl: { fill: "#2A6FC4", ink: "light" }, //      4,92 / 3,51 (5,04)
  dia: { fill: "#E3000F", ink: "light" }, //       4,80 / 3,60 (4,91)
  alcampo: { fill: "#E94E24", ink: "light" }, //   3,67 / 4,70 (3,76)
  eroski: { fill: "#C1272D", ink: "light" }, //    5,70 / 3,03 (5,84)
  consum: { fill: "#E8720C", ink: "dark" }, //     2,99 / 5,77 (5,97)
  aldi: { fill: "#00A0E1", ink: "dark" }, //       2,88 / 6,00 (6,20)
  ahorramas: { fill: "#6AA83C", ink: "dark" }, //  2,82 / 6,14 (6,35)
  spar: { fill: "#00A651", ink: "dark" }, //       3,12 / 5,54 (5,73)
};

/** El color de marca de una cadena, o null si no tenemos ninguno para ella. */
export function chainMark(chain: string): ChainMark | null {
  return CHAIN_MARKS[chain] ?? null;
}

/**
 * Inicial que lleva el sello. Se saca de la ETIQUETA y no de la clave para que
 * una tienda propia («Gadis») dé «G» y no la primera letra de un slug. Se coge
 * la primera letra o dígito: hay tiendas que empiezan por comilla o por «El».
 */
export function chainInitial(label: string): string {
  const match = label.match(/\p{L}|\p{N}/u);
  return (match?.[0] ?? "·").toLocaleUpperCase("es");
}
