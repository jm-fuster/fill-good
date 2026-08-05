/**
 * Comprobaciones de la mezcla de lo que escribe la IA con lo que ya tenía la
 * receta (`src/features/recipes/ai-draft.ts`). Lo ejecuta
 * `npm run check:receta-ia` (ver `scripts/check-recipe-draft.mjs`, que lo
 * empaqueta con esbuild porque esto es TypeScript y tira del alias `@/`).
 *
 * Por qué hace falta comprobarlo: el nombre de un ingrediente no es una
 * etiqueta, es la CLAVE con la que la receta se engancha al catálogo del hogar
 * (`recipe_ingredients.product_id`, resuelto por nombre normalizado). De ese
 * vínculo cuelgan tres pantallas: qué sale como «hay que comprar» en el menú, qué
 * apunta «añadir a la lista lo que falte» y de qué fila de la despensa se
 * descuenta al cocinar. Un modelo al que le pides cantidades y que de paso
 * «mejora» un nombre —«Arroz» → «Arroz bomba»— no cambia un texto: deja huérfano
 * el ingrediente que estaba, crea uno nuevo sin vínculo, y el hogar acaba
 * comprando arroz teniendo arroz.
 *
 * El prompt ya pide copiar los nombres carácter a carácter, pero un prompt es una
 * petición y no una garantía: lo que lo impide es esta mezcla. Y el compilador no
 * la defiende, porque devolver el nombre del modelo o el del hogar tiene
 * EXACTAMENTE el mismo tipo — `string`. Los casos de abajo son la única
 * diferencia entre las dos versiones.
 *
 * Se comprueba además el ORDEN, que también es contrato: `fillRecipeDetailsAction`
 * escribe las cantidades en la base emparejando por POSICIÓN
 * (`slice(0, existing.length)`), así que una mezcla que reordenara escribiría la
 * cantidad de un ingrediente en la fila de otro sin que nada fallara.
 *
 * Lo que NO se comprueba: la llamada al modelo, la redacción del prompt
 * (`lib/ai/recipe-prompt.ts`) ni la escritura en la base.
 */
import {
  mergeGeneratedIngredients,
  sanitizeGeneratedSteps,
  sanitizePrepMinutes,
  sanitizeQuantity,
  type DraftIngredient,
  type GeneratedIngredient,
} from "@/features/recipes/ai-draft";
import {
  MAX_RECIPE_INGREDIENT_NAME,
  MAX_RECIPE_INGREDIENTS,
  MAX_RECIPE_STEPS,
} from "@/features/recipes/schemas";
import type { UnitType } from "@/lib/supabase/types";

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

/** Un ingrediente que ya estaba en la receta. */
function tenia(
  name: string,
  quantity: number | null = null,
  unit: UnitType | null = null,
  productId: string | null = null,
  optional = false,
): DraftIngredient {
  return { name, quantity, unit, optional, productId };
}

/** Un ingrediente tal como lo devuelve el modelo. */
function dice(
  name: string,
  quantity: number | null = null,
  unit: UnitType | null = null,
): GeneratedIngredient {
  return { name, quantity, unit };
}

seccion("Lo que ya estaba escrito sobrevive intacto");
{
  // El caso que justifica el módulo: el modelo concreta el nombre.
  const existing = [tenia("Arroz", null, null, "prod-arroz")];
  const [arroz, ...resto] = mergeGeneratedIngredients(existing, [
    dice("Arroz bomba", 320, "g"),
  ]);
  check("el nombre es el del hogar, no el del modelo", arroz.name === "Arroz", {
    real: arroz.name,
  });
  check(
    "el vínculo con el catálogo sigue en su sitio",
    arroz.productId === "prod-arroz",
    { real: arroz.productId },
  );
  check(
    "un nombre distinto para el modelo es un ingrediente NUEVO, no un cambio",
    resto.length === 1 && resto[0].name === "Arroz bomba",
    { resto },
  );
}
{
  const existing = [tenia("Garbanzos", 400, "g", "prod-garbanzos", true)];
  const merged = mergeGeneratedIngredients(existing, [
    dice("Garbanzos", 250, "g"),
  ]);
  check(
    "una cantidad que ya estaba no la pisa el modelo",
    merged[0].quantity === 400,
    { real: merged[0].quantity },
  );
  check("«opcional» es del hogar y no se toca", merged[0].optional === true);
  check("no se duplica el que ya estaba", merged.length === 1, { merged });
}
{
  // Sin nada que decir del modelo, la receta sale tal cual entró.
  const existing = [
    tenia("Sal", null, null, "prod-sal"),
    tenia("Aceite de oliva", 30, "ml"),
  ];
  const merged = mergeGeneratedIngredients(existing, []);
  check(
    "una respuesta vacía no borra ni cambia nada",
    JSON.stringify(merged) === JSON.stringify(existing),
    { merged },
  );
}

