import { cn } from "@/lib/utils";
import { ICON_BODIES } from "@/lib/product-icons/registry";
import { DEFAULT_ICON_SLUG } from "@/lib/product-icons/catalog";
import {
  resolveProductIcon,
  type ResolvedIcon,
} from "@/lib/product-icons/guess";

/**
 * Icono de producto (L16). Renderiza el SVG monocromo del registro (Fluent Emoji
 * High Contrast, MIT) teñido con `currentColor`, o el emoji de la categoría como
 * reserva si el hogar usa uno personalizado. Sin interactividad ni estado: sirve
 * tanto en Server como en Client Components.
 *
 * Uso en celdas de producto: `<ProductIcon slug={productIcon} name={productName}
 * categoryIcon={categoryIcon} />`. En cabeceras de categoría basta `categoryIcon`.
 * El color lo hereda del contenedor (`text-*`); el tamaño se controla con `size`.
 */
export function ProductIcon({
  slug,
  name,
  categoryIcon,
  resolved,
  size = 24,
  className,
}: {
  /** Override manual (`products.icon`); si no es un slug conocido se ignora. */
  slug?: string | null;
  /** Nombre del producto, para adivinar el icono cuando no hay override. */
  name?: string | null;
  /** Icono de la categoría (emoji o slug), última reserva antes del genérico. */
  categoryIcon?: string | null;
  /** Resolución ya calculada (evita recomputar); tiene prioridad sobre el resto. */
  resolved?: ResolvedIcon;
  /** Tamaño del glifo en px (por defecto 24). */
  size?: number;
  className?: string;
}) {
  const r = resolved ?? resolveProductIcon({ icon: slug, name, categoryIcon });

  if (r.kind === "emoji") {
    return (
      <span
        aria-hidden
        className={cn(
          "inline-flex shrink-0 items-center justify-center leading-none",
          className,
        )}
        style={{ width: size, height: size, fontSize: Math.round(size * 0.9) }}
      >
        {r.emoji}
      </span>
    );
  }

  const entry = ICON_BODIES[r.slug] ?? ICON_BODIES[DEFAULT_ICON_SLUG];
  return (
    <svg
      viewBox={entry.vb}
      width={size}
      height={size}
      aria-hidden
      focusable="false"
      className={cn("shrink-0", className)}
      dangerouslySetInnerHTML={{ __html: entry.body }}
    />
  );
}
