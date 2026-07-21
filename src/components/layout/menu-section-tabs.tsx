import Link from "next/link";

import { cn } from "@/lib/utils";

const SEGMENTS = [
  { key: "semana", href: "/menus", label: "Semana" },
  { key: "recetario", href: "/recetas", label: "Recetario" },
] as const;

/**
 * Conmutador segmentado entre la vista de la semana (`/menus`) y el recetario
 * (`/recetas`). Son enlaces (navegan entre páginas), no tabs ARIA: el activo se
 * marca con `aria-current="page"`. Targets táctiles ≥ 44px (`min-h-11`).
 */
export function MenuSectionTabs({
  active,
}: {
  active: "semana" | "recetario";
}) {
  return (
    <nav
      aria-label="Secciones de menús"
      className="flex w-full gap-1 rounded-lg border bg-muted p-1"
    >
      {SEGMENTS.map((segment) => {
        const isActive = segment.key === active;
        return (
          <Link
            key={segment.key}
            href={segment.href}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "flex min-h-11 flex-1 items-center justify-center rounded-md px-3 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
              isActive
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
