import { normalizeName } from "@/lib/normalize";

/**
 * Vocabulario de cadenas de supermercado. Vive en un módulo neutro (ni
 * "use client" ni "server-only") para poder usarse tanto en el gráfico de
 * precios (cliente) como en la página de detalle (Server Component) sin cruzar
 * la frontera "use client".
 *
 * Hay DOS clases de cadena y conviven en las mismas columnas de texto
 * (`receipts.store_chain`, `products.preferred_chain`,
 * `households.preferred_chains`):
 *
 * - Las de aquí abajo, con clave corta en minúsculas (`mercadona`) y etiqueta
 *   bonita. Son las que conoce toda la app de serie.
 * - Las TIENDAS PROPIAS del hogar (L15 f5), para cadenas regionales que no
 *   están en la lista (Gadis, Alimerka, BonÀrea…). En ellas **el nombre que
 *   escribe el usuario ES la clave**: así `chainLabel` cae en la propia clave y
 *   se muestra bien en las diez pantallas que pintan cadenas sin tener que
 *   arrastrar un mapa de etiquetas por medio repo. El precio de esa decisión es
 *   que el nombre pasa a ser un identificador: se canoniza al guardarlo
 *   (`canonicalizeChains`) y no se renombra, se quita y se añade.
 */
export const CHAIN_LABELS: Record<string, string> = {
  mercadona: "Mercadona",
  carrefour: "Carrefour",
  lidl: "Lidl",
  dia: "Día",
  alcampo: "Alcampo",
  eroski: "Eroski",
  consum: "Consum",
  aldi: "Aldi",
  ahorramas: "Ahorramás",
  spar: "Spar",
  otro: "Otros",
};

/**
 * Cadenas ofrecibles como preferencia de compra por producto (L15), en orden.
 * Excluye "otro": como preferencia ("cómpralo siempre en…") no tiene sentido.
 *
 * El ORDEN es el ranking canónico de toda la app (`orderChains`), así que las
 * cadenas nuevas se AÑADEN AL FINAL: intercalarlas movería de sitio los chips y
 * los selectores de quien ya usa la app, que se los sabe de memoria.
 */
export const CHAIN_OPTIONS: { value: string; label: string }[] = [
  "mercadona",
  "carrefour",
  "lidl",
  "dia",
  "alcampo",
  "eroski",
  "consum",
  "aldi",
  "ahorramas",
  "spar",
].map((value) => ({ value, label: CHAIN_LABELS[value] }));

/**
 * Etiqueta legible de una cadena. Cae en la propia clave, que es justo lo que
 * hace legibles las tiendas propias del hogar sin pasarles ningún diccionario.
 */
export function chainLabel(chain: string): string {
  return CHAIN_LABELS[chain] ?? chain;
}

/**
 * Claves que la app se reserva: las conocidas y `otro`. Una tienda propia no
 * puede llamarse como ninguna de ellas (se canoniza a la conocida).
 */
export function isBuiltInChain(chain: string): boolean {
  return chain in CHAIN_LABELS;
}

/** Tienda propia del hogar = cualquier cadena que no sea una de las conocidas. */
export function isCustomChain(chain: string): boolean {
  return !isBuiltInChain(chain);
}

/**
 * Tope de caracteres del nombre de una tienda propia. No es estético: el nombre
 * ES la clave de la cadena y acaba en `products.preferred_chain`, cuyo CHECK en
 * la BD exige entre 1 y 40 caracteres.
 */
export const CHAIN_NAME_MAX = 40;

/** Tope de tiendas por hogar; coincide con el CHECK de `preferred_chains`. */
export const CHAINS_MAX = 20;

/** `otro`/`otros` no son tiendas: son "no la reconozco". Nadie las escribe. */
const RESERVED_NAMES = new Set(["otro", "otros"]);

/**
 * Grafías alternativas que también son una cadena conocida. Cada entrada FUNDE
 * dos nombres en una clave, así que solo entran las que son literalmente la MISMA
 * tienda escrita de otra forma. «Ahorra Más» separado lo es.
 *
 * Lo que NO entra: los formatos de una misma enseña (EuroSpar, Spar Express…).
 * Son tiendas distintas con precios distintos, y juntarlas mezclaría dos
 * historiales de precios en uno que no describe ninguna de las dos. Quien compre
 * en una puede añadirla como tienda propia.
 *
 * Las claves van ya normalizadas (sin acentos ni mayúsculas).
 */