seccion("Se rellena solo el hueco");
{
  const existing = [tenia("Cebolla", null, null, "prod-cebolla")];
  const merged = mergeGeneratedIngredients(existing, [dice("cebolla", 2, "ud")]);
  check("la cantidad que faltaba se pone", merged[0].quantity === 2);
  check("con su unidad", merged[0].unit === "ud");
  check("y sin perder el vínculo", merged[0].productId === "prod-cebolla");
}
{
  /*
    Cantidad y unidad son UN dato y viajan juntas. Si se aceptara el número del
    modelo conservando la unidad que ya había, un «2» que el modelo quería en
    unidades se guardaría como «2 g» de harina: nadie lo lee como un error, y
    acaba en la lista de la compra y en el descuento de la despensa.
  */
  const existing = [tenia("Harina", null, "g")];
  const merged = mergeGeneratedIngredients(existing, [dice("Harina", 2, null)]);
  check(
    "la unidad viene del modelo junto con la cantidad, no se hereda la vieja",
    merged[0].quantity === 2 && merged[0].unit === null,
    { real: merged[0] },
  );
}

{
  // Una cantidad que no se puede creer no rellena el hueco: se queda vacío. Un
  // «-200 g» o un «0 g» se leen igual de firmes que una cantidad buena, y de aquí
  // salen la lista de la compra y el descuento de la despensa.
  for (const imposible of [0, -200, 1e9]) {
    const merged = mergeGeneratedIngredients(
      [tenia("Azúcar", null, null, "prod-azucar")],
      [dice("Azúcar", imposible, "g")],
    );
    check(
      `una cantidad de ${imposible} deja el hueco como estaba`,
      merged[0].quantity === null && merged[0].productId === "prod-azucar",
      { real: merged[0] },
    );
  }
}

seccion("Emparejar es la misma cuenta que vincula al catálogo");
for (const [suyo, delModelo] of [
  ["Tomate", "tomate"],
  ["CEBOLLA", "Cebolla"],
  ["Jamón", "jamon"],
  ["Pimiento  rojo", "Pimiento rojo"],
  [" Puerro", "Puerro "],
] as const) {
  const merged = mergeGeneratedIngredients(
    [tenia(suyo, null, null, "prod-x")],
    [dice(delModelo, 100, "g")],
  );
  check(
    `«${suyo}» y «${delModelo}» son el mismo ingrediente`,
    merged.length === 1 && merged[0].name === suyo && merged[0].quantity === 100,
    { merged },
  );
}

seccion("Lo que el modelo añade");
{
  const existing = [tenia("Lentejas", 300, "g")];
  const merged = mergeGeneratedIngredients(existing, [
    dice("Lentejas", 300, "g"),
    dice("Zanahoria", 2, "ud"),
    dice("Laurel", null, null),
  ]);
  check("va detrás de lo que ya estaba", merged[0].name === "Lentejas", {
    merged,
  });
  check("se añade todo lo nuevo", merged.length === 3, { merged });
  check(
    "sin vínculo (lo resuelve el guardado por nombre) y no opcional",
    merged[1].productId === null && merged[1].optional === false,
    { real: merged[1] },
  );
  check(
    "un «al gusto» entra sin cantidad inventada",
    merged[2].name === "Laurel" && merged[2].quantity === null,
    { real: merged[2] },
  );
}
{
  // Un modelo que se repite no debe producir dos filas del mismo ingrediente.
  const merged = mergeGeneratedIngredients(
    [],
    [dice("Ajo", 2, "ud"), dice("ajo", 3, "ud"), dice("AJO", null, null)],
  );
  check("el modelo repitiéndose produce UNA fila", merged.length === 1, {
    merged,
  });
  check("y gana el primero que dijo", merged[0].quantity === 2, {
    real: merged[0],
  });
}

