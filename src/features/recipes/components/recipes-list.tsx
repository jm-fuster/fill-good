"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { normalizeName } from "@/lib/normalize";
import { relativeDaysLabel } from "@/lib/dates";
import type { RecipeSignals, SavedRecipe } from "../queries";
import {
  formatRating,
  MEAL_TYPE_LABELS,
  SEASON_ICONS,
  SEASON_LABELS,
  seasonsToChoice,
} from "../constants";

type MealFilter = "all" | "lunch" | "dinner";

const MEAL_FILTERS: { value: MealFilter; label: string }[] = [
  { value: "all", label: "Todas" },
  { value: "lunch", label: "Comida" },
  { value: "dinner", label: "Cena" },
];

export function RecipesList({
  recipes,
  signals,
}: {
  recipes: SavedRecipe[];
  signals?: Record<string, RecipeSignals>;
}) {
  const [query, setQuery] = useState("");
  const [meal, setMeal] = useState<MealFilter>("all");

  const filtered = useMemo(() => {
    const q = normalizeName(query);
    return recipes.filter((r) => {
      if (meal !== "all" && !r.mealTypes.includes(meal)) return false;
      if (q && !normalizeName(r.name).includes(q)) return false;
      return true;
    });
  }, [recipes, query, meal]);

  return (
    <div className="flex flex-col gap-4 pb-fab md:pb-0">
      <div className="relative">
        <Search
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar receta…"
          aria-label="Buscar receta"
          className="pl-9"
        />
      </div>

      <div
        role="group"
        aria-label="Filtrar por tipo de comida"
        className="flex gap-2"
      >
        {MEAL_FILTERS.map((f) => {
          const active = meal === f.value;
          return (
            <Button
              key={f.value}
              type="button"
              aria-pressed={active}
              variant={active ? "default" : "outline"}
              onClick={() => setMeal(f.value)}
              className="flex-1"
            >
              {f.label}
            </Button>
          );
        })}
      </div>

      {filtered.length === 0 ? (
        <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
          No hay recetas que coincidan con la búsqueda.
        </p>
      ) : (
        <ul className="flex flex-col gap-2 md:grid md:grid-cols-2 md:gap-3 lg:grid-cols-3">
          {filtered.map((recipe) => {
            const seasonChoice = seasonsToChoice(recipe.seasons);
            const sig = signals?.[recipe.id];
            const hasRating = Boolean(sig && sig.ratingCount > 0 && sig.avgRating != null);
            const hasCooked = Boolean(sig && sig.timesCooked > 0);
            return (
              <li key={recipe.id}>
                <Link
                  href={`/recetas/${recipe.id}`}
                  className={cn(
                    "flex h-full flex-col gap-2 rounded-xl border bg-card p-3 transition-colors hover:bg-muted",
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-medium text-balance">
                      {recipe.name}
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {recipe.ingredientCount}{" "}
                      {recipe.ingredientCount === 1
                        ? "ingrediente"
                        : "ingredientes"}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {recipe.mealTypes.map((m) => (
                      <Badge key={m} variant="secondary">
                        {MEAL_TYPE_LABELS[m] ?? m}
                      </Badge>
                    ))}
                    <Badge variant="outline">
                      <span aria-hidden>{SEASON_ICONS[seasonChoice]}</span>{" "}
                      {SEASON_LABELS[seasonChoice]}
                    </Badge>
                  </div>
                  {sig && (hasRating || hasCooked) ? (
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      {hasRating ? (
                        <span>
                          <span aria-hidden>★</span> {formatRating(sig.avgRating!)}{" "}
                          · {sig.ratingCount}{" "}
                          {sig.ratingCount === 1 ? "voto" : "votos"}
                        </span>
                      ) : null}
                      {hasCooked ? (
                        <span>
                          Hecha {sig.timesCooked}{" "}
                          {sig.timesCooked === 1 ? "vez" : "veces"}
                          {sig.lastCookedAt
                            ? ` · última vez ${relativeDaysLabel(sig.lastCookedAt)}`
                            : ""}
                        </span>
                      ) : null}
                    </div>
                  ) : null}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
