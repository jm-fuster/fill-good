/**
 * Comprobaciones del motivo con el que se anuncia una sugerencia de compra. Lo
 * ejecuta `npm run check:motivos` (ver `scripts/check-suggestion-reason.mjs`, que
 * lo empaqueta con esbuild porque esto es TypeScript y tira del alias `@/`).
 *
 * Prueba `suggestionReasonLabel` / `suggestionReasonShort` de
 * `src/features/shopping-list/suggestion-reason.ts`, y existe por un acoplamiento
 * que no se ve leyendo esa función sola: en `getSuggestions` la fuente
 * "low_stock" gana la precedencia (manda la regla que escribió el usuario), así
 * que ABSORBE también los productos que se han quedado a CERO teniendo mínimo. El
 * rótulo lo desmiente mirando el `stock`, porque anunciar «bajo tu mínimo» de algo
 * que no queda es falso.
 *
 * Sin esta comprobación, la rama `stock <= 0` de `case "low_stock"` parece código
 * muerto —el motivo ya dice "low_stock", ¿para qué mirar el stock?— y es justo lo
 * que alguien borra limpiando. El compilador no se enteraría (los tipos siguen
 * cuadrando) y el lint tampoco: el fallo es un texto que miente, y solo se ve en
 * la pantalla del usuario. El mismo rótulo lo comparten `/lista`, el
 * autocompletado, el modo compra y el paso de «¿lo apuntamos?» al cocinar, o sea
 * que la mentira saldría en cuatro sitios a la vez.
 *
 * Lo que NO se prueba: qué fuente reclama cada producto (eso vive en
 * `getSuggestions` / `getRestockCandidates`, que consultan la base) ni el pintado.
 * Aquí solo se fija la traducción de (motivo + existencias) a palabras.
 */
import type { SuggestionReason } from "@/features/shopping-list/queries";
import {
  suggestionReasonLabel,
  suggestionReasonShort,
} from "@/features/shopping-list/suggestion-reason";

let fallos = 0;
function check(nombre: string, condicion: boolean, extra?: unknown) {
  if (condicion) {
    console.log(`  ok    ${nombre}`);
  } else {
    fallos += 1;
    console.log(
      `  FALLO ${nombre}`,
      extra === undefined ? "" : JSON.stringify(extra),
    );
  }
}

function seccion(titulo: string) {
  console.log(`\n${titulo}`);
}

/** Lo mínimo que el rótulo necesita (el `ReasonSource` del módulo). */
function fuente(
  reason: SuggestionReason,
  stock: number,
  intervalDays?: number,
): { reason: SuggestionReason; stock: number; intervalDays?: number } {
  return { reason, stock, intervalDays };
}

/** Comprueba el texto largo y de paso que ninguna rama devuelve vacío. */
function rotulo(nombre: string, fuente: Parameters<typeof suggestionReasonLabel>[0], esperado: string) {
  const real = suggestionReasonLabel(fuente);
  check(`${nombre} → «${real}»`, real === esperado, { esperado, real });
}

seccion("Se ha quedado a cero");
// El caso que motivó todo esto: con mínimo definido llega como "low_stock".
rotulo("con mínimo definido, manda el hecho", fuente("low_stock", 0), "Se ha agotado");
rotulo("sin mínimo, por su propia fuente", fuente("out_of_stock", 0), "Se ha agotado");
check(
  "las dos fuentes dicen LO MISMO a cero (el usuario no ve la diferencia)",
  suggestionReasonLabel(fuente("low_stock", 0)) ===
    suggestionReasonLabel(fuente("out_of_stock", 0)),
);

seccion("Queda algo");
rotulo("bajo el mínimo, nombra la regla del usuario", fuente("low_stock", 1.5), "Bajo tu mínimo");
// La concordancia no se puede acertar sin saber el género y el número del
// producto (arroz, leche, huevos), así que el rótulo no debe intentarlo.
for (const texto of [
  suggestionReasonLabel(fuente("low_stock", 1.5)),
  suggestionReasonLabel(fuente("low_stock", 3)),
]) {
  check(
    `«${texto}» evita la concordancia con el producto`,
    !/pocas|pocos|poca\b|poco\b/i.test(texto),
    { texto },
  );
}

seccion("Las otras dos fuentes");
rotulo("caducado", fuente("expired", 2), "Se te ha caducado");
rotulo("cadencia con mediana", fuente("restock", 3, 14), "Sueles comprarlo cada ~14 días");
rotulo("cadencia sin mediana", fuente("restock", 3), "Toca reponer");

seccion("Versión corta (autocompletado)");
check(
  "la cadencia se abrevia",
  suggestionReasonShort(fuente("restock", 3, 14)) === "cada ~14 días",
  { real: suggestionReasonShort(fuente("restock", 3, 14)) },
);
check(
  "el resto reutiliza el texto largo, con el cero incluido",
  suggestionReasonShort(fuente("low_stock", 0)) === "Se ha agotado",
  { real: suggestionReasonShort(fuente("low_stock", 0)) },
);

seccion("Ninguna rama se queda muda");
for (const reason of [
  "low_stock",
  "expired",
  "out_of_stock",
  "restock",
] as const) {
  for (const stock of [0, 2]) {
    const real = suggestionReasonLabel(fuente(reason, stock));
    check(`${reason} con stock ${stock} dice algo`, real.trim().length > 0, {
      real,
    });
  }
}

console.log(
  fallos === 0
    ? "\nMotivos de las sugerencias: todo correcto.\n"
    : `\nMotivos de las sugerencias: ${fallos} fallo(s).\n`,
);
process.exit(fallos === 0 ? 0 : 1);
