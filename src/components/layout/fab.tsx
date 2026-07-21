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
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "pointer-events-none fixed inset-x-0 bottom-fab z-40 mx-auto flex max-w-lg justify-end px-4",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** Estilo del botón dentro de un `Fab` (tamaño táctil grande y sombra). */
export const fabButtonClass =
  "pointer-events-auto size-14 rounded-full shadow-lg active:scale-95";
