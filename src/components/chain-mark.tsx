import {
  chainInitial,
  chainMark,
  MARK_INK_DARK,
} from "@/features/prices/chain-marks";
import { chainLabel } from "@/features/prices/chains";
import { cn } from "@/lib/utils";

/**
 * Sello de una cadena: cuadradito con su inicial en el color de la marca (ver
 * `features/prices/chain-marks.ts`, que explica por qué no son los logotipos
 * oficiales y de dónde salen los colores).
 *
 * Es DECORATIVO (`aria-hidden`) y solo se pone donde el nombre de la tienda está
 * al lado: acelera reconocerla, no la identifica. Si algún día hace falta un
 * sello suelto, sin nombre, tendrá que llevar su propio texto accesible.
 *
 * Vive en `components/` y no en `components/ui/` porque no es de shadcn, igual
 * que `chain-chip.tsx`. Sin "use client": no tiene estado y así sirve tanto en
 * Server Components como dentro de los de cliente.
 *
 * El único sitio del repo donde un color de marca llega al DOM es el `style` de
 * aquí abajo. No es un color inventado ni un token del tema: es dato que viene de
 * `CHAIN_MARKS`, y por eso no puede expresarse con clases de Tailwind.
 */
export function ChainMark({
  chain,
  size = "sm",
  className,
}: {
  /** Clave de cadena o nombre de una tienda propia del hogar. */
  chain: string;
  /** `sm` para badges de 11 px · `md` para filas y chips. */
  size?: "sm" | "md";
  className?: string;
}) {
  const mark = chainMark(chain);
  const label = chainLabel(chain);

  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex shrink-0 items-center justify-center font-bold select-none",
        size === "sm"
          ? "size-3.5 rounded-[3px] text-[9px]"
          : "size-5 rounded-[5px] text-[11px]",
        // Sin color de marca (tiendas propias, «otros»): sello neutro del tema.
        mark === null && "bg-muted text-muted-foreground",
        className,
      )}
      style={
        mark
          ? {
              backgroundColor: mark.fill,
              color: mark.ink === "light" ? "#FFFFFF" : MARK_INK_DARK,
            }
          : undefined
      }
    >
      {chainInitial(label)}
    </span>
  );
}