{
  /*
    Un nombre larguísimo se recorta y NO se descarta. Sin recortar rompía por los
    dos lados: en el formulario tumbaba el guardado con el mensaje por defecto de
    zod (en inglés, sin decir qué fila), y por la vía del menú entraba en la base
    sin pasar por zod, dejando en la receta un ingrediente que el formulario ya no
    podía guardar nunca.
  */
  const larguísimo =
    "Caldo de pollo casero o, en su defecto, una pastilla de concentrado de " +
    "caldo disuelta en medio litro de agua templada, añadiendo sal al gusto";
  const [ing] = mergeGeneratedIngredients([], [dice(larguísimo, 500, "ml")]);
  check(
    `el nombre cabe en ${MAX_RECIPE_INGREDIENT_NAME} (lo que acepta el guardado)`,
    ing.name.length <= MAX_RECIPE_INGREDIENT_NAME,
    { largo: ing.name.length },
  );
  check(
    "y se corta por una palabra entera, no en mitad de una",
    !ing.name.endsWith(" ") && larguísimo.startsWith(ing.name),
    { real: ing.name },
  );
  check("el ingrediente no desaparece", ing.quantity === 500);
}
{
  // Cantidad y unidad son un solo dato también al añadir: una unidad suelta se
  // lee como si faltara el número, cuando lo que dice el modelo es «al gusto».
  const [ing] = mergeGeneratedIngredients([], [dice("Pimienta", 0, "g")]);
  check(
    "una cantidad imposible entra como «al gusto», sin unidad huérfana",
    ing.quantity === null && ing.unit === null,
    { real: ing },
  );
}

seccion("El orden es contrato (la escritura empareja por posición)");
{
  const existing = [
    tenia("Pollo", null, null, "prod-pollo"),
    tenia("Patata", null, null, "prod-patata"),
    tenia("Romero", 1, "ud"),
  ];
  // El modelo los devuelve en otro orden y mete uno nuevo por el medio.
  const merged = mergeGeneratedIngredients(existing, [
    dice("Romero", 5, "g"),
    dice("Cerveza", 200, "ml"),
    dice("Patata", 600, "g"),
    dice("Pollo", 1200, "g"),
  ]);
  check(
    "los que ya estaban salen primero y en SU orden",
    merged
      .slice(0, existing.length)
      .every((ing, i) => ing.name === existing[i].name),
    { merged },
  );
  check(
    "cada cantidad cae en su ingrediente",
    merged[0].quantity === 1200 && merged[1].quantity === 600,
    { real: merged.slice(0, 2) },
  );
  check(
    "lo añadido va al final, después de todos los existentes",
    merged.length === 4 && merged[3].name === "Cerveza",
    { merged },
  );
}

seccion("El tope deja fuera lo añadido, nunca lo del hogar");
{
  const existing = Array.from({ length: MAX_RECIPE_INGREDIENTS }, (_, i) =>
    tenia(`Ingrediente ${i}`, i + 1, "g", `prod-${i}`),
  );
  const merged = mergeGeneratedIngredients(existing, [
    dice("Cosa nueva", 1, "ud"),
    dice("Otra cosa nueva", 2, "ud"),
  ]);
  check(
    `no se pasa de ${MAX_RECIPE_INGREDIENTS} (lo que acepta el guardado)`,
    merged.length === MAX_RECIPE_INGREDIENTS,
    { real: merged.length },
  );
  check(
    "siguen estando TODOS los del hogar",
    existing.every((e, i) => merged[i]?.name === e.name),
  );
}

