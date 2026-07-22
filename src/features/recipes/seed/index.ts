import "server-only";

import type { UnitType } from "@/lib/supabase/types";
import rawSeed from "./recetas-iniciales.json";

/** Una receta del pack curado del repo (N4). Solo se importa en servidor. */
export type SeedRecipe = {
  id: string;
  name: string;
  description: string;
  mealTypes: string[];
  seasons: string[];
  vegetarian: boolean;
  vegan: boolean;
  glutenFree: boolean;
  servings: number;
  ingredients: {
    name: string;
    quantity: number | null;
    unit: UnitType | null;
  }[];
};

type RawSeedRecipe = {
  id: string;
  name: string;
  description: string;
  meal_types: string[];
  seasons: string[];
  vegetarian: boolean;
  vegan: boolean;
  gluten_free: boolean;
  servings: number;
  ingredients: { name: string; quantity: number | null; unit: string | null }[];
};

/** Pack curado ya normalizado a camelCase. Inmutable. */
export const SEED_RECIPES: SeedRecipe[] = (rawSeed as RawSeedRecipe[]).map(
  (r) => ({
    id: r.id,
    name: r.name,
    description: r.description,
    mealTypes: r.meal_types,
    seasons: r.seasons,
    vegetarian: r.vegetarian,
    vegan: r.vegan,
    glutenFree: r.gluten_free,
    servings: r.servings,
    ingredients: r.ingredients.map((i) => ({
      name: i.name,
      quantity: i.quantity,
      unit: (i.unit as UnitType | null) ?? null,
    })),
  }),
);

/** Busca una receta del pack por su id estable (slug). */
export function getSeedRecipeById(id: string): SeedRecipe | undefined {
  return SEED_RECIPES.find((r) => r.id === id);
}
