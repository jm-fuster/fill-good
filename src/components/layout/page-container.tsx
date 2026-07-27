import { cn } from "@/lib/utils";

/**
 * Contenedor de la columna de contenido (E11). Centra el contenido dentro del
 * inset del shell y le pone el ancho máximo del sistema; en móvil siempre es
 * `max-w-lg` (la experiencia de siempre).
 *
 * **La app tiene un único ancho**: todas sus páginas usan `app` (el valor por
 * defecto), así los márgenes en escritorio no cambian al navegar entre
 * inventario, lista, menús, precios o ajustes. En páginas de la app NO se pasa
 * `variant`.
 *
 * Las otras variantes existen solo para superficies de texto largo fuera de la
 * app, donde una medida más corta sí ayuda a leer:
 *  - `prose`  — páginas legales.
 *  - `narrow` — bloques estrechos de la landing (FAQ).
 *
 * El ancho SIEMPRE se gestiona aquí, no en las páginas ni en el shell.
 */
export type PageContainerVariant = "app" | "prose" | "narrow";

const VARIANT_CLASSES: Record<PageContainerVariant, string> = {
  app: "max-w-lg md:max-w-3xl lg:max-w-5xl xl:max-w-6xl",
  prose: "max-w-lg md:max-w-2xl",
  narrow: "max-w-lg",
};

export function PageContainer({
  variant = "app",
  className,
  children,
}: {
  variant?: PageContainerVariant;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    // La entrada animada (fade + 4px de subida) suaviza tanto la aparición del
    // skeleton como el reemplazo skeleton→contenido en cada navegación. Solo
    // corre al montar (CSS puro, transform/opacity); reduced-motion la anula.
    <div
      className={cn(
        // Al imprimir manda el ancho del papel: los topes de escritorio dejarían
        // media hoja en blanco (el menú semanal sale en horizontal, D5).
        "mx-auto w-full animate-in fade-in slide-in-from-bottom-1 duration-200 print:max-w-none",
        VARIANT_CLASSES[variant],
        className,
      )}
    >
      {children}
    </div>
  );
}