seccion("Pasos: se limpian, no se recortan");
{
  const pasos = sanitizeGeneratedSteps([
    "1. Pica la cebolla",
    "2) Sofríe   a fuego medio",
    "- Añade el arroz",
    "• Remueve",
    "   ",
    "Sirve\ncaliente",
  ]);
  check("se quita la numeración que el modelo pone de todas formas", pasos[0] === "Pica la cebolla", { real: pasos[0] });
  check("también «2)» y las viñetas", pasos[1] === "Sofríe a fuego medio" && pasos[2] === "Añade el arroz" && pasos[3] === "Remueve", { pasos });
  check("las líneas en blanco se caen", pasos.length === 5, { pasos });
  check(
    "un paso ocupa una sola línea",
    pasos[4] === "Sirve caliente",
    { real: pasos[4] },
  );
}
{
  const muchos = sanitizeGeneratedSteps(
    Array.from({ length: MAX_RECIPE_STEPS + 10 }, (_, i) => `Paso número ${i}`),
  );
  check(`no pasan de ${MAX_RECIPE_STEPS}`, muchos.length === MAX_RECIPE_STEPS, {
    real: muchos.length,
  });
}
{
  // Cortar por el carácter 500 partiría una frase por la mitad sin avisar. Se
  // deja entero: el guardado lo rechaza diciendo qué hacer con él.
  const largo = "a".repeat(700);
  const [paso] = sanitizeGeneratedSteps([largo]);
  check("un paso larguísimo llega entero, sin cortar", paso.length === 700, {
    real: paso.length,
  });
}

seccion("Un rango al principio NO es una numeración");
{
  /*
    Con `\d{1,2}\s*[.)-]` a secas, el recorte del marcador se comía el extremo
    inferior de un rango y nadie lo veía: «30 - 40 g de sal» se guardaba como
    «40 g de sal». Y el pegado de una receta copiada de una web es justo donde
    las líneas empiezan por un rango.
  */
  for (const [entra, sale] of [
    ["30 - 40 g de sal por litro", "30 - 40 g de sal por litro"],
    ["5 - 10 minutos a fuego medio", "5 - 10 minutos a fuego medio"],
    ["1-2 minutos y listo", "1-2 minutos y listo"],
    ["1,2 kg de patatas", "1,2 kg de patatas"],
    // Esto sí es numeración: detrás del guion no viene otra cifra.
    ["1 - Pica la cebolla", "Pica la cebolla"],
    ["10. Sirve caliente", "Sirve caliente"],
    ["2) Sofríe", "Sofríe"],
    ["- Añade el arroz", "Añade el arroz"],
  ] as const) {
    const [real] = sanitizeGeneratedSteps([entra]);
    check(`«${entra}» → «${real}»`, real === sale, { esperado: sale, real });
  }
}

seccion("Cantidades que se pueden guardar");
// `numeric(10, 2)` en la columna: por arriba revienta la escritura, y un cero o
// un negativo se guardarían como si fueran un dato.
check("un 0 es «al gusto», no cero", sanitizeQuantity(0) === null);
check("un negativo se descarta", sanitizeQuantity(-200) === null);
check(
  "lo que no cabe en numeric(10,2) se descarta",
  sanitizeQuantity(100_000_000) === null,
);
check("el techo de la columna pasa", sanitizeQuantity(99_999_999) === 99_999_999);
check("null sigue siendo null", sanitizeQuantity(null) === null);
check("se redondea a los dos decimales que guarda la columna", sanitizeQuantity(0.333) === 0.33, {
  real: sanitizeQuantity(0.333),
});
check("una cantidad normal pasa entera", sanitizeQuantity(320) === 320);

seccion("Minutos que se pueden creer");
check("un 0 es «no lo sé», no cero minutos", sanitizePrepMinutes(0) === null);
check("un negativo se descarta", sanitizePrepMinutes(-30) === null);
check("un disparate se descarta", sanitizePrepMinutes(100000) === null);
check("null sigue siendo null", sanitizePrepMinutes(null) === null);
check("un decimal se redondea", sanitizePrepMinutes(42.4) === 42, {
  real: sanitizePrepMinutes(42.4),
});
check("un valor normal pasa", sanitizePrepMinutes(45) === 45);
check("el tope de la ficha (999) pasa", sanitizePrepMinutes(999) === 999);

console.log(
  fallos === 0
    ? "\nMezcla de la receta generada: todo correcto.\n"
    : `\nMezcla de la receta generada: ${fallos} fallo(s).\n`,
);
process.exit(fallos === 0 ? 0 : 1);
