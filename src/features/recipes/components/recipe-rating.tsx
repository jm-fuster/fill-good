"use client";

import { useRef, useState, useTransition } from "react";
import { Star } from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { formatRating } from "../constants";
import { rateRecipeAction } from "../actions";

const STARS = [1, 2, 3, 4, 5] as const;

/**
 * Valoración por estrellas (1–5) del usuario actual, con la media del hogar.
 *
 * Accesibilidad: radiogroup con tabindex móvil (roving) y flechas para cambiar
 * de estrella, cada opción con label ("N estrellas"). Targets de 44px. La media
 * se anuncia con aria-live al cambiar.
 */
export function RecipeRating({
  recipeId,
  initialUserRating,
  avg,
  count,
}: {
  recipeId: string;
  initialUserRating: number | null;
  avg: number | null;
  count: number;
}) {
  const [value, setValue] = useState(initialUserRating ?? 0);
  const [hover, setHover] = useState(0);
  const [avgState, setAvgState] = useState(avg);
  const [countState, setCountState] = useState(count);
  const [pending, startTransition] = useTransition();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  const display = hover || value;

  function choose(rating: number) {
    if (rating === value || pending) return;
    const prev = { value, avg: avgState, count: countState };

    // Actualización optimista de la media local: sustituye el voto previo del
    // usuario o añade uno nuevo si es su primera valoración.
    const isNew = prev.value === 0;
    const prevTotal = (prev.avg ?? 0) * prev.count;
    const newCount = isNew ? prev.count + 1 : prev.count;
    const newTotal = prevTotal - (isNew ? 0 : prev.value) + rating;
    setValue(rating);
    setCountState(newCount);
    setAvgState(newCount ? newTotal / newCount : null);

    startTransition(async () => {
      const r = await rateRecipeAction(recipeId, rating);
      if (r.error) {
        setValue(prev.value);
        setAvgState(prev.avg);
        setCountState(prev.count);
        toast.error(r.error);
      }
    });
  }

  function focusAndChoose(rating: number) {
    const clamped = Math.max(1, Math.min(5, rating));
    refs.current[clamped - 1]?.focus();
    choose(clamped);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    switch (e.key) {
      case "ArrowRight":
      case "ArrowUp":
        e.preventDefault();
        focusAndChoose(value ? value + 1 : 1);
        break;
      case "ArrowLeft":
      case "ArrowDown":
        e.preventDefault();
        focusAndChoose(value ? value - 1 : 1);
        break;
      case "Home":
        e.preventDefault();
        focusAndChoose(1);
        break;
      case "End":
        e.preventDefault();
        focusAndChoose(5);
        break;
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-xl border bg-card p-4">
      <p className="text-sm font-medium">Tu valoración</p>
      <div
        role="radiogroup"
        aria-label="Tu valoración de la receta"
        className="flex items-center gap-0.5"
        onKeyDown={onKeyDown}
        onMouseLeave={() => setHover(0)}
      >
        {STARS.map((n) => {
          const checked = n === value;
          // Roving tabindex: solo la estrella marcada (o la 1ª si no hay voto)
          // es tabbable; el resto se navega con flechas.
          const tabbable = value ? checked : n === 1;
          return (
            <button
              key={n}
              ref={(el) => {
                refs.current[n - 1] = el;
              }}
              type="button"
              role="radio"
              aria-checked={checked}
              aria-label={`${n} ${n === 1 ? "estrella" : "estrellas"}`}
              tabIndex={tabbable ? 0 : -1}
              disabled={pending}
              onClick={() => choose(n)}
              onMouseEnter={() => setHover(n)}
              className="flex size-11 items-center justify-center rounded-lg transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-60"
            >
              <Star
                className={cn(
                  "size-6 transition-colors",
                  n <= display
                    ? "fill-chart-3 text-chart-3"
                    : "text-muted-foreground",
                )}
                aria-hidden
              />
            </button>
          );
        })}
      </div>
      <p className="text-sm text-muted-foreground" aria-live="polite">
        {countState > 0 && avgState != null
          ? `★ ${formatRating(avgState)} · ${countState} ${
              countState === 1 ? "voto" : "votos"
            }`
          : "Aún sin valoraciones"}
      </p>
    </div>
  );
}
