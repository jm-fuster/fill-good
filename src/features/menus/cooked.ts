/**
 * Cálculo PURO (sin I/O) de qué ingredientes de una receta se pueden descontar
 * del inventario al marcarla como cocinada (M2).
 *
 * Es la operación inversa a `computeMissingIngredients` (`missing.ts`): allí se
 * buscaba lo que FALTA (sin stock); aquí lo que SÍ está para restarlo. Se
 * reutiliza el mismo matching en tres niveles (product_id → nombre exacto →
 * fuzzy trigram) y los mismos primitivos, sin IA.
 *
 * Regla de unidades (restricción del proyecto, ver AGENTS.md y `lib/units.ts`):
 * NO hay conversión ud↔peso ni g↔kg. Un ingrediente solo es descontable si hay
 * stock del producto en su MISMA unidad exacta; si no cuadra, se lista como
 * informativo y jamás se convierte.
 */
import { normalizeName } from "@/lib/normalize";
import {
  DEFAULT_FUZZY_THRESHOLD,
  MIN_FUZZY_LENGTH,
  trigramSimilarity,
} from "@/lib/similarity";
import { UNIT_LABELS } from "@/lib/units";
import type { UnitType } from "@/lib/supabase/types";
import type { CatalogEntry, MatchKind } from "./missing";

export type CookedIngredientLine = {
  name: string;
  productId: string | null;
  unit: UnitType | null;
  quantity: number | null;
};

export type CookedDeduction = {
  /** Clave estable para React y para deduplicar. */
  key: string;
  ingredientName: string;
  /** Producto del catálogo emparejado (null si no hay match). */
  productId: string | null;
  productName: string | null;
  matchKind: MatchKind | null;
  /** Unidad del ingrediente (y del descuento). */
  unit: UnitType | null;
  /** Cantidad propuesta a descontar (misma unidad), acotada al stock. */
  suggestedQty: number;
  /** Stock total del producto en esa unidad. */
  availableQty: number;
  /** true = se puede descontar; false = solo informativo. */
  deductible: boolean;
  /** Motivo cuando NO es descontable (para mostrar en el modal). */
  reason: string | null;
};

export type CookedComputationInput = {
  ingredients: CookedIngredientLine[];
  catalog: CatalogEntry[];
  /** Stock (cantidad > 0) por producto y unidad. */
  stockByProductUnit: Map<string, Map<UnitType, number>>;
  fuzzyThreshold?: number;
};

type ResolvedMatch = {
  productId: string;
  productName: string;
  kind: MatchKind;
};

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

    // Sin match en el catálogo → informativo.
    if (!match) {
      result.push({
        ...base,
        suggestedQty: 0,
        availableQty: 0,
        deductible: false,
        reason: "No está en tu catálogo",
      });
      continue;
    }

    const unitsInStock = input.stockByProductUnit.get(match.productId);
    const totalStock = unitsInStock
      ? [...unitsInStock.values()].reduce((a, b) => a + b, 0)
      : 0;

    // Sin stock → informativo.
    if (!unitsInStock || totalStock <= 0) {
      result.push({
        ...base,
        suggestedQty: 0,
        availableQty: 0,
        deductible: false,
        reason: "No te queda en el inventario",
      });
      continue;
    }

    // Sin unidad o sin cantidad en la receta → no se adivina.
    if (ing.unit == null || ing.quantity == null) {
      result.push({
        ...base,
        suggestedQty: 0,
        availableQty: 0,
        deductible: false,
        reason: "La receta no indica cantidad",
      });
      continue;
    }

    const availableQty = unitsInStock.get(ing.unit) ?? 0;

    // Stock solo en otra unidad → jamás se convierte.
    if (availableQty <= 0) {
      const otherUnit = [...unitsInStock.keys()][0];
      result.push({
        ...base,
        suggestedQty: 0,
        availableQty: 0,
        deductible: false,
        reason: `En tu inventario está en ${UNIT_LABELS[otherUnit]}`,
      });
      continue;
    }

    // Descontable: cantidad propuesta = la de la receta, acotada al stock.
    result.push({
      ...base,
      suggestedQty: Math.min(ing.quantity, availableQty),
      availableQty,
      deductible: true,
      reason: null,
    });
  }

  return result;
}
