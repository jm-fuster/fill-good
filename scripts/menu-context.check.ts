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
 * Cubre además el contrato de HUECO CERRADO de `rules.ts` (`MenuMeal.locked`),
 * que es lo que impide que la regeneración replanifique un día ya vivido. No
 * está en `prompt-context.ts`, pero se comprueba aquí porque es la otra mitad de
 * la misma promesa: lo que ya comiste cuenta para las reglas de la semana y no
 * se toca.
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
import {
  validateAndPatchRules,
  type MenuDay,
  type MenuDish,
  type MenuStructure,
  type ValidatableRule,
} from "@/features/menus/rules";
import {
  assessWeekBudget,
  weeklyBudgetTarget,
} from "@/features/menus/week-budget";
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

// ---------------------------------------------------------------------------
seccion("Días ya pasados: el validador no los replanifica");
// ---------------------------------------------------------------------------

const LENTEJAS_ID = "r-lentejas";
const REGLA_MINIMO: ValidatableRule = {
  kind: "recipe_min_week",
  recipeId: LENTEJAS_ID,
  value: 1,
  recipe: { name: "Lentejas", mealTypes: [] },
};

/** Un día de la estructura del menú: dos huecos, con o sin candado. */
function dia(
  dayIndex: number,
  opciones: {
    locked?: boolean;
    comida?: MenuDish[];
    cena?: MenuDish[];
  } = {},
): MenuDay {
  const locked = opciones.locked ?? false;
  return {
    dayIndex,
    meals: [
      { slot: "lunch", dishes: opciones.comida ?? [], locked },
      { slot: "dinner", dishes: opciones.cena ?? [], locked },
    ],
  };
}

function platosDe(menu: MenuStructure): { dayIndex: number; name: string }[] {
  return menu.days.flatMap((d) =>
    d.meals.flatMap((m) => m.dishes.map((x) => ({ dayIndex: d.dayIndex, name: x.name }))),
  );
}

{
  // Jueves de una semana en curso: lunes y martes cerrados y VACÍOS.
  const menu: MenuStructure = {
    days: [dia(0, { locked: true }), dia(1, { locked: true }), dia(2), dia(3)],
  };
  const patched = validateAndPatchRules(menu, [REGLA_MINIMO]);
  const colocados = platosDe(patched);
  check(
    "el plato que falta NO cae en un hueco pasado vacío",
    colocados.every((p) => p.dayIndex >= 2),
    colocados,
  );
  check(
    "pero sí se coloca en un día que aún no ha llegado",
    colocados.length === 1 && colocados[0]!.dayIndex === 2,
    colocados,
  );
}

{
  // Lo comido el lunes cuenta: la regla ya está cumplida y no se añade otra vez.
  const menu: MenuStructure = {
    days: [
      dia(0, {
        locked: true,
        comida: [{ savedRecipeId: LENTEJAS_ID, name: "Lentejas", immutable: true }],
      }),
      dia(1),
    ],
  };
  const patched = validateAndPatchRules(menu, [REGLA_MINIMO]);
  check(
    "lo comido en un día pasado cuenta para el mínimo (no se repite)",
    platosDe(patched).length === 1,
    platosDe(patched),
  );
}

{
  // Máximo de 1 con dos apariciones, una de ellas en un día ya vivido: se
  // recorta la futura, nunca la pasada.
  const menu: MenuStructure = {
    days: [
      dia(0, {
        locked: true,
        comida: [{ savedRecipeId: LENTEJAS_ID, name: "Lentejas", immutable: true }],
      }),
      dia(1, { comida: [{ savedRecipeId: LENTEJAS_ID, name: "Lentejas" }] }),
    ],
  };
  const patched = validateAndPatchRules(menu, [
    { ...REGLA_MINIMO, kind: "recipe_max_week", value: 1 },
  ]);
  const pasado = patched.days[0]!.meals[0]!.dishes[0]!;
  const futuro = patched.days[1]!.meals[0]!.dishes[0]!;
  check(
    "el máximo no recorta lo que ya se comió",
    pasado.savedRecipeId === LENTEJAS_ID,
    pasado,
  );
  check(
    "recorta la aparición futura, que sí se puede cambiar",
    futuro.placeholder === true,
    futuro,
  );
}

