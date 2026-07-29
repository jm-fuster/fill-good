import {
  matchLineExact,
  suggestCandidates,
  type HouseholdMatchData,
} from "@/lib/matching";
import { normalizeName } from "@/lib/normalize";
import type { UnitType } from "@/lib/supabase/types";
import {
  convertQuantity,
  isCountable,
  roundQuantity,
  unitFamily,
} from "@/lib/units";

/**
 * Decisiones de la orden de voz: qué producto es y de qué lotes se descuenta.
 * Todo aquí es PURO (entra el catálogo y los lotes, sale un plan), para que el
 * handler solo haga entrada/salida y estas reglas se puedan razonar de un tirón.
 */

/** Margen de holgura para comparar cantidades en coma flotante. */
const EPSILON = 1e-9;

/**
 * Umbral para descontar por parecido SIN preguntar. Es más alto que el 0,4 con
 * el que los tickets SUGIEREN candidatos, y a propósito: en el escaneo hay una
 * pantalla de revisión donde el usuario corrige antes de guardar, pero por voz
 * no hay red de seguridad. La otra mitad de la mitigación está en la respuesta,
 * que siempre repite el nombre con el que ha casado.
 */
export const VOICE_AUTO_THRESHOLD = 0.5;

/** Ventaja mínima sobre el segundo candidato para no preguntar. */
export const VOICE_AUTO_MARGIN = 0.1;

/** Cantidad máxima aceptable: por encima es un error de reconocimiento. */
export const MAX_VOICE_QUANTITY = 10_000;

export type ProductResolution =
  | { kind: "match"; productId: string }
  | { kind: "ambiguous"; productIds: string[] }
  | { kind: "none" };

/**
 * Variantes de número del término dicho. Alexa transcribe lo que uno dice
 * («yogures»), pero el catálogo guarda el nombre con el que se dio de alta
 * («yogur natural»), así que hay que probar singular y plural. Reglas mínimas
 * del castellano, sin stemmer: quitar «es»/«s» y añadirlos.
 */
export function numberVariants(normalized: string): string[] {
  const variants = new Set<string>([normalized]);
  if (normalized.endsWith("es")) variants.add(normalized.slice(0, -2));
  if (normalized.endsWith("s")) variants.add(normalized.slice(0, -1));
  if (!normalized.endsWith("s")) {
    variants.add(`${normalized}s`);
    // El plural en «es» es el de las palabras que acaban en consonante
    // («limón» → «limones»); en vocal basta la «s», y añadirlo daría engendros
    // como «lechees» que solo ensucian la comparación.
    if (!/[aeiou]$/.test(normalized)) variants.add(`${normalized}es`);
  }
  return [...variants].filter((v) => v.length > 0);
}

/** ¿Aparece `term` como palabra completa dentro de `name`? */
function containsWord(name: string, term: string): boolean {
  if (name === term) return true;
  return (
    name.startsWith(`${term} `) ||
    name.endsWith(` ${term}`) ||
    name.includes(` ${term} `)
  );
}

/**
 * Resuelve el producto del que habla el usuario, en cuatro pasos de menos a más
 * permisivo:
 *
 *   1. Match exacto (alias aprendido o nombre normalizado), reusando la misma
 *      precedencia que el escaneo de tickets.
 *   2. Lo mismo con las variantes de singular/plural.
 *   3. Contención por palabra completa: «yogur» → «yogur natural». Este paso es
 *      el que de verdad hace usable la voz, porque uno nombra el producto sin
 *      apellidos y el trigrama no llega ahí («yogures» contra «yogur natural»
 *      sale ~0,29, por debajo de cualquier umbral razonable).
 *   4. Parecido por trigramas, para erratas de transcripción.
 *
 * Cuando un paso encuentra más de un producto, devuelve `ambiguous` y el handler
 * pregunta: descontar del producto equivocado es peor que repetir la orden.
 */
export function resolveProduct(
  spoken: string,
  data: HouseholdMatchData,
): ProductResolution {
  const normalized = normalizeName(spoken);
  if (!normalized) return { kind: "none" };
  const variants = numberVariants(normalized);

  // 1 y 2. Exacto, con las variantes de número.
  for (const variant of variants) {
    const exact = matchLineExact(data, null, variant);
    if (exact.productId) return { kind: "match", productId: exact.productId };
  }

  // 3. Contención por palabra completa, sobre nombres y aliases.
  const byWord = new Set<string>();
  for (const variant of variants) {
    for (const product of data.products) {
      if (containsWord(product.normalizedName, variant)) byWord.add(product.id);
    }
    for (const alias of data.aliases) {
      if (containsWord(alias.aliasNormalized, variant)) byWord.add(alias.productId);
    }
  }
  if (byWord.size === 1) {
    return { kind: "match", productId: [...byWord][0] };
  }
  if (byWord.size > 1) {
    return { kind: "ambiguous", productIds: [...byWord].slice(0, 3) };
  }

  // 4. Parecido por trigramas. Se queda con el mejor de todas las variantes.
  const scores = new Map<string, number>();
  for (const variant of variants) {
    for (const candidate of suggestCandidates(data, null, variant)) {
      const best = scores.get(candidate.productId) ?? 0;
      if (candidate.score > best) scores.set(candidate.productId, candidate.score);
    }
  }
  const ranked = [...scores.entries()]
    .map(([productId, score]) => ({ productId, score }))
    .sort((a, b) => b.score - a.score);
  if (ranked.length === 0) return { kind: "none" };

  const [top, second] = ranked;
  const clearWinner =
    top.score >= VOICE_AUTO_THRESHOLD &&
    (!second || top.score - second.score >= VOICE_AUTO_MARGIN);
  if (clearWinner) return { kind: "match", productId: top.productId };
  return { kind: "ambiguous", productIds: ranked.slice(0, 3).map((r) => r.productId) };
}

