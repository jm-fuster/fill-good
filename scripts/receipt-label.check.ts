/**
 * Comprobaciones del rótulo de una línea de ticket. Lo ejecuta
 * `npm run check:rotulos` (ver `scripts/check-rotulos.mjs`, que lo empaqueta con
 * esbuild porque esto es TypeScript y tira del alias `@/`).
 *
 * Prueba `cleanReceiptLabel` / `aliasKeyFor` de `src/lib/receipt-label.ts` con
 * LÍNEAS REALES de tickets del hogar (Mercadona, Alipende y tickets en catalán).
 *
 * Existe porque el fallo que arregla esa función no se ve leyéndola: recortar el
 * peso y el importe parece cosmética —lo que se muestra queda más limpio— y en
 * realidad es la CLAVE con la que se guarda y se busca un nombre aprendido
 * (`product_aliases.alias_normalized`). Con el importe dentro, medido sobre los
 * tickets reales del hogar: 119 de 125 nombres aprendidos no podían volver a
 * coincidir nunca, y 107 de 123 compras repetidas disparaban el aviso de «ya lo
 * llamabas de otra forma» proponiendo BORRAR el nombre bueno.
 *
 * Lo que fija, y que se rompe en silencio si alguien "simplifica" el recorte:
 *  · el mismo artículo con otro peso u otro precio da la MISMA clave;
 *  · el gramaje que forma parte del nombre comercial (500G, 3U, P2, 1,2K) NO se
 *    toca, porque ahí sí distingue productos distintos;
 *  · artículos que solo se parecen (nectarina a granel vs bolsa de 750G) siguen
 *    siendo claves distintas;
 *  · el recorte es idempotente y nunca devuelve vacío.
 *
 * Lo que NO se prueba: el OCR (que "MELOKOTON" y "MELOCOTON" son lo mismo lo
 * resuelve el fuzzy de la revisión, que sugiere y nunca decide solo) ni la
 * escritura del alias.
 */
import { findRenameCandidate, type AliasSighting } from "@/lib/alias-rename";
import { normalizeName } from "@/lib/normalize";
import { aliasKeyFor, cleanReceiptLabel } from "@/lib/receipt-label";

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

/** El rótulo de una línea impresa es exactamente el esperado. */
function rotulo(impreso: string, esperado: string) {
  const real = cleanReceiptLabel(impreso);
  check(`${JSON.stringify(impreso)} → «${real}»`, real === esperado, {
    esperado,
    real,
  });
}

/** Dos líneas impresas distintas apuntan al MISMO nombre aprendido. */
function mismaClave(nombre: string, a: string, b: string) {
  const ka = aliasKeyFor(a);
  const kb = aliasKeyFor(b);
  check(`${nombre}: «${ka}»`, ka === kb && ka.length > 0, { ka, kb });
}

/** Dos líneas impresas son artículos DISTINTOS y no deben fundirse. */
function claveDistinta(nombre: string, a: string, b: string) {
  const ka = aliasKeyFor(a);
  const kb = aliasKeyFor(b);
  check(`${nombre}: «${ka}» ≠ «${kb}»`, ka !== kb, { ka, kb });
}

seccion("Formas de imprimir un producto al peso");
// Alipende: nombre y peso en la misma línea, con la letra del IVA antes del total.
rotulo("PLATANO CANARIO 0,990 kg x 2,29 €/kg C 2,27 €", "PLATANO CANARIO");
// El mismo ticket, cuando el OCR parte la línea en dos renglones.
rotulo("AGUACATE\n0,850 kg x 5,99 €/kg C 5,09 €", "AGUACATE");
// ...y cuando los devuelve al revés (el peso primero).
rotulo("0,755 kg x 2,39 €/kg  1,80 €\nTOMATE ENSALADA", "TOMATE ENSALADA");
// Mercadona: sin «x» y con la E del OCR en lugar del símbolo del euro.
rotulo("PLATANO 0,486 kg 1,95 E/kg 0,95", "PLATANO");
// Ticket en catalán: importe al final del nombre y peso en el renglón siguiente.
rotulo("CARBASSÓ GRANEL 0,52\n 0,452kg x 1,15 €/kg", "CARBASSÓ GRANEL");
rotulo("PEBROT ITALIÀ 0,54\n 0,218kg x 2,49 €/kg", "PEBROT ITALIÀ");

