import { orderChains } from "@/features/prices/chains";

/**
 * Tienda elegida para ver y recorrer la lista (`localStorage`, por dispositivo).
 * Ausente = sin elegir: los pasillos van en el orden general del hogar.
 *
 * Es UNA sola respuesta para las dos pantallas: la eliges donde tiene sentido
 * preguntarla —delante de la estantería, en el modo compra— y `/lista` la
 * respeta al agrupar. Antes cada una decidía por su cuenta y el resultado era
 * que podías guardar el orden de pasillos de Lidl, verlo aplicado al comprar, y
 * que la lista de casa siguiera enseñándote el orden general.
 */
export const ACTIVE_CHAIN_KEY = "lista:tienda";

/**
 * Tiendas entre las que se puede elegir: las del hogar MÁS las que aparezcan
 * como preferencia de algún artículo. Las del hogar entran aunque no haya nada
 * suyo en la lista —son las que pueden tener orden propio—, y las de los
 * artículos porque elegirlas sigue teniendo sentido aunque el hogar no las tenga
 * apuntadas.
 *
 * Acepta cualquier fila con `preferredChain`, que es lo único que mira: la de la
 * lista y la del modo compra son la misma fila en dos momentos distintos, y las
 * dos pantallas tienen que ofrecer exactamente las mismas tiendas.
 */
export function storeOptionsFor(
  chains: string[],
  items: { preferredChain?: string | null }[],
): string[] {
  const set = new Set(chains);
  for (const it of items) if (it.preferredChain) set.add(it.preferredChain);
  return orderChains([...set]);
}

/**
 * La tienda guardada, si sigue existiendo entre las opciones; si no, `null`
 * (orden general). Cambiar las tiendas del hogar o vaciar la lista no puede
 * dejar la pantalla mostrando el orden de una tienda que ya no está.
 */
export function resolveChain(
  stored: string | null,
  options: string[],
): string | null {
  return stored && options.includes(stored) ? stored : null;
}
