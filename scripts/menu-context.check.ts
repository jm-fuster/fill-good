/**
 * Comprobaciones del contexto que recibe el generador de menús. Lo ejecuta
 * `npm run check:menu` (ver `scripts/check-menu.mjs`, que lo empaqueta con
 * esbuild porque esto es TypeScript y tira del alias `@/`).
 *
 * Prueba `src/features/menus/prompt-context.ts`, que decide dos cosas que el
 * modelo ya no tiene que adivinar:
 *
 *   · Qué ingredientes de cada receta hay en casa, cuáles están apuntados en la
 *     lista y cuáles habría que comprar. Lo importante NO es que el recuento sea
 *     bonito, sino que coincida con el de «añadir a la lista lo que falte»
 *     (`missing.ts`): son dos pantallas que el usuario ve seguidas —el menú dice
 *     "tienes todo" y el botón siguiente apunta la compra— y si cada una
 *     emparejara por su cuenta acabarían contradiciéndose. Por eso las dos usan
 *     `resolveIngredient` y aquí se comparan una contra otra.
 *
 *   · Qué recetas entran en el prompt cuando el recetario se pasa del tope. La
 *     regla que no se puede romper: una receta nombrada por una regla activa del
 *     hogar («lentejas al menos una vez por semana») NUNCA se queda fuera. Si se
 *     cayera, los tipos seguirían cuadrando y el fallo aparecería una semana
 *     después, con el validador de reglas colocando a la fuerza un plato que el
 *     modelo no sabía que existía.
 *
 * Lo que NO se prueba: la redacción del prompt (eso es `menu-prompt.ts`, texto),
 * ni qué contesta Gemini, ni las consultas que reúnen el contexto (viven en la
 * Server Action, contra la base). Aquí solo las cuentas.
 */
import {
  buildCatalogIndex,
  promptRecipeScore,
  selectRecipesForPrompt,
  summarizeAvailability,
  type AvailabilityIngredient,
  type PromptRecipeCandidate,
  type RecipeAvailability,
} from "@/features/menus/prompt-context";
import {
  computeMissingIngredients,
  type CatalogEntry,
} from "@/features/menus/missing";
import { normalizeName } from "@/lib/normalize";

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

/** Un producto del catálogo del hogar. */
function producto(id: string, name: string): CatalogEntry {
  return { id, name, normalizedName: normalizeName(name), defaultUnit: "ud" };
}

const CATALOGO: CatalogEntry[] = [
  producto("p-lentejas", "Lentejas"),
  producto("p-chorizo", "Chorizo"),
  producto("p-cebolla", "Cebolla"),
  producto("p-zanahoria", "Zanahoria"),
  producto("p-tomate-frito", "Tomate frito Orlando"),
  producto("p-arroz", "Arroz redondo"),
];
const INDICE = buildCatalogIndex(CATALOGO);

type Escenario = {
  ingredientes: AvailabilityIngredient[];
  /** Ids de producto con existencias. */
  enCasa?: string[];
  /** Ids de producto apuntados en la lista de la compra. */
  enLista?: string[];
  /** Nombres sueltos con existencias, sin producto del catálogo detrás. */
  nombresEnCasa?: string[];
  /** Nombres sueltos apuntados en la lista. */
  nombresEnLista?: string[];
};

function repartir(e: Escenario): RecipeAvailability {
  return summarizeAvailability({
    ingredients: e.ingredientes,
    index: INDICE,
    stockProductIds: new Set(e.enCasa ?? []),
    stockNames: new Set((e.nombresEnCasa ?? []).map(normalizeName)),
    listProductIds: new Set(e.enLista ?? []),
    listNames: new Set((e.nombresEnLista ?? []).map(normalizeName)),
  });
}

/** Lo que «añadir a la lista lo que falte» apuntaría con los mismos datos. */
function loQueApuntariaLaLista(e: Escenario): string[] {
  return computeMissingIngredients({
    ingredients: e.ingredientes.map((i) => ({
      name: i.name,
      productId: i.productId,
      unit: null,
    })),
    catalog: CATALOGO,
    stockProductIds: new Set(e.enCasa ?? []),
    stockNames: new Set((e.nombresEnCasa ?? []).map(normalizeName)),
    listProductIds: new Set(e.enLista ?? []),
    listNames: new Set((e.nombresEnLista ?? []).map(normalizeName)),
  }).map((c) => c.ingredientName);
}

const ing = (name: string, productId: string | null = null) => ({
  name,
  productId,
});

// ---------------------------------------------------------------------------
seccion("Reparto de los ingredientes de una receta");
// ---------------------------------------------------------------------------