{
  // El candado tiene que sobrevivir al clonado interno del validador: si se
  // perdiera, el hueco pasado volvería a admitir platos y el fallo sería mudo.
  const menu: MenuStructure = { days: [dia(0, { locked: true })] };
  const patched = validateAndPatchRules(menu, [REGLA_MINIMO]);
  check(
    "el candado sobrevive a la copia interna del validador",
    patched.days[0]!.meals.every((m) => m.locked === true),
    patched.days[0]!.meals,
  );
  check(
    "y sin ningún hueco abierto no se coloca nada en ninguna parte",
    platosDe(patched).length === 0,
    platosDe(patched),
  );
}

{
  // Sin candados, el comportamiento de siempre: la regla se cumple.
  const menu: MenuStructure = { days: [dia(0), dia(1)] };
  const patched = validateAndPatchRules(menu, [REGLA_MINIMO]);
  check(
    "sin días pasados el mínimo se cumple como siempre",
    platosDe(patched).length === 1,
    platosDe(patched),
  );
}

// ---------------------------------------------------------------------------
seccion("Presupuesto de la semana: avisar sí, tranquilizar no");
// ---------------------------------------------------------------------------

{
  // 400 € al mes ÷ 4,33 semanas = 92,31 €/semana.
  const objetivo = weeklyBudgetTarget(400);
  check(
    "el objetivo semanal sale del mensual repartido en 4,33 semanas",
    objetivo !== null && Math.abs(objetivo - 92.31) < 0.01,
    objetivo,
  );
  check(
    "dividir entre 4 daría un objetivo más flojo (y dejaría pasar semanas caras)",
    objetivo !== null && objetivo < 400 / 4,
    objetivo,
  );
}

check("sin presupuesto fijado no hay objetivo", weeklyBudgetTarget(null) === null);
check("un presupuesto de 0 no es un objetivo", weeklyBudgetTarget(0) === null);
check("ni uno negativo", weeklyBudgetTarget(-50) === null);

{
  const aviso = assessWeekBudget({ total: 120, complete: true }, 400);
  check("una semana que se pasa avisa", aviso !== null, aviso);
  check(
    "y dice exactamente cuánto se pasa",
    aviso !== null && Math.abs(aviso.overBy - (120 - 92.31)) < 0.01,
    aviso,
  );
}

{
  // El corazón del módulo: caber dentro NO se comunica. El presupuesto cubre
  // toda la compra (detergente incluido) y el coste solo los platos, así que un
  // «vas bien» sería una promesa que la app no puede sostener.
  check(
    "una semana que cabe dentro NO dice nada",
    assessWeekBudget({ total: 50, complete: true }, 400) === null,
  );
  check(
    "clavarla en el objetivo tampoco avisa",
    assessWeekBudget({ total: 92.31, complete: true }, 400) === null,
  );
}

{
  // Un SUELO que ya se pasa sigue siendo concluyente: lo que falta por contar
  // solo puede sumar.
  const aviso = assessWeekBudget({ total: 120, complete: false }, 400);
  check("un total parcial que ya se pasa también avisa", aviso !== null, aviso);
  check(
    "y se marca como parcial, para decirlo con otras palabras",
    aviso?.partial === true,
    aviso,
  );
}

{
  check(
    "un total parcial por debajo NO avisa (podría subir, pero no se sabe)",
    assessWeekBudget({ total: 50, complete: false }, 400) === null,
  );
  check(
    "sin presupuesto del hogar no se avisa aunque el menú sea carísimo",
    assessWeekBudget({ total: 9999, complete: true }, null) === null,
  );
  check(
    "sin ningún plato con precio no hay nada que comparar",
    assessWeekBudget(null, 400) === null,
  );
}

console.log(
  fallos === 0
    ? "\nContexto del menú: todo correcto.\n"
    : `\nContexto del menú: ${fallos} fallo(s).\n`,
);
process.exit(fallos === 0 ? 0 : 1);
