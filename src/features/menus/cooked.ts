/**
 * Cálculo PURO (sin I/O) de qué ingredientes de una receta se pueden descontar
 * del inventario al marcarla como cocinada (M2).
 *
 * Es la operación inversa a `computeMissingIngredients` (`missing.ts`): allí se
 * buscaba lo que FALTA (sin stock); aquí lo que SÍ está para restarlo. Se
 * reutiliza el mismo matching en tres niveles (product_id → nombre exacto →
 * fuzzy trigram) y los mismos primitivos, sin IA.
 *
 * ## Unidades
 *
 * Se resta de la unidad que YA tiene la fila de inventario, y solo cuando
 * `convertQuantity` sabe convertir honestamente: misma familia (g↔kg, ml↔l) o
 * puente ud↔medida con el contenido que el usuario declaró en la ficha del
 * producto. Es la misma política que `addStockQuantity` para el sentido contrario
 * —reponer—: la app no ADIVINA cuánto pesa una unidad, pero sí usa el factor que
 * le han escrito. Sin conversión posible, el ingrediente se lista como informativo
 * y no se toca nada.
 *
 * Esto era antes una restricción tajante ("NO hay conversión ud↔peso ni g↔kg") y
 * dejaba el descuento casi inservible en una casa real: las recetas hablan de
 * gramos y mililitros, y la despensa cuenta paquetes y botellas, así que ningún
 * ingrediente cuadraba y cocinar no descontaba nada.
 *
 * La cantidad se edita y se muestra en la unidad de la RECETA (que es como piensa
 * quien cocina: «he echado 160 g»); la conversión a la unidad de la despensa la
 * hace el servidor al escribir, con estas mismas reglas.
 */
import { normalizeName } from "@/lib/normalize";
import {
  DEFAULT_FUZZY_THRESHOLD,
  MIN_FUZZY_LENGTH,
  trigramSimilarity,
} from "@/lib/similarity";
import {
  convertQuantity,
  roundQuantity,
  unitFamily,
  UNIT_LABELS,
  type UnitContent,
} from "@/lib/units";
import type { UnitType } from "@/lib/supabase/types";
import type { CatalogEntry, MatchKind } from "./missing";

export type CookedIngredientLine = {
  name: string;
  productId: string | null;
  unit: UnitType | null;
  quantity: number | null;
};

/**
 * Por qué NO se puede descontar un ingrediente. Va aparte del texto porque el
 * resumen ("¿por qué no has descontado nada?") tiene que contar motivos, y
 * hacerlo comparando frases se rompe en cuanto alguien retoca una palabra.
 */
export type CookedReasonKind =
  | "no_match"
  | "no_stock"
  | "no_quantity"
  | "unit_mismatch";

/** De qué fila de inventario se resta, cuando no es la unidad de la receta. */
export type CookedConversion = {
  /** Unidad de las filas de inventario de las que se restará. */
  stockUnit: UnitType;
  /** Existencias en esa unidad (lo que se ve en el inventario). */
  stockQty: number;
  /**
   * El puente usó un contenido ESTIMADO (el peso medio de algo fresco), no el
   * dato exacto de un envase. La UI lo dice con «≈»: una estimación no se
   * presenta como un hecho.
   */
  approx: boolean;
};

export type CookedDeduction = {
  /** Clave estable para React y para deduplicar. */
  key: string;
  ingredientName: string;
  /** Producto del catálogo emparejado (null si no hay match). */
  productId: string | null;
  productName: string | null;
  matchKind: MatchKind | null;
  /** Unidad del ingrediente en la receta: la que se edita y se muestra. */
  unit: UnitType | null;
  /** Cantidad propuesta a descontar, en `unit`, acotada al stock. */
  suggestedQty: number;
  /** Stock total del producto, convertido a `unit`. */
  availableQty: number;
  /** null = la despensa ya está en la unidad de la receta, sin conversión. */
  conversion: CookedConversion | null;
  /** true = se puede descontar; false = solo informativo. */
  deductible: boolean;
  /** Motivo cuando NO es descontable (para mostrar en la fila). */
  reason: string | null;
  /** El mismo motivo, en clave, para poder contarlos. */
  reasonKind: CookedReasonKind | null;
};