const LENTEJAS: Escenario = {
  ingredientes: [
    ing("Lentejas", "p-lentejas"),
    ing("Chorizo", "p-chorizo"),
    ing("Cebolla", "p-cebolla"),
    ing("Zanahoria", "p-zanahoria"),
  ],
  enCasa: ["p-lentejas", "p-cebolla"],
  enLista: ["p-chorizo"],
};

{
  const r = repartir(LENTEJAS);
  check(
    "cada ingrediente cae en un montón y solo uno",
    r.inStock + r.inList + r.missing.length === r.total,
    r,
  );
  check("cuenta bien lo que hay en casa", r.inStock === 2, r);
  check("cuenta bien lo que ya está apuntado", r.inList === 1, r);
  check(
    "solo falta comprar lo que no está ni en casa ni en la lista",
    r.missing.length === 1 && r.missing[0] === "Zanahoria",
    r,
  );
}

{
  // El caso que justifica que la lista viaje al prompt: sin ella, esta receta
  // parecía obligar a comprar dos cosas y el generador la descartaba.
  const r = repartir({
    ...LENTEJAS,
    enLista: ["p-chorizo", "p-zanahoria"],
  });
  check(
    "con todo lo que falta ya apuntado, no queda nada que comprar",
    r.missing.length === 0 && r.inList === 2,
    r,
  );
}

{
  const r = repartir({
    ingredientes: [ing("Lentejas", "p-lentejas")],
    enCasa: ["p-lentejas"],
    enLista: ["p-lentejas"],
  });
  check(
    "tenerlo en casa Y apuntado cuenta como tenerlo, no como dos",
    r.total === 1 && r.inStock === 1 && r.inList === 0,
    r,
  );
}

{
  const r = repartir({
    ingredientes: [ing("Tomate frito"), ing("Arroz")],
    enCasa: ["p-tomate-frito"],
  });
  check(
    'el fuzzy empareja "tomate frito" con "Tomate frito Orlando"',
    r.inStock === 1,
    r,
  );
  check(
    "lo que no casa con nada del catálogo cuenta como que falta",
    r.missing.length === 1 && r.missing[0] === "Arroz",
    r,
  );
}

{
  const r = repartir({
    ingredientes: [
      ing("Lentejas", "p-lentejas"),
      ing("lentejas pardinas", "p-lentejas"),
    ],
    enCasa: ["p-lentejas"],
  });
  check(
    "dos ingredientes del mismo producto cuentan una vez",
    r.total === 1 && r.inStock === 1,
    r,
  );
}

{
  const r = repartir({
    ingredientes: [ing("   "), ing("Chorizo", "p-chorizo")],
  });
  check(
    "un ingrediente sin nombre no cuenta como que falta",
    r.total === 1 && r.missing.length === 1,
    r,
  );
}

{
  const r = repartir({ ingredientes: [] });
  check(
    "una receta sin ingredientes no rompe el reparto",
    r.total === 0 && r.inStock === 0 && r.missing.length === 0,
    r,
  );
}

{
  const r = repartir({
    ingredientes: [ing("Sal gorda")],
    nombresEnCasa: ["Sal gorda"],
  });
  check(
    "un ingrediente sin producto pero con ese nombre en casa no falta",
    r.inStock === 1 && r.missing.length === 0,
    r,
  );
}

// ---------------------------------------------------------------------------
seccion("El menú y la lista de la compra cuentan lo mismo");
// ---------------------------------------------------------------------------

for (const [nombre, escenario] of [
  ["receta a medias", LENTEJAS],
  [
    "nada en casa",
    { ingredientes: LENTEJAS.ingredientes } satisfies Escenario,
  ],
  [
    "todo en casa",
    {
      ingredientes: LENTEJAS.ingredientes,
      enCasa: ["p-lentejas", "p-chorizo", "p-cebolla", "p-zanahoria"],
    } satisfies Escenario,
  ],
  [
    "emparejado por fuzzy y por nombre suelto",
    {
      ingredientes: [ing("Tomate frito"), ing("Arroz"), ing("Sal")],
      enCasa: ["p-tomate-frito"],
      nombresEnLista: ["Sal"],
    } satisfies Escenario,
  ],
] as const) {
  const delMenu = repartir(escenario).missing;
  const deLaLista = loQueApuntariaLaLista(escenario);
  check(
    `lo que el menú dice que falta es lo que la lista apuntaría (${nombre})`,
    JSON.stringify(delMenu) === JSON.stringify(deLaLista),
    { delMenu, deLaLista },
  );
}