const CHAIN_ALIASES: Record<string, string> = {
  "ahorra mas": "ahorramas",
};

/**
 * Si un nombre escrito a mano es en realidad una de las cadenas conocidas,
 * devuelve su clave; si no, null. Compara sin acentos ni mayúsculas contra la
 * clave, la etiqueta y los alias, así que "Día", "dia" y "DIA" acaban todas en
 * `dia` —y "Ahorra Más" en `ahorramas`— en vez de crear una tienda propia
 * duplicada que partiría el historial de precios.
 */
export function matchBuiltInChain(name: string): string | null {
  const norm = normalizeName(name);
  if (!norm) return null;
  if (norm in CHAIN_ALIASES) return CHAIN_ALIASES[norm];
  for (const [key, label] of Object.entries(CHAIN_LABELS)) {
    if (norm === normalizeName(key) || norm === normalizeName(label)) return key;
  }
  return null;
}

/** Un nombre reservado no puede ser una tienda propia. */
export function isReservedChainName(name: string): boolean {
  return RESERVED_NAMES.has(normalizeName(name));
}

/**
 * Deja una lista de cadenas lista para guardar: espacios colapsados, los nombres
 * que sean una cadena conocida convertidos a su clave, sin repetidos (comparando
 * sin acentos ni mayúsculas) y en orden estable — conocidas en su orden canónico
 * y las propias del hogar alfabéticas.
 *
 * No recorta longitudes ni rechaza nada: de eso se encargan los schemas, que
 * pueden dar un mensaje de error concreto. Aquí solo se normaliza.
 */
export function canonicalizeChains(list: string[]): string[] {
  const builtIns: string[] = [];
  const custom: string[] = [];
  const seen = new Set<string>();

  for (const raw of list) {
    const name = raw.trim().replace(/\s+/g, " ");
    if (!name || isReservedChainName(name)) continue;
    const key = matchBuiltInChain(name);
    const value = key ?? name;
    const norm = normalizeName(value);
    if (seen.has(norm)) continue;
    seen.add(norm);
    (key ? builtIns : custom).push(value);
  }

  return [
    ...orderChains(builtIns),
    ...custom.sort((a, b) => a.localeCompare(b, "es")),
  ];
}

/**
 * Cadenas ofrecibles como "tienda preferida" de un producto: las conocidas más
 * las tiendas propias del hogar. Las propias van al final; el selector las
 * reagrupa por "tus tiendas" / "otras".
 */
export function chainOptions(
  householdChains: string[] = [],
): { value: string; label: string }[] {
  return [
    ...CHAIN_OPTIONS,
    ...householdChains
      .filter(isCustomChain)
      .map((value) => ({ value, label: value })),
  ];
}

/**
 * Fragmento seguro para un `id` del DOM a partir de una clave de cadena: el
 * nombre de una tienda propia puede llevar espacios y acentos ("Bon Àrea").
 */
export function chainSlug(chain: string): string {
  return normalizeName(chain).replace(/[^a-z0-9]+/g, "-") || "tienda";
}

/** Ranking de las cadenas conocidas (las desconocidas van al final). */
const CHAIN_RANK = new Map(CHAIN_OPTIONS.map((c, i) => [c.value, i]));

/**
 * Ordena claves de cadena por el orden canónico de este módulo; las
 * desconocidas, al final y alfabéticas. Un orden estable y compartido evita que
 * la misma lista de tiendas salga en un orden distinto en cada pantalla (chips
 * del modo compra, tiendas del hogar, selector de tienda preferida).
 */
export function orderChains(chains: string[]): string[] {
  return [...chains].sort(
    (a, b) =>
      (CHAIN_RANK.get(a) ?? Infinity) - (CHAIN_RANK.get(b) ?? Infinity) ||
      chainLabel(a).localeCompare(chainLabel(b), "es"),
  );
}
