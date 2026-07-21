/**
 * Cálculo PURO (sin I/O) de los ingredientes que faltan para un menú.
 *
 * Es la mitad testeable de D3: `computeMissingIngredients` recibe los datos ya
 * cargados (ingredientes del menú, catálogo, stock y lista actual) y devuelve la
 * lista de faltantes con el producto del catálogo al que ha casado cada uno. La
 * acción de servidor (`computeMissingForMenuAction`) se encarga del I/O y de la
 * confirmación con la selección del usuario.
 *
 * Matching en TRES niveles (de más fuerte a más débil), sin IA (restricción del
 * proyecto: cero gasto en IA):
 *   1. `recipe_ingredients.product_id`: el ingrediente ya está vinculado a un
 *      producto del catálogo (B1 lo enlaza por nombre al guardar la receta).
 *   2. Nombre normalizado exacto contra `products.normalized_name`.
 *   3. Fuzzy por similitud de trigramas (aproxima a `pg_trgm.similarity`) sobre
 *      el nombre normalizado, umbral orientativo 0,4. Así "tomate frito" (receta)
 *      casa con "Tomate frito Orlando" (catálogo) y no se duplica.
 *
 * Decisión de diseño (D3): el matching vive en TS, sin migración ni RPC. El
 * catálogo por hogar es pequeño (se filtra en cliente en la lista, A2), así que
 * recorrerlo en memoria es barato y evita el round-trip de autorización de un
 * `db push`. Si algún día el trigram en TS se quedara corto, el siguiente paso
 * natural sería un RPC `match_product` con `pg_trgm` (la extensión ya está
 * habilitada) o, como último recurso y solo si el usuario lo pide, Gemini vía
 * `getModel` — NO implementado aquí a propósito.
 */
import { normalizeName } from "@/lib/normalize";
import {
  DEFAULT_FUZZY_THRESHOLD,
  MIN_FUZZY_LENGTH,
  trigramSimilarity,
} from "@/lib/similarity";
import type { UnitType } from "@/lib/supabase/types";

// Reexportados para no romper importadores previos (E2 movió la implementación
// a `@/lib/similarity`, un módulo compartido).
export { DEFAULT_FUZZY_THRESHOLD, trigramSimilarity };

export type MatchKind = "product_id" | "exact" | "fuzzy";

/** Producto del catálogo, lo mínimo que el cálculo necesita. */
export type CatalogEntry = {
  id: string;
  name: string;
  normalizedName: string;
  defaultUnit: UnitType;
};

/** Ingrediente de una receta del menú. */
export type IngredientLine = {
  name: string;
  productId: string | null;
  unit: UnitType | null;
};

export type MissingComputationInput = {
  ingredients: IngredientLine[];
  catalog: CatalogEntry[];
  /** Ids de producto con stock (suma de cantidades > 0). */
  stockProductIds: ReadonlySet<string>;
  /** Nombres normalizados de productos con stock (red de seguridad sin match). */
  stockNames: ReadonlySet<string>;
  /** Ids de producto ya presentes en la lista activa. */
  listProductIds: ReadonlySet<string>;
  /** Nombres normalizados ya presentes en la lista activa. */
  listNames: ReadonlySet<string>;
  /** Umbral fuzzy (por defecto {@link DEFAULT_FUZZY_THRESHOLD}). */
  fuzzyThreshold?: number;
};

/** Un ingrediente faltante y el producto del catálogo al que ha casado (o no). */
export type MissingCandidate = {
  /** Clave estable para el checkbox y la deduplicación. */
  key: string;
  /** Nombre tal como aparece en la receta (para mostrar y para texto libre). */
  ingredientName: string;
  /** Unidad del ingrediente en la receta. */
  unit: UnitType | null;
  /** Producto del catálogo emparejado, o null si es texto libre sin match. */
  match: {
    productId: string;
    productName: string;
    defaultUnit: UnitType;
    kind: MatchKind;
  } | null;
};

type ResolvedMatch = {
  productId: string;
  productName: string;
  defaultUnit: UnitType;
  kind: MatchKind;
};

export function computeMissingIngredients(
  input: MissingComputationInput,
): MissingCandidate[] {
  const threshold = input.fuzzyThreshold ?? DEFAULT_FUZZY_THRESHOLD;

  const catalogById = new Map(input.catalog.map((c) => [c.id, c]));
  const catalogByNorm = new Map<string, CatalogEntry>();
  for (const c of input.catalog) {
    if (!catalogByNorm.has(c.normalizedName)) catalogByNorm.set(c.normalizedName, c);
  }

  const result: MissingCandidate[] = [];
  const seen = new Set<string>();

  for (const ing of input.ingredients) {
    const norm = normalizeName(ing.name);
    if (!norm) continue;

    let match: ResolvedMatch | null = null;

    // Nivel 1: product_id explícito del ingrediente.
    if (ing.productId && catalogById.has(ing.productId)) {
      const c = catalogById.get(ing.productId)!;
      match = { productId: c.id, productName: c.name, defaultUnit: c.defaultUnit, kind: "product_id" };
    }

    // Nivel 2: nombre normalizado exacto.
    if (!match) {
      const c = catalogByNorm.get(norm);
      if (c) {
        match = { productId: c.id, productName: c.name, defaultUnit: c.defaultUnit, kind: "exact" };
      }
    }

    // Nivel 3: fuzzy por trigramas (mejor score por encima del umbral).
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
          defaultUnit: best.entry.defaultUnit,
          kind: "fuzzy",
        };
      }
    }

    // Ya en stock (por producto emparejado o por nombre): no falta.
    const inStock =
      (match !== null && input.stockProductIds.has(match.productId)) ||
      input.stockNames.has(norm);
    if (inStock) continue;

    // Ya en la lista (por producto emparejado o por nombre): no re-añadir.
    const onList =
      (match !== null && input.listProductIds.has(match.productId)) ||
      input.listNames.has(norm);
    if (onList) continue;

    // Dedup: por producto emparejado o, si es texto libre, por nombre.
    const key = match ? `p:${match.productId}` : `n:${norm}`;
    if (seen.has(key)) continue;
    seen.add(key);

    result.push({
      key,
      ingredientName: ing.name,
      unit: ing.unit,
      match,
    });
  }

  return result;
}