export type CookedComputationInput = {
  ingredients: CookedIngredientLine[];
  catalog: CatalogEntry[];
  /** Stock (cantidad > 0) por producto y unidad. */
  stockByProductUnit: Map<string, Map<UnitType, number>>;
  /** Contenido declarado por producto, para el puente ud↔medida. */
  contentByProduct: Map<string, UnitContent>;
  fuzzyThreshold?: number;
};

type ResolvedMatch = {
  productId: string;
  productName: string;
  kind: MatchKind;
};

/** De dónde y cuánto se puede sacar un ingrediente. */
export type StockTarget = CookedConversion & {
  /** Existencias de esa unidad expresadas en la unidad de la receta. */
  availableQty: number;
};

/**
 * Elige de qué unidad del inventario se resta un ingrediente y cuánto hay
 * disponible visto desde la receta.
 *
 * Prefiere lo EXACTO (misma familia física) antes que el puente por contenido
 * declarado, y a igualdad la unidad que más cubre — así una receta de 160 g tira
 * de los 5 kg antes que de un bote de 400 g y no se queda corta sin necesidad.
 * `null` cuando no hay ninguna unidad de la que sacarlo honestamente.
 *
 * Lo usan las DOS caras de la operación: la propuesta que se muestra y la
 * escritura que descuenta. Compartirlo no es un lujo: si la escritura resolviera
 * la unidad por su cuenta, restaría de una fila distinta de la que se prometió.
 */
export function resolveStockTarget(
  ingredientUnit: UnitType,
  stockByUnit: ReadonlyMap<UnitType, number> | undefined,
  content: UnitContent,
): StockTarget | null {
  if (!stockByUnit) return null;
  const wanted = unitFamily(ingredientUnit);
  let best: StockTarget | null = null;

  for (const [stockUnit, stockQty] of stockByUnit) {
    if (stockQty <= 0) continue;
    const available = convertQuantity(
      stockQty,
      stockUnit,
      ingredientUnit,
      content,
    );
    if (available === null || available <= 0) continue;
    const exact = unitFamily(stockUnit) === wanted;
    const candidate: StockTarget = {
      stockUnit,
      stockQty,
      availableQty: roundQuantity(available),
      approx: !exact && (content?.estimate ?? false),
    };
    if (best === null) {
      best = candidate;
      continue;
    }
    const bestExact = unitFamily(best.stockUnit) === wanted;
    if (exact !== bestExact) {
      if (exact) best = candidate;
      continue;
    }
    if (candidate.availableQty > best.availableQty) best = candidate;
  }

  return best;
}

