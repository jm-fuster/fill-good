"use client";

import Link from "next/link";

import { cn } from "@/lib/utils";
import { useOptimisticNav } from "@/components/layout/use-optimistic-nav";

const SEGMENTS = [
  { key: "semana", href: "/menus", label: "Semana" },
  { key: "recetario", href: "/recetas", label: "Recetario" },
] as const;

/**
 * Conmutador segmentado entre la vista de la semana (`/menus`) y el recetario
 * (`/recetas`). Son enlaces (navegan entre páginas), no tabs ARIA: el activo se
 * marca con `aria-current="page"`. Targets táctiles ≥ 44px (`min-h-11`).
 *
 * El resaltado es optimista (misma pauta que la bottom nav): la píldora se
 * mueve al tocar, sin esperar a que la navegación termine. `aria-current`
 * sigue al prop `active` (la verdad del servidor para la página renderizada).
 */
export function MenuSectionTabs({
  active,
}: {
  active: "semana" | "recetario";
}) {
  const { navPath, markPressed } = useOptimisticNav();
  const optimisticActive = navPath.startsWith("/recetas")
    ? "recetario"
    : navPath.startsWith("/menus")
      ? "semana"
      : active;

  return (
    <nav
      aria-label="Secciones de menús"
      className="flex w-full gap-1 rounded-lg border bg-muted p-1"
    >
      {SEGMENTS.map((segment) => {
        const isCurrent = segment.key === active;
        const isHighlighted = segment.key === optimisticActive;
        return (
          <Link
            key={segment.key}
            href={segment.href}
            onClick={() => markPressed(segment.href)}
            aria-current={isCurrent ? "page" : undefined}
            className={cn(
              "flex min-h-11 flex-1 items-center justify-center rounded-md px-3 text-sm font-medium transition-[color,background-color,box-shadow,transform] active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
              isHighlighted
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {segment.label}
          </Link>
        );
      })}
    </nav>
  );
}