seccion("Formas de imprimir varias unidades");
rotulo(
  "ARROZ REDONDO BRILLANTE P2\n2 Un x 2,35 €/Un A 4,70 €",
  "ARROZ REDONDO BRILLANTE P2",
);
rotulo(
  "LECHE LAUKI 1L SEMIDESNATAD 2 Un x 1,09 €/un 2,18 €",
  "LECHE LAUKI 1L SEMIDESNATAD",
);
// Multiplicador con el precio entre paréntesis (ticket en catalán).
rotulo("PERNIL D'ESQUER 150G CO65 \n 2 x ( 11,99 ) 23,98", "PERNIL D'ESQUER 150G CO65");
// Mercadona pone la cantidad DELANTE y el importe sin símbolo de euro.
rotulo("2 LECHE ENTERA 1,60", "LECHE ENTERA");
rotulo("4 YOGUR NATURAL 1,44", "YOGUR NATURAL");
rotulo("1 ACEITE OLIVA V.E. 8,90", "ACEITE OLIVA V.E.");

seccion("El gramaje del NOMBRE no se toca (ahí sí distingue productos)");
rotulo("ESPIRALES ALIPENDE 500G C/V A 0,90 €", "ESPIRALES ALIPENDE 500G C/V");
rotulo("COGOLLO 3U C 1,19 €", "COGOLLO 3U");
rotulo("CALABAZA PIEZA 1K C 1,99 €", "CALABAZA PIEZA 1K");
rotulo("MELON MATISSE PIEZA 1,2K AP C 2,99 €", "MELON MATISSE PIEZA 1,2K AP");
rotulo("QUESO BLANCO ALIPENDE 2X250 C 2,05 €", "QUESO BLANCO ALIPENDE 2X250");
rotulo("DETERGENTE LIQ. ARIEL 25+5L B 5,95", "DETERGENTE LIQ. ARIEL 25+5L");
rotulo("SERVILLETA ECO MY TISSUE 50 B 1,45 €", "SERVILLETA ECO MY TISSUE 50");
// El «3» final es del nombre (formato del envase), no una cantidad ni un precio.
rotulo("PAN BIG BURGER'S ALIPENDE 3 0,85 €", "PAN BIG BURGER'S ALIPENDE 3");
rotulo("CACAO COLA CAO 6 SOBRES 96G A 3,40 €", "CACAO COLA CAO 6 SOBRES 96G");

seccion("Lo que cambia en cada compra da la MISMA clave");
// EL invariante: es lo que hace que el segundo ticket reconozca el producto.
mismaClave(
  "el plátano pesa distinto cada semana",
  "PLATANO CANARIO 0,990 kg x 2,29 €/kg C 2,27 €",
  "PLATANO CANARIO 0,700 kg x 2,59 €/kg 1,81 €",
);
mismaClave(
  "el albaricoque, además, cambió de precio por kilo",
  "ALBARICOQUE 0,435 kg x 3,99 €/kg C 1,74 €",
  "ALBARICOQUE 0,700 kg x 3,99 €/kg 3,11 €",
);
mismaClave(
  "la chuleta subió de 2,22 a 2,93",
  "CHULETA AGUJA DUROC ELPOZO A 2,22 €",
  "CHULETA AGUJA DUROC ELPOZO A 2,93 €",
);
mismaClave(
  "el pan de molde de Mercadona, con la cantidad delante",
  "1 PAN DE MOLDE 1,15",
  "1 PAN DE MOLDE 1,20",
);
mismaClave(
  "da igual en qué renglón imprima el peso",
  "TOMATE CHERRY SAO PAULO\n0,245 kg x 15,96 €/kg C 3,91 €",
  "TOMATE CHERRY SAO PAULO 0,590 kg x 15,96 €/kg 9,42 €",
);
mismaClave(
  "y da igual que la línea traiga la letra del IVA o no",
  "REFRESCO ZEROZERO COLA COCA B 9,90",
  "REFRESCO ZEROZERO COLA COCA 9,96 €",
);
mismaClave(
  "una unidad suelta y un pack de dos son el mismo artículo",
  "BEB.PARA CONGELAR SIGLITOS B 1,15",
  "BEB.PARA CONGELAR SIGLITOS 2 Un x 1,45 €/un 2,90 €",
);
mismaClave(
  "la línea sin importe (ticket a medio leer) también casa",
  "JAMONCITO POLLO ALIPENDE BA",
  "JAMONCITO POLLO ALIPENDE BA A 4,24 €",
);

seccion("Artículos parecidos NO se funden");
claveDistinta(
  "la nectarina a granel no es la bolsa de 750G",
  "NECTARINA 0,970 kg x 2,99 €/kg 2,90 €",
  "NECTARINA 750G C 1,69 €",
);
claveDistinta(
  "la sandía entera no es la partida",
  "SANDIA FASHION 4,465 kg x 1,29 €/kg 5,76 €",
  "SANDIA FASHION PARTIDA C 5,03€",
);
claveDistinta(
  "el plátano de Mercadona no es el canario de Alipende",
  "PLATANO 0,486 kg 1,95 E/kg 0,95",
  "PLATANO CANARIO 0,990 kg x 2,29 €/kg C 2,27 €",
);
claveDistinta(
  "dos leches distintas",
  "2 LECHE ENTERA 1,60",
  "LECHE LAUKI 1L SEMIDESNATAD 2 Un x 1,09 €/un 2,18 €",
);
claveDistinta(
  "el yogur natural no es el de fresa",
  "YOGUR GRIEGO DANONE P4 NATU 2 Un x 1,49 €/un 2,98 €",
  "YOGUR GRIEGO DANONE P4 STRA C 1,79 €",
);

