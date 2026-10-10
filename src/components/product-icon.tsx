import { cn } from "@/lib/utils";
import { DEFAULT_ICON_SLUG, isKnownIcon } from "@/lib/product-icons/catalog";
import {
  resolveProductIcon,
  type ResolvedIcon,
} from "@/lib/product-icons/guess";
import { ICON_VIEWBOXES } from "@/lib/product-icons/slugs";
import { PRODUCT_ICON_SPRITE_URL } from "@/lib/product-icons/sprite-url";

/*
 * Los dibujos, SOLO fuera del navegador. `process.browser` lo fija Next al
 * compilar (`true` en el JS del navegador), así que en ese JS la rama del
 * `require` es código muerto y el registro no entra: eran ~70 KB gz en cada
 * pantalla que pinta un icono, por delante de su hidratación.
 * `check-bundle-budget` falla si el registro vuelve a aparecer en el JS del
 * navegador, que es lo único que garantiza que esto siga siendo verdad.
 */
const SERVER_BODIES: Record<string, { vb: string; body: string }> | null =
  process.browser
    ? null
    : // eslint-disable-next-line @typescript-eslint/no-require-imports -- un `import` estático metería el registro en el JS del navegador; el `require` vive en una rama que Next elimina al compilar para el navegador (ver arriba).
      require("@/lib/product-icons/registry").ICON_BODIES;

/**
 * Icono de producto (L16). Renderiza el SVG a color del registro (Fluent Emoji Flat,
 * MIT), o el emoji de la categoría como reserva si el hogar usa uno personalizado.
 * Sin interactividad ni estado: sirve tanto en Server como en Client Components.
 *
 * Uso en celdas de producto: `<ProductIcon slug={productIcon} name={productName}
 * categoryIcon={categoryIcon} />`. En cabeceras de categoría basta `categoryIcon`.
 *
 * El color es INTRÍNSECO: cada SVG trae sus rellenos, así que pasar `text-*` en
 * `className` no tiñe nada (solo afectaría al emoji de reserva). Para atenuar un
 * icono usa `opacity-*`, que sí funciona en ambos casos. El tamaño va en `size`.
 *
 * DE DÓNDE SALE EL DIBUJO, que no es obvio y del que depende que no parpadee:
 *  · en el servidor, el dibujo va DENTRO del HTML, como siempre: los iconos
 *    salen en el primer pintado, sin esperar a nada;
 *  · en el navegador, el componente pinta `<use href="sprite.svg#slug">`, que
 *    no necesita el registro. Al hidratar, React NO reescribe el contenido de
 *    un `dangerouslySetInnerHTML` (en producción ni lo compara), y después
 *    solo lo toca cuando cambia el texto, que para un mismo icono no cambia
 *    nunca: el dibujo que vino del servidor se queda donde está.
 * Así que el sprite solo lo usan los iconos que se montan en el navegador (una
 * fila nueva, un modal, la página a la que se navega), y para entonces ya está
 * cargado: lo pide en reposo `ProductIconSpriteWarmup`, desde el shell.
 * `suppressHydrationWarning` calla en desarrollo el aviso de esa diferencia, que
 * es intencionada.
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

  const id = isKnownIcon(r.slug) ? r.slug : DEFAULT_ICON_SLUG;
  return (
    <svg
      viewBox={ICON_VIEWBOXES[id]}
      width={size}
      height={size}
      aria-hidden
      focusable="false"
      className={cn("shrink-0", className)}
      dangerouslySetInnerHTML={{
        __html: SERVER_BODIES
          ? SERVER_BODIES[id].body
          : `<use href="${PRODUCT_ICON_SPRITE_URL}#${id}"/>`,
      }}
      suppressHydrationWarning
    />
  );
}