export function computeCookedDeductions(
  input: CookedComputationInput,
): CookedDeduction[] {
  const threshold = input.fuzzyThreshold ?? DEFAULT_FUZZY_THRESHOLD;

  const catalogById = new Map(input.catalog.map((c) => [c.id, c]));
  const catalogByNorm = new Map<string, CatalogEntry>();
  for (const c of input.catalog) {
    if (!catalogByNorm.has(c.normalizedName)) {
      catalogByNorm.set(c.normalizedName, c);
    }
  }

  const result: CookedDeduction[] = [];
  const seen = new Set<string>();

  for (const ing of input.ingredients) {
    const norm = normalizeName(ing.name);
    if (!norm) continue;

    let match: ResolvedMatch | null = null;

    // Nivel 1: product_id explícito.
    if (ing.productId && catalogById.has(ing.productId)) {
      const c = catalogById.get(ing.productId)!;
      match = { productId: c.id, productName: c.name, kind: "product_id" };
    }
    // Nivel 2: nombre normalizado exacto.
    if (!match) {
      const c = catalogByNorm.get(norm);
      if (c) match = { productId: c.id, productName: c.name, kind: "exact" };
    }
    // Nivel 3: fuzzy por trigramas.
    if (!match && norm.length >= MIN_FUZZY_LENGTH) {
      let best: { entry: CatalogEntry; score: number } | null = null;
      for (const c of input.catalog) {
        const score = trigramSimilarity(norm, c.normalizedName);
        if (score >= threshold && (best === null || score > best.score)) {
          best = { entry: c, score };
        }
      }
      if (best) {
        match = {
          productId: best.entry.id,
          productName: best.entry.name,
          kind: "fuzzy",
        };
      }
    }

    // Dedup: por producto emparejado o, si es texto libre, por nombre.
    const key = match ? `p:${match.productId}` : `n:${norm}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const base = {
      key,
      ingredientName: ing.name,
      unit: ing.unit,
      productId: match?.productId ?? null,
      productName: match?.productName ?? null,
      matchKind: match?.kind ?? null,
    };
    /** Atajo para las cuatro salidas informativas. */
    const informative = (
      reason: string,
      reasonKind: CookedReasonKind,
    ): CookedDeduction => ({
      ...base,
      suggestedQty: 0,
      availableQty: 0,
      conversion: null,
      deductible: false,
      reason,
      reasonKind,
    });

    // Sin match en el catálogo → informativo.
    if (!match) {
      result.push(informative("No está en tu catálogo", "no_match"));
      continue;
    }

    const unitsInStock = input.stockByProductUnit.get(match.productId);
    const totalStock = unitsInStock
      ? [...unitsInStock.values()].reduce((a, b) => a + b, 0)
      : 0;

    // Sin stock → informativo.
    if (!unitsInStock || totalStock <= 0) {
      result.push(informative("No te queda en el inventario", "no_stock"));
      continue;
    }

    // Sin unidad o sin cantidad en la receta → no se adivina.
    if (ing.unit == null || ing.quantity == null) {
      result.push(informative("La receta no indica cantidad", "no_quantity"));
      continue;
    }

    const target = resolveStockTarget(
      ing.unit,
      unitsInStock,
      input.contentByProduct.get(match.productId) ?? null,
    );

    // Ninguna unidad convertible: se tiene en otra magnitud y el producto no
    // declara cuánto contiene, así que no hay factor honesto que aplicar.
    if (!target) {
      const otherUnit = [...unitsInStock.keys()][0];
      result.push(
        informative(
          `Lo tienes en ${UNIT_LABELS[otherUnit]}`,
          "unit_mismatch",
        ),
      );
      continue;
    }

    // Descontable: la cantidad de la receta, acotada a lo que de verdad hay.
    result.push({
      ...base,
      suggestedQty: roundQuantity(Math.min(ing.quantity, target.availableQty)),
      availableQty: target.availableQty,
      // Misma unidad = sin conversión que explicar.
      conversion:
        target.stockUnit === ing.unit
          ? null
          : {
              stockUnit: target.stockUnit,
              stockQty: target.stockQty,
              approx: target.approx,
            },
      deductible: true,
      reason: null,
      reasonKind: null,
    });
  }

  return result;
}

/**
 * Por qué no se ha descontado NADA, en una frase, o null si sí había algo que
 * descontar (entonces no hay nada que explicar).
 *
 * Existe porque el silencio se leía como un fallo: la app calculaba el motivo de
 * cada ingrediente que no podía tocar y luego los tiraba, así que marcar un plato
 * como cocinado y no ver ningún cambio en la despensa era indistinguible de que
 * la app no hubiera intentado nada.
 *
 * Manda el motivo más repetido; a igualdad, el más accionable primero (el que el
 * usuario puede arreglar hoy en la ficha del producto).
 */
export function noDeductionsReason(items: CookedDeduction[]): string | null {
  if (items.length === 0) return null;
  if (items.some((it) => it.deductible)) return null;

  const counts = new Map<CookedReasonKind, number>();
  for (const it of items) {
    if (!it.reasonKind) continue;
    counts.set(it.reasonKind, (counts.get(it.reasonKind) ?? 0) + 1);
  }
  if (counts.size === 0) return null;

  const priority: CookedReasonKind[] = [
    "unit_mismatch",
    "no_stock",
    "no_match",
    "no_quantity",
  ];
  let dominant = priority[0];
  let bestCount = -1;
  for (const kind of priority) {
    const n = counts.get(kind) ?? 0;
    if (n > bestCount) {
      dominant = kind;
      bestCount = n;
    }
  }

  switch (dominant) {
    case "unit_mismatch":
      return "No he descontado nada: lo tienes en otra unidad. Di cuánto contiene cada envase en la ficha del producto y podré convertirlo.";
    case "no_stock":
      return "No he descontado nada: ya no te quedaba nada de sus ingredientes.";
    case "no_match":
      return "No he descontado nada: sus ingredientes no están en tu inventario.";
    case "no_quantity":
      return "No he descontado nada: la receta no dice qué cantidades lleva.";
  }
}