seccion("El aviso de renombrado deja de acusar a la compra repetida");
// Este es el daño que se veía en la app: el aviso ofrece BORRAR un nombre
// aprendido, y con el importe dentro de la clave lo ofrecía en casi todas las
// compras repetidas. Un nombre aprendido ya recortado + la línea nueva de la
// semana siguiente no deben parecer un cambio de etiqueta.
const aprendido: AliasSighting = {
  id: "alias-1",
  productId: "prod-1",
  alias: cleanReceiptLabel("HUEVOS SUELTAS GALLINERO AL C 3,05 €"),
  aliasNormalized: aliasKeyFor("HUEVOS SUELTAS GALLINERO AL C 3,05 €"),
  storeChain: "otro",
  lastSeenAt: "2026-07-01",
};
check(
  "misma etiqueta, otro importe → sin aviso",
  findRenameCandidate([aprendido], {
    productId: "prod-1",
    storeChain: "otro",
    rawName: "HUEVOS SUELTAS GALLINERO AL 2 Un x 3,20 €/un 6,40 €",
  }) === null,
);
check(
  "misma etiqueta partida en dos renglones → sin aviso",
  findRenameCandidate(
    [
      {
        ...aprendido,
        alias: cleanReceiptLabel("PATATA 1,465 kg x 1,89 €/kg C 2,77 €"),
        aliasNormalized: aliasKeyFor("PATATA 1,465 kg x 1,89 €/kg C 2,77 €"),
      },
    ],
    {
      productId: "prod-1",
      storeChain: "otro",
      rawName: "PATATA\n2,010 kg x 1,89 €/kg C 3,80 €",
    },
  ) === null,
);
// Y el caso para el que se escribió el aviso sigue detectándose: la cadena
// cambió la etiqueta del artículo, no el peso ni el precio.
check(
  "etiqueta de verdad renombrada → sigue avisando",
  findRenameCandidate(
    [
      {
        ...aprendido,
        alias: "GAZPACHO HACEND.",
        aliasNormalized: aliasKeyFor("GAZPACHO HACEND. 1,65"),
      },
    ],
    {
      productId: "prod-1",
      storeChain: "otro",
      rawName: "GAZPACHO HACENDADO 1L 1,75",
    },
  ) !== null,
);

seccion("Invariantes del recorte");
const CORPUS = [
  "PLATANO CANARIO 0,990 kg x 2,29 €/kg C 2,27 €",
  "AGUACATE\n0,850 kg x 5,99 €/kg C 5,09 €",
  "0,755 kg x 2,39 €/kg  1,80 €\nTOMATE ENSALADA",
  "CARBASSÓ GRANEL 0,52\n 0,452kg x 1,15 €/kg",
  "2 LECHE ENTERA 1,60",
  "TAQUITOS JAMON NAVIDUL 100G\n2 Un x 2,00 €/Un A 4,00 €",
  "SERVILLETA ECO MY TISSUE 50",
  "Huevoss",
  "HELADO HÄAGEN-DAZS 4U CHOCO A 7,49€",
  "PECH.POLLO S/GL.MARI.EMP.AL A 3,36€",
];
for (const linea of CORPUS) {
  const una = cleanReceiptLabel(linea);
  check(`idempotente: ${JSON.stringify(linea)}`, cleanReceiptLabel(una) === una, {
    una,
    dos: cleanReceiptLabel(una),
  });
  check(`no queda vacío: ${JSON.stringify(linea)}`, una.trim().length > 0, {
    una,
  });
  check(
    `la clave es el rótulo normalizado: ${JSON.stringify(linea)}`,
    aliasKeyFor(linea) === normalizeName(una),
  );
}
// Una línea que es SOLO importes no tiene rótulo que extraer: antes que devolver
// vacío (que dejaría el alias sin nombre) se queda con el texto original.
check(
  "línea sin nombre → se conserva el original",
  cleanReceiptLabel("0,486 kg 1,95 E/kg 0,95") === "0,486 kg 1,95 E/kg 0,95",
  { real: cleanReceiptLabel("0,486 kg 1,95 E/kg 0,95") },
);

console.log(
  fallos === 0
    ? "\nRótulos de ticket: todo correcto.\n"
    : `\nRótulos de ticket: ${fallos} fallo(s).\n`,
);
process.exit(fallos === 0 ? 0 : 1);
