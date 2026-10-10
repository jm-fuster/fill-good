"use client";

import { esES } from "@clerk/localizations/es-ES";
import { shadcn } from "@clerk/ui/themes";

/*
 * Idioma y tema de Clerk, en un módulo de CLIENTE a propósito.
 *
 * El layout raíz es un Server Component, y todo objeto que le pasa a
 * `ClerkProvider` viaja serializado en el payload RSC: con `esES` escrito ahí,
 * cada documento llevaba incrustados ~80 KB de traducciones (en `/offline`,
 * que casi no pinta nada, eran el 75 % del HTML), y cada `router.refresh()` o
 * Server Action que revalida —las dos vuelven a pedir también los layouts
 * compartidos, el raíz incluido— los volvía a mandar. Exportados desde
 * aquí, el servidor solo ve una referencia de cliente: el payload lleva el id
 * del módulo y el objeto llega con el JS del layout, que el service worker
 * guarda y el navegador no vuelve a descargar.
 *
 * Por eso el layout no puede LEER estos valores (en el servidor son una
 * referencia, no el objeto): solo pasarlos tal cual a `ClerkProvider`.
 */
export const clerkLocalization = esES;

export const clerkAppearance = { theme: shadcn };
