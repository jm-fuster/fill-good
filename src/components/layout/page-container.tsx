import { cn } from "@/lib/utils";

/**
 * Contenedor de ancho por tipo de página (E11). Centra el contenido dentro del
 * inset del shell y le pone un ancho máximo adecuado en escritorio; en móvil
 * todas las variantes quedan en `max-w-lg` (la experiencia de siempre).
 *
 *  - `narrow`  — flujos enfocados y formularios (escanear, revisión de
 *    caducidades): siempre `max-w-lg`.
 *  - `default` — listas de 1 columna legibles (lista, ajustes, precios,
 *    revisar ticket).
 *  - `wide`    — grids y datos (inventario, menús, recetas, detalle de precios).
 *
 * El ancho SIEMPRE se gestiona aquí, no en las páginas ni en el shell.
 */
export type PageContainerVariant = "narrow" | "default" | "wide";

const VARIANT_CLASSES: Record<PageContainerVariant, string> = {
  narrow: "max-w-lg",
  default: "max-w-lg md:max-w-2xl",
  wide: "max-w-lg md:max-w-3xl lg:max-w-5xl xl:max-w-6xl",
};

export function PageContainer({
  variant = "default",
  className,
  children,
}: {
  variant?: PageContainerVariant;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("mx-auto w-full", VARIANT_CLASSES[variant], className)}>
      {children}
    </div>
  );
}
