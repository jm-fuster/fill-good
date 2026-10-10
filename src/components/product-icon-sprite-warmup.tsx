"use client";

import { useEffect, useState } from "react";

import { PRODUCT_ICON_SPRITE_URL } from "@/lib/product-icons/sprite-url";

/**
 * Carga el sprite de iconos de producto en reposo, para que el primer icono que
 * se monte en el navegador (una fila nueva, un modal, la pantalla a la que se
 * navega) lo encuentre ya listo y no aparezca un instante después que el resto.
 * Los iconos que vienen del servidor no lo necesitan (ver `ProductIcon`).
 *
 * En reposo y no al montar: el service worker despacha las peticiones en cola,
 * y pedido junto al JS de la página el sprite esperaba detrás de los ~20 trozos
 * de la carga (medido: más de 150 ms), retrasando de paso al propio JS.
 * Un `<use>` invisible y no un `fetch`: así el navegador además lo interpreta y
 * lo deja listo en el documento, que es lo que hace instantáneo el siguiente.
 * Apunta a un id que no existe a propósito: para cargar el archivo basta la
 * URL, y nombrar un icono de verdad obligaría a importar el catálogo aquí, en
 * el shell de todas las pantallas.
 */
export function ProductIconSpriteWarmup() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const warm = () => setReady(true);
    if ("requestIdleCallback" in window) {
      const id = window.requestIdleCallback(warm, { timeout: 3000 });
      return () => window.cancelIdleCallback(id);
    }
    const id = setTimeout(warm, 1000);
    return () => clearTimeout(id);
  }, []);

  if (!ready) return null;
  return (
    <svg
      width="0"
      height="0"
      aria-hidden
      focusable="false"
      className="pointer-events-none absolute"
    >
      <use href={`${PRODUCT_ICON_SPRITE_URL}#precarga`} />
    </svg>
  );
}
