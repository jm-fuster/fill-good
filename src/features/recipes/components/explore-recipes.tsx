"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronDown, Compass, Plus } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { SeedRecipeCard } from "../queries";
import { MEAL_TYPE_LABELS, SEASON_LABELS } from "../constants";
import { importSeedRecipeAction } from "../actions";

type SeasonFilter = "all" | "winter" | "summer";
type MealFilter = "all" | "lunch" | "dinner";
type DietFilter = "all" | "vegetarian" | "vegan" | "gluten_free";

const DIET_LABELS: Record<DietFilter, string> = {
  all: "Cualquiera",
  vegetarian: "Vegetariano",
  vegan: "Vegano",
  gluten_free: "Sin gluten",
};

export function ExploreRecipes({
  cards,
  defaultOpen = false,
}: {
  cards: SeedRecipeCard[];
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [season, setSeason] = useState<SeasonFilter>("all");
  const [meal, setMeal] = useState<MealFilter>("all");
  const [diet, setDiet] = useState<DietFilter>("all");

  const filtered = useMemo(
    () =>
      cards.filter((c) => {
        if (
          season !== "all" &&
          !c.seasons.includes(season) &&
          !c.seasons.includes("all")
        ) {
          return false;
        }
        if (meal !== "all" && !c.mealTypes.includes(meal)) return false;
        if (diet === "vegetarian" && !c.vegetarian) return false;
        if (diet === "vegan" && !c.vegan) return false;
        if (diet === "gluten_free" && !c.glutenFree) return false;
        return true;
      }),
    [cards, season, meal, diet],
  );

  return (
    <section className="rounded-xl border">
      <h2>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls="explore-recipes-body"
          className="flex min-h-11 w-full items-center gap-2 p-3 text-left"
        >
          <Compass className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          <span className="font-medium">Explorar recetas</span>
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
            {cards.length}
          </span>
          <ChevronDown
            className={cn(
              "ml-auto size-4 shrink-0 text-muted-foreground transition-transform",
              open && "rotate-180",
            )}
            aria-hidden
          />
        </button>
      </h2>

      {open ? (
        <div id="explore-recipes-body" className="flex flex-col gap-3 px-3 pb-3">
          <p className="text-xs text-muted-foreground">
            Recetas españolas de diario para empezar tu recetario. Añade las que
            te gusten; luego puedes editarlas o borrarlas.
          </p>

          {/* Filtros */}
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <div className="flex flex-col gap-1">
              <Label htmlFor="explore-season" className="text-xs">
                Temporada
              </Label>
              <Select
                value={season}
                onValueChange={(v) => setSeason(v as SeasonFilter)}
              >
                <SelectTrigger id="explore-season">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Cualquiera</SelectItem>
                  <SelectItem value="winter">{SEASON_LABELS.winter}</SelectItem>
                  <SelectItem value="summer">{SEASON_LABELS.summer}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="explore-meal" className="text-xs">
                Momento
              </Label>
              <Select
                value={meal}
                onValueChange={(v) => setMeal(v as MealFilter)}
              >
                <SelectTrigger id="explore-meal">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Comida o cena</SelectItem>
                  <SelectItem value="lunch">{MEAL_TYPE_LABELS.lunch}</SelectItem>
                  <SelectItem value="dinner">
                    {MEAL_TYPE_LABELS.dinner}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="explore-diet" className="text-xs">
                Dieta
              </Label>
              <Select
                value={diet}
                onValueChange={(v) => setDiet(v as DietFilter)}
              >
                <SelectTrigger id="explore-diet">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(
                    Object.keys(DIET_LABELS) as DietFilter[]
                  ).map((k) => (
                    <SelectItem key={k} value={k}>
                      {DIET_LABELS[k]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {filtered.length === 0 ? (
            <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
              No hay recetas con esos filtros. Prueba a ampliarlos.
            </p>
          ) : (
            <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {filtered.map((card) => (
                <ExploreCard key={card.id} card={card} />
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </section>
  );
}

function ExploreCard({ card }: { card: SeedRecipeCard }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function importRecipe() {
    startTransition(async () => {
      const r = await importSeedRecipeAction(card.id);
      if (r.error) {
        toast.error(r.error);
        return;
      }
      toast.success("Añadida a tu recetario");
      router.refresh();
    });
  }

  const dietBadge = card.vegan
    ? "Vegano"
    : card.vegetarian
      ? "Vegetariano"
      : null;

  return (
    <li className="flex flex-col gap-2 rounded-xl border p-3">
      <div className="flex flex-col gap-1">
        <p className="font-medium">{card.name}</p>
        <p className="text-sm text-muted-foreground line-clamp-2">
          {card.description}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {card.seasons
          .filter((s) => s !== "all")
          .map((s) => (
            <Badge key={s} variant="outline">
              {SEASON_LABELS[s] ?? s}
            </Badge>
          ))}
        {dietBadge ? <Badge variant="secondary">{dietBadge}</Badge> : null}
        {card.glutenFree ? <Badge variant="secondary">Sin gluten</Badge> : null}
      </div>
      {card.alreadySaved ? (
        <Button type="button" variant="outline" disabled className="mt-auto">
          <Check aria-hidden />
          Ya en tu recetario
        </Button>
      ) : (
        <Button
          type="button"
          variant="outline"
          onClick={importRecipe}
          disabled={pending}
          className="mt-auto"
        >
          <Plus aria-hidden />
          {pending ? "Añadiendo…" : "Añadir a mi recetario"}
        </Button>
      )}
    </li>
  );
}
