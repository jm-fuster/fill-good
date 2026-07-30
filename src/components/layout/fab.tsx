import { cn } from "@/lib/utils";

/**
 * Contenedor del botón de acción flotante (FAB): fijo abajo a la derecha,
 * alineado a la columna de contenido (max-w-lg, como la bottom nav). El wrapper
 * no captura toques salvo en su contenido (el propio botón, con `fabButtonClass`
 * que reactiva `pointer-events`).
 */
export function Fab({
  children,
  className,
  bottomClass = "bottom-fab",
}: {
  children: React.ReactNode;
  className?: string;
  /**
   * Altura a la que flota, por si la pantalla no tiene bottom nav debajo (el
   * modo compra, que es un overlay a pantalla completa: `bottom-fab-flush` /
   * `bottom-fab-stacked`).
   *
   * Va en su propia prop y no en `className` porque `bottom-fab*` son utilidades
   * propias del proyecto, y de esas tailwind-merge no sabe que se pisan entre
   * sí: pasadas por `className` conviviría con el defecto en vez de sustituirlo.
   */
  bottomClass?: string;
}) {
  return (
    <div
      className={cn(
        "pointer-events-none fixed inset-x-0 z-40 mx-auto flex max-w-lg justify-end px-4",
        bottomClass,
        className,
      )}
    >
      {children}
    </div>
  );
}

/** Estilo del botón dentro de un `Fab` (tamaño táctil grande y sombra). */
export const fabButtonClass =
  "pointer-events-auto size-14 rounded-full shadow-lg transition-transform active:scale-95";