// ---------------------------------------------------------------------------
seccion("Qué recetas entran en el prompt");
// ---------------------------------------------------------------------------

const HOY = "2026-08-03";

function candidata(
  id: string,
  opciones: Partial<PromptRecipeCandidate> & {
    total?: number;
    inStock?: number;
    inList?: number;
  } = {},
): PromptRecipeCandidate {
  const total = opciones.total ?? 4;
  const inStock = opciones.inStock ?? 0;
  const inList = opciones.inList ?? 0;
  return {
    id,
    availability: {
      total,
      inStock,
      inList,
      missing: Array.from(
        { length: total - inStock - inList },
        (_, i) => `falta-${i}`,
      ),
    },
    avgRating: opciones.avgRating ?? null,
    lastCookedAt: opciones.lastCookedAt ?? null,
    requiredByRule: opciones.requiredByRule ?? false,
  };
}

{
  const todas = [candidata("a"), candidata("b"), candidata("c")];
  check(
    "por debajo del tope entran todas",
    selectRecipesForPrompt(todas, { todayISO: HOY, limit: 10 }).length === 3,
  );
}

{
  const muchas = Array.from({ length: 20 }, (_, i) => candidata(`r${i}`));
  const elegidas = selectRecipesForPrompt(muchas, { todayISO: HOY, limit: 5 });
  check("el tope recorta el recetario", elegidas.length === 5, elegidas);
}

{
  // La receta con regla llega la última y sin nada en casa: sin el rescate se
  // quedaría fuera del tope y el modelo planificaría la semana sin conocerla.
  const muchas = [
    ...Array.from({ length: 20 }, (_, i) =>
      candidata(`r${i}`, { inStock: 4, avgRating: 5 }),
    ),
    candidata("con-regla", { requiredByRule: true }),
  ];
  const elegidas = selectRecipesForPrompt(muchas, { todayISO: HOY, limit: 5 });
  check(
    "una receta con regla activa nunca se queda fuera del prompt",
    elegidas.includes("con-regla"),
    elegidas,
  );
  check(
    "y por eso el resultado puede pasarse del tope",
    elegidas.length === 6,
    elegidas,
  );
}

{
  const elegidas = selectRecipesForPrompt(
    [candidata("nada"), candidata("todo", { inStock: 4 })],
    { todayISO: HOY },
  );
  check(
    "la receta que puedes cocinar con lo que tienes va primero",
    elegidas[0] === "todo",
    elegidas,
  );
}

{
  const elegidas = selectRecipesForPrompt(
    [candidata("comprar"), candidata("apuntado", { inList: 4 })],
    { todayISO: HOY },
  );
  check(
    "lo que solo necesita la compra ya apuntada gana a lo que hay que comprar entero",
    elegidas[0] === "apuntado",
    elegidas,
  );
}

{
  const elegidas = selectRecipesForPrompt(
    [
      candidata("anteayer", { inStock: 4, lastCookedAt: "2026-08-01" }),
      candidata("hace-un-mes", { inStock: 4, lastCookedAt: "2026-07-03" }),
    ],
    { todayISO: HOY },
  );
  check(
    "lo cocinado hace dos días descansa por detrás de lo de hace un mes",
    elegidas[0] === "hace-un-mes",
    elegidas,
  );
}

{
  const elegidas = selectRecipesForPrompt(
    [
      candidata("gusta-poco", { inStock: 4, avgRating: 1 }),
      candidata("gusta-mucho", { inStock: 4, avgRating: 5 }),
    ],
    { todayISO: HOY },
  );
  check(
    "a igualdad de despensa, manda la valoración",
    elegidas[0] === "gusta-mucho",
    elegidas,
  );
}

{
  const empatadas = [candidata("a"), candidata("b"), candidata("c")];
  const primera = selectRecipesForPrompt(empatadas, { todayISO: HOY });
  const segunda = selectRecipesForPrompt(empatadas, { todayISO: HOY });
  check(
    "con los mismos datos sale el mismo prompt (empates deterministas)",
    JSON.stringify(primera) === JSON.stringify(segunda),
    { primera, segunda },
  );
}

{
  const sinIngredientes = candidata("vacia", { total: 0 });
  check(
    "una receta sin ingredientes no puntúa por despensa (y no rompe la división)",
    Number.isFinite(promptRecipeScore(sinIngredientes, HOY)),
    promptRecipeScore(sinIngredientes, HOY),
  );
}

console.log(
  fallos === 0
    ? "\nContexto del menú: todo correcto.\n"
    : `\nContexto del menú: ${fallos} fallo(s).\n`,
);
process.exit(fallos === 0 ? 0 : 1);
