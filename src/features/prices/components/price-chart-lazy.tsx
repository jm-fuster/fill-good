"use client";

import dynamic from "next/dynamic";

/**
 * `PriceChart` en su propio trozo de JS. recharts son ~100 KB gz, y en el JS de
 * entrada de /precios/[productId] la página entera esperaba a descargarlos y
 * ejecutarlos para hidratarse, aunque lo único que los necesita es la gráfica.
 *
 * Con SSR (el valor por defecto, y a propósito): el servidor sigue pintando la
 * gráfica en el HTML, así que se ve igual que antes desde el primer pintado; lo
 * único que llega después es su interactividad (el tooltip), cuando el trozo
 * está listo, sin retener la hidratación del resto de la pantalla. Tiene que
 * vivir en un componente de cliente: llamado desde el Server Component de la
 * página, `next/dynamic` no parte el código.
 */
export const PriceChartLazy = dynamic(() =>
  import("./price-chart").then((m) => m.PriceChart),
);
