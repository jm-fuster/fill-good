/**
 * Ranking PURO (sin I/O, sin IA) de "¿Qué hago hoy?" (M6): sugiere recetas del
 * recetario cocinables ahora mismo con lo que hay, priorizando lo que caduca.
 *
 * Usa el mismo matching en tres niveles que `missing.ts` (product_id → nombre
 * exacto → fuzzy trigram) pero necesita también los ingredientes que SÍ están en
 * stock (para el bonus de caducidad), así que resuelve el match por su cuenta en
 * vez de llamar a `computeMissingIngredients` (que solo devuelve los que faltan).
 *
 * score = %ingredientes_en_stock (peso alto)
 *       + bonus si aprovecha productos "consumir pronto"
 *       + apetencia (rating alto + tiempo sin cocinarse)
 *       − penalización si se cocinó esta semana
 */
import { normalizeName } from "@/lib/normalize";
import {
  DEFAULT_FUZZY_THRESHOLD,
  MIN_FUZZY_LENGTH,
  trigramSimilarity,
} from "@/lib/similarity";
import { relativeDaysLabel } from "@/lib/dates";
import type { CatalogEntry, MatchKind } from "./missing";

export type TonightIngredient = { name: string; productId: string | null };
export type TonightRecipe = {
  id: string;
  name: string;
  ingredients: TonightIngredient[];
};
export type TonightSoonInfo = {
  name: string;
  days: number | null;
  expired: boolean;
};
export type TonightSignal = {
  avgRating: number | null;
  lastCookedAt: string | null;
};

export type TonightInput = {
  recipes: TonightRecipe[];
  catalog: CatalogEntry[];
  stockProductIds: ReadonlySet<string>;
  stockNames: ReadonlySet<string>;
  soonByProduct: ReadonlyMap<string, TonightSoonInfo>;
  signals: ReadonlyMap<string, TonightSignal>;
  todayISO: string;
  limit?: number;
  fuzzyThreshold?: number;
};

export type TonightCard = {
  recipeId: string;
  name: string;
  /** 0 = tienes todo; 1 = falta uno (0–1 = cocinable ahora o casi). */
  missingCount: number;
  missingName: string | null;
  reason: string;
  score: number;
};

type Resolved = { productId: string; kind: MatchKind } | null;

const DEFAULT_LIMIT = 3;
/** Días desde la última vez cocinada por debajo de los cuales penaliza (descanso). */
const RECENT_COOK_DAYS = 7;

function daysBetween(fromISO: string, toISO: string): number {
  const from = new Date(`${fromISO}T00:00:00`).getTime();
  const to = new Date(`${toISO}T00:00:00`).getTime();
  return Math.floor((to - from) / 86_400_000);
}

function soonReason(info: TonightSoonInfo): string {
  if (info.expired) return `${info.name} ya ha caducado`;
  if (info.days === null) return `Conviene gastar ${info.name} pronto`;
  if (info.days <= 0) return `${info.name} caduca hoy`;
  if (info.days === 1) return `${info.name} caduca mañana`;
  return `${info.name} caduca en ${info.days} días`;
}

export function rankTonight(input: TonightInput): TonightCard[] {
  const threshold = input.fuzzyThreshold ?? DEFAULT_FUZZY_THRESHOLD;
  const limit = input.limit ?? DEFAULT_LIMIT;

  const catalogById = new Map(input.catalog.map((c) => [c.id, c]));
  const catalogByNorm = new Map<string, CatalogEntry>();
  for (const c of input.catalog) {
    if (!catalogByNorm.has(c.normalizedName)) {
      catalogByNorm.set(c.normalizedName, c);
    }
  }

  function resolve(name: string, productId: string | null, norm: string): Resolved {
    if (productId && catalogById.has(productId)) {
      return { productId, kind: "product_id" };
    }
    const exact = catalogByNorm.get(norm);
    if (exact) return { productId: exact.id, kind: "exact" };
    if (norm.length >= MIN_FUZZY_LENGTH) {
      let best: { id: string; score: number } | null = null;
      for (const c of input.catalog) {
        const score = trigramSimilarity(norm, c.normalizedName);
        if (score >= threshold && (best === null || score > best.score)) {
          best = { id: c.id, score };
        }
      }
      if (best) return { productId: best.id, kind: "fuzzy" };
    }
    return null;
  }

  const cards: TonightCard[] = [];

  for (const recipe of input.recipes) {
    // Ingredientes distintos (por producto emparejado o por nombre).
    const seen = new Set<string>();
    let total = 0;
    let missingCount = 0;
    let missingName: string | null = null;
    let soon: TonightSoonInfo | null = null;

    for (const ing of recipe.ingredients) {
      const norm = normalizeName(ing.name);
      if (!norm) continue;
      const match = resolve(ing.name, ing.productId, norm);
      const key = match ? `p:${match.productId}` : `n:${norm}`;
      if (seen.has(key)) continue;
      seen.add(key);
      total += 1;

      const inStock =
        (match !== null && input.stockProductIds.has(match.productId)) ||
        input.stockNames.has(norm);
      if (!inStock) {
        missingCount += 1;
        if (missingName === null) missingName = ing.name;
        continue;
      }
      // En stock: ¿es un producto que conviene gastar pronto?
      if (match) {
        const info = input.soonByProduct.get(match.productId);
        if (info) {
          const moreUrgent =
            soon === null ||
            (info.expired && !soon.expired) ||
            (info.days !== null &&
              (soon.days === null || info.days < soon.days));
          if (moreUrgent) soon = info;
        }
      }
    }

    if (total === 0) continue;
    // Solo cocinables ahora o casi (0–1 faltantes).
    if (missingCount > 1) continue;

    const inStockRatio = (total - missingCount) / total;
    let score = inStockRatio * 100;
    if (soon) score += soon.expired ? 45 : 35;

    const sig = input.signals.get(recipe.id);
    const rating = sig?.avgRating ?? null;
    score += (rating ?? 3) * 4;

    const lastCookedAt = sig?.lastCookedAt ?? null;
    let daysSinceCooked: number | null = null;
    if (lastCookedAt) {
      daysSinceCooked = daysBetween(lastCookedAt, input.todayISO);
      if (daysSinceCooked <= RECENT_COOK_DAYS) score -= 40;
      else score += Math.min(daysSinceCooked, 30) * 0.5;
    } else {
      score += 12; // nunca cocinada: apetece probarla
    }

    // Razón mostrada: siempre un factor REAL del score (nunca genérico falso).
    let reason: string;
    if (soon) {
      reason = soonReason(soon);
    } else if (lastCookedAt === null) {
      reason = "Aún no la has cocinado";
    } else if (daysSinceCooked !== null && daysSinceCooked >= 14) {
      reason = `Hace ${relativeDaysLabel(lastCookedAt).replace(/^hace /, "")} que no la haces`;
    } else if (rating !== null && rating >= 4) {
      reason = `Os gusta (${rating.toFixed(1)}★)`;
    } else {
      reason =
        missingCount === 0
          ? "Cocinable con lo que tienes"
          : "Casi la tienes en casa";
    }

    cards.push({
      recipeId: recipe.id,
      name: recipe.name,
      missingCount,
      missingName,
      reason,
      score,
    });
  }

  return cards.sort((a, b) => b.score - a.score).slice(0, limit);
}