/** Un lote de stock: una fila de `inventory_items` (producto + ubicación). */
export type StockLot = {
  id: string;
  quantity: number;
  unit: UnitType;
};

export type DeductionStep = {
  lotId: string;
  /** Cantidad que queda en el lote (en su propia unidad), ya redondeada. */
  newQuantity: number;
  /** Cantidad descontada de ESTE lote, en la unidad DEL LOTE. */
  taken: number;
  unit: UnitType;
};

export type StockSummary = { quantity: number; unit: UnitType };

export type DeductionPlan =
  | {
      kind: "deduct";
      steps: DeductionStep[];
      /** Unidad en la que se ha interpretado la orden. */
      unit: UnitType;
      /** Descontado en total, en `unit`. */
      taken: number;
      /** Lo que queda del producto en `unit` tras el descuento. */
      remaining: number;
      /** false si el stock no llegaba para todo lo pedido. */
      covered: boolean;
    }
  | { kind: "ask_unit"; stock: StockSummary[] }
  | { kind: "unit_mismatch"; asked: UnitType; available: UnitType }
  | { kind: "no_stock" }
  | { kind: "invalid_quantity" };

/** Agrupa el stock por unidad para poder decirlo en voz alta. */
function summarize(lots: StockLot[]): StockSummary[] {
  const byUnit = new Map<UnitType, number>();
  for (const lot of lots) {
    byUnit.set(lot.unit, (byUnit.get(lot.unit) ?? 0) + lot.quantity);
  }
  return [...byUnit.entries()].map(([unit, quantity]) => ({
    quantity: roundQuantity(quantity),
    unit,
  }));
}

/**
 * Plan de descuento FIFO por caducidad (los lotes llegan ya ordenados: el que
 * antes caduca primero, nulls al final), en cascada si un lote no cubre la
 * cantidad. Nunca deja stock negativo, y el lote a cero se conserva como
 * agotado — mismas reglas que el descuento de recetas cocinadas.
 *
 * Sobre unidades: solo se opera DENTRO de la misma familia (g↔kg, ml↔l son
 * conversiones exactas). Nunca se traduce «2» a un peso: si el producto está a
 * granel y el usuario no ha dicho la unidad, se pregunta. Adivinar ahí sería
 * inventarse datos del inventario.
 */
export function planDeduction({
  quantity,
  unit: askedUnit,
  lots,
}: {
  quantity: number;
  unit: UnitType | null;
  lots: StockLot[];
}): DeductionPlan {
  if (!Number.isFinite(quantity) || quantity <= 0 || quantity > MAX_VOICE_QUANTITY) {
    return { kind: "invalid_quantity" };
  }
  const withStock = lots.filter((lot) => lot.quantity > 0);
  if (withStock.length === 0) return { kind: "no_stock" };

  let unit: UnitType;
  let candidates: StockLot[];
  if (askedUnit) {
    const family = unitFamily(askedUnit);
    candidates = withStock.filter((lot) => unitFamily(lot.unit) === family);
    if (candidates.length === 0) {
      return { kind: "unit_mismatch", asked: askedUnit, available: withStock[0].unit };
    }
    unit = askedUnit;
  } else {
    candidates = withStock.filter((lot) => isCountable(lot.unit));
    if (candidates.length === 0) {
      return { kind: "ask_unit", stock: summarize(withStock) };
    }
    unit = "ud";
  }

  const steps: DeductionStep[] = [];
  let pending = quantity;
  let stockLeft = 0;
  for (const lot of candidates) {
    // Dentro de la familia la conversión siempre existe; el `?? 0` solo apacigua
    // al tipo (convertQuantity devuelve null cuando NO hay conversión honesta).
    const lotInAskedUnit = convertQuantity(lot.quantity, lot.unit, unit) ?? 0;
    if (pending <= EPSILON) {
      stockLeft += lotInAskedUnit;
      continue;
    }
    const take = Math.min(lotInAskedUnit, pending);
    const exhausts = take >= lotInAskedUnit - EPSILON;
    const takenInLotUnit = exhausts
      ? lot.quantity
      : roundQuantity(convertQuantity(take, unit, lot.unit) ?? 0);
    steps.push({
      lotId: lot.id,
      newQuantity: exhausts ? 0 : roundQuantity(lot.quantity - takenInLotUnit),
      taken: takenInLotUnit,
      unit: lot.unit,
    });
    pending -= take;
    stockLeft += lotInAskedUnit - take;
  }

  return {
    kind: "deduct",
    steps,
    unit,
    taken: roundQuantity(quantity - Math.max(0, pending)),
    remaining: Math.max(0, roundQuantity(stockLeft)),
    covered: pending <= EPSILON,
  };
}
