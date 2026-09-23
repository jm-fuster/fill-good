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
 * Cubre además `rules.ts` entero, que es la mitad DETERMINISTA del generador: la
 * que existe justamente para no fiarse del modelo. Dos cosas:
 *
 *   · El HUECO CERRADO (`MenuMeal.locked`), que impide replanificar un día ya
 *     vivido o uno que el hogar ha dicho que no se planifique.
 *
 *   · Las REGLAS DE FRECUENCIA (`enforceMin` / `enforceMax`), que reescriben la
 *     semana en silencio: meten un plato donde ven sitio y convierten en
 *     «(elegir plato)» lo que sobra. Un error ahí no rompe nada visible —tu
 *     regla no se cumple, o te desaparece un plato— y se lee como que la IA hizo
 *     lo que le dio la gana. Lo que más se vigila: que el máximo recorte solo el
 *     exceso y nunca lo fijado, que el mínimo respete el tipo de comida y el
 *     tope de platos por hueco, que no sustituya una receta protegida por su
 *     propio mínimo y que una configuración imposible se rinda en vez de
 *     colgarse (el bucle de `enforceMin` corre dentro de una Server Action).
 *
 * Y cubre una línea del CONTRATO con el modelo (`menuSchema`): que un hueco
 * pueda llegar vacío. Un `.min(1)` en los platos de cada hueco parece una
 * salvaguarda y era un fallo total: la regla «los miércoles no planifiques cena»
 * le pide al modelo que deje el hueco vacío, el modelo obedecía con
 * `"dishes": []` y zod rechazaba la SEMANA ENTERA, así que ese hogar no podía
 * generar menú nunca. Quien decide si una semana vacía es un fallo es la Server
 * Action, que puede contestar «inténtalo de nuevo»; el schema solo tiene que
 * dejarla pasar.
 *
 * Lo que NO se prueba: la redacción del prompt (eso es `menu-prompt.ts`, texto),
 * ni qué contesta Gemini —para eso está `npm run compare:menu`, que genera de
 * verdad—, ni las consultas que reúnen el contexto (viven en la Server Action,
 * contra la base). Aquí solo las cuentas.
 */
import {
  buildCatalogIndex,
  collectRecentDishes,
  promptRecipeScore,
  recipeFitsActiveSlots,
  selectRecipesForPrompt,
  summarizeAvailability,
  type AvailabilityIngredient,
  type PromptRecipeCandidate,
  type RecentDishEntry,
  type RecipeAvailability,
} from "@/features/menus/prompt-context";
import {
  computeMissingIngredients,
  type CatalogEntry,
} from "@/features/menus/missing";
import {
  validateAndPatchRules,
  MAX_DISHES_PER_SLOT,
  PLACEHOLDER_DISH_TEXT,
  type MenuDay,
  type MenuDish,
  type MenuStructure,
  type ValidatableRule,
} from "@/features/menus/rules";
import {
  assessWeekBudget,
  servingsFactor,
  weeklyBudgetTarget,
} from "@/features/menus/week-budget";
import { menuSchema } from "@/lib/ai/menu-schema";
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
seccion("Y qué recetas NO entran: las que no tienen hueco donde caber");
// ---------------------------------------------------------------------------

{
  // Los huecos del hogar por defecto: comida y cena, sin desayuno.
  const SIN_DESAYUNO = ["lunch", "dinner"];
  const CON_DESAYUNO = ["breakfast", "lunch", "dinner"];

  check(
    "una receta de comida entra en un hogar que planifica comida",
    recipeFitsActiveSlots(["lunch"], SIN_DESAYUNO),
  );
  check(
    "una de comida o cena también",
    recipeFitsActiveSlots(["lunch", "dinner"], SIN_DESAYUNO),
  );

  // El fallo que esto fija: con el desayuno desactivado, una receta de solo
  // desayuno no tiene hueco donde ir —el prompt pide comida y cena, y
  // `enforceMin` respeta el tipo de comida—, así que mandarla al modelo solo
  // consigue que la ponga de cena. Pasó con «Tostadas con tomate».
  check(
    "una de solo desayuno NO entra si el hogar no planifica desayuno",
    !recipeFitsActiveSlots(["breakfast"], SIN_DESAYUNO),
  );
  check(
    "y sí entra en cuanto el hogar activa el desayuno",
    recipeFitsActiveSlots(["breakfast"], CON_DESAYUNO),
  );
  check(
    "una de desayuno o comida entra igual sin desayuno: le queda la comida",
    recipeFitsActiveSlots(["breakfast", "lunch"], SIN_DESAYUNO),
  );

  // Sin tipos declarados vale para cualquier hueco: filtrarla escondería medio
  // recetario de quien nunca rellenó ese campo.
  check(
    "una receta sin tipos declarados vale para cualquier hueco",
    recipeFitsActiveSlots([], SIN_DESAYUNO),
  );
  check(
    "un tipo que la app no conoce no cuela como hueco",
    !recipeFitsActiveSlots(["merienda"], SIN_DESAYUNO),
  );
  check(
    "sin huecos activos no cabe nada con tipo declarado",
    !recipeFitsActiveSlots(["lunch"], []),
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
seccion("Reglas de frecuencia: lo que el validador reescribe de tu semana");
// ---------------------------------------------------------------------------

const guardada = (id: string): MenuDish => ({ savedRecipeId: id, name: id });
const inventado = (name: string): MenuDish => ({ savedRecipeId: null, name });
const fijado = (id: string | null, name: string): MenuDish => ({
  savedRecipeId: id,
  name,
  immutable: true,
});

function minimo(
  id: string,
  value: number,
  mealTypes: string[] = [],
): ValidatableRule {
  return {
    kind: "recipe_min_week",
    recipeId: id,
    value,
    recipe: { name: id, mealTypes },
  };
}

function maximo(id: string, value: number): ValidatableRule {
  return {
    kind: "recipe_max_week",
    recipeId: id,
    value,
    recipe: { name: id, mealTypes: [] },
  };
}

function cuenta(menu: MenuStructure, id: string): number {
  return menu.days.reduce(
    (n, d) =>
      n +
      d.meals.reduce(
        (m, meal) =>
          m + meal.dishes.filter((x) => x.savedRecipeId === id).length,
        0,
      ),
    0,
  );
}

function marcadores(menu: MenuStructure): number {
  return menu.days.reduce(
    (n, d) =>
      n +
      d.meals.reduce(
        (m, meal) => m + meal.dishes.filter((x) => x.placeholder).length,
        0,
      ),
    0,
  );
}

{
  const entrada: MenuStructure = { days: [dia(0), dia(1)] };
  const antes = JSON.stringify(entrada);
  validateAndPatchRules(entrada, [minimo("A", 1)]);
  check(
    "no muta el menú que recibe (devuelve una copia)",
    JSON.stringify(entrada) === antes,
    entrada,
  );
}

{
  const menu: MenuStructure = {
    days: [
      dia(0, { comida: [guardada("A")] }),
      dia(1, { comida: [guardada("A")] }),
      dia(2, { comida: [guardada("A")] }),
    ],
  };
  const patched = validateAndPatchRules(menu, [maximo("A", 1)]);
  check(
    "el máximo recorta solo el EXCESO, no todas las apariciones",
    cuenta(patched, "A") === 1,
    cuenta(patched, "A"),
  );
  check(
    "y lo recortado queda como marcador, no como hueco vacío",
    marcadores(patched) === 2,
    marcadores(patched),
  );
  check(
    "el marcador lleva el texto que la inserción sabe leer",
    patched.days[2]!.meals[0]!.dishes[0]!.name === PLACEHOLDER_DISH_TEXT,
    patched.days[2]!.meals[0]!.dishes[0],
  );
  check(
    "sobrevive la PRIMERA aparición: se recorta de atrás hacia delante",
    patched.days[0]!.meals[0]!.dishes[0]!.savedRecipeId === "A",
    patched.days[0]!.meals[0]!.dishes[0],
  );
}

{
  // Un plato fijado o manual cuenta para el máximo pero no se puede recortar:
  // el usuario lo puso a mano y la regeneración respetuosa no lo toca.
  const menu: MenuStructure = {
    days: [
      dia(0, { comida: [fijado("A", "A")] }),
      dia(1, { comida: [guardada("A")] }),
    ],
  };
  const patched = validateAndPatchRules(menu, [maximo("A", 1)]);
  check(
    "el máximo no recorta un plato fijado",
    patched.days[0]!.meals[0]!.dishes[0]!.savedRecipeId === "A",
    patched.days[0]!.meals[0]!.dishes[0],
  );
  check(
    "recorta el que sí puede tocar",
    patched.days[1]!.meals[0]!.dishes[0]!.placeholder === true,
    patched.days[1]!.meals[0]!.dishes[0],
  );
}

{
  const menu: MenuStructure = { days: [dia(0), dia(1)] };
  const patched = validateAndPatchRules(menu, [minimo("A", 2)]);
  check(
    "el mínimo coloca tantos platos como falten",
    cuenta(patched, "A") === 2,
    cuenta(patched, "A"),
  );
}

{
  // El tipo de comida de la receta manda: una «solo cena» no puede caer en la
  // comida por mucho que ahí hubiera sitio antes.
  const menu: MenuStructure = { days: [dia(0)] };
  const patched = validateAndPatchRules(menu, [minimo("A", 1, ["dinner"])]);
  check(
    "una receta de solo cena no aterriza en la comida",
    patched.days[0]!.meals[0]!.dishes.length === 0,
    patched.days[0]!.meals[0],
  );
  check(
    "sino en la cena",
    patched.days[0]!.meals[1]!.dishes[0]!.savedRecipeId === "A",
    patched.days[0]!.meals[1],
  );
}

{
  const menu: MenuStructure = {
    days: [dia(0, { comida: [inventado("X"), inventado("Y")] })],
  };
  const patched = validateAndPatchRules(menu, [minimo("A", 1, ["lunch"])]);
  const comida = patched.days[0]!.meals[0]!;
  check(
    "sin sitio libre SUSTITUYE en vez de amontonar un tercer plato",
    comida.dishes.length === MAX_DISHES_PER_SLOT,
    comida.dishes,
  );
  check(
    "y la receta requerida acaba en el hueco",
    cuenta(patched, "A") === 1,
    comida.dishes,
  );
}

{
  // Un hueco con un plato fijado está RESERVADO: no se amplía aunque quepa.
  const menu: MenuStructure = {
    days: [dia(0, { comida: [fijado(null, "Lo que puso el usuario")] })],
  };
  const patched = validateAndPatchRules(menu, [minimo("A", 1, ["lunch"])]);
  check(
    "no se cuela un plato en un hueco con algo fijado, aunque quede sitio",
    cuenta(patched, "A") === 0,
    patched.days[0]!.meals[0]!.dishes,
  );
}

{
  const menu: MenuStructure = {
    days: [dia(0, { comida: [fijado("A", "A")] }), dia(1)],
  };
  const patched = validateAndPatchRules(menu, [minimo("A", 1)]);
  check(
    "un plato fijado CUENTA para el mínimo (no se duplica la receta)",
    cuenta(patched, "A") === 1,
    platosDe(patched),
  );
}

{
  // B está justo en su mínimo: sustituirlo para colocar A rompería su regla, así
  // que no se toca y A se queda sin colocar. Config imposible, no cuelgue.
  const menu: MenuStructure = {
    days: [dia(0, { comida: [guardada("B"), guardada("B")] })],
  };
  const patched = validateAndPatchRules(menu, [
    minimo("A", 1, ["lunch"]),
    minimo("B", 2),
  ]);
  check(
    "no sustituye una receta protegida por su propio mínimo",
    cuenta(patched, "B") === 2,
    patched.days[0]!.meals[0]!.dishes,
  );
  check(
    "y si no hay dónde colocarla, se rinde en vez de colgarse",
    cuenta(patched, "A") === 0,
    patched.days[0]!.meals[0]!.dishes,
  );
}

{
  // Con B por ENCIMA de su mínimo, una de sus apariciones sí es sustituible.
  const menu: MenuStructure = {
    days: [dia(0, { comida: [guardada("B"), guardada("B")] })],
  };
  const patched = validateAndPatchRules(menu, [
    minimo("A", 1, ["lunch"]),
    minimo("B", 1),
  ]);
  check(
    "una receta que sobrepasa su mínimo sí cede un hueco",
    cuenta(patched, "A") === 1 && cuenta(patched, "B") === 1,
    patched.days[0]!.meals[0]!.dishes,
  );
}

{
  // El orden importa: los máximos se aplican ANTES que los mínimos, porque
  // recortar excesos libera los huecos donde luego cabe lo que falta. Si se
  // invirtiera, B no encontraría sitio y su regla quedaría incumplida.
  const menu: MenuStructure = {
    days: [
      dia(0, {
        comida: [guardada("A"), guardada("A")],
        cena: [guardada("A"), guardada("A")],
      }),
    ],
  };
  const patched = validateAndPatchRules(menu, [maximo("A", 1), minimo("B", 1)]);
  check(
    "tras aplicar máximos y mínimos, las DOS reglas se cumplen",
    cuenta(patched, "A") <= 1 && cuenta(patched, "B") >= 1,
    { a: cuenta(patched, "A"), b: cuenta(patched, "B") },
  );
}

{
  // Se compara el CONTENIDO, no el JSON: `cloneMenu` reconstruye cada hueco y
  // sus claves salen en otro orden, así que dos menús idénticos no serializan
  // igual. Se parte de un menú CON plato para que "no se toca" signifique algo.
  const menu: MenuStructure = { days: [dia(0, { comida: [guardada("A")] })] };
  const patched = validateAndPatchRules(menu, [
    { kind: "free_text", recipeId: null, value: null, recipe: null },
    { kind: "skip_slot", recipeId: null, value: null, recipe: null },
  ]);
  check(
    "las reglas libres y los huecos sin planificar no se validan aquí",
    platosDe(patched).length === 1 &&
      cuenta(patched, "A") === 1 &&
      marcadores(patched) === 0,
    platosDe(patched),
  );
}

{
  // Una regla de frecuencia sin los metadatos de su receta (borrada, o de otro
  // hogar) no puede colocar nada: no se sabe ni cómo se llama ni si es cena.
  const menu: MenuStructure = { days: [dia(0)] };
  const patched = validateAndPatchRules(menu, [
    { kind: "recipe_min_week", recipeId: "A", value: 1, recipe: null },
  ]);
  check(
    "un mínimo sin datos de la receta no inventa un plato",
    platosDe(patched).length === 0,
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
  // Las 43 recetas del pack inicial vienen escritas para 2 raciones: una casa de
  // cuatro veía TODAS sus semanas a mitad de precio y el aviso no saltaba nunca.
  check(
    "una receta para 2 en una casa de 4 cuesta el doble",
    servingsFactor(2, 4) === 2,
    servingsFactor(2, 4),
  );
  check(
    "a igual número de raciones no se toca nada",
    servingsFactor(2, 2) === 1,
    servingsFactor(2, 2),
  );
  check(
    "una receta para 4 en una casa de 2 NO se parte por la mitad (se hace la olla entera)",
    servingsFactor(4, 2) === 1,
    servingsFactor(4, 2),
  );
  check(
    "unas raciones a cero no rompen la división",
    servingsFactor(0, 4) === 1 && servingsFactor(2, 0) === 1,
  );
}

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

seccion("Platos recientes: qué descarte se recupera y cuál no");

{
  /** Una entrada de una semana pasada, con el estado en el que quedó. */
  const entrada = (
    name: string,
    estado: {
      cooked?: boolean;
      skipped?: boolean;
      reason?: string | null;
    } = {},
  ): RecentDishEntry => ({
    recipeName: name,
    freeText: null,
    cookedAt: estado.cooked ? "2026-07-27" : null,
    skippedAt: estado.skipped ? "2026-07-27" : null,
    skippedReason: estado.reason ?? null,
  });
  const nombres = (entries: RecentDishEntry[]) =>
    collectRecentDishes(entries).map((d) => d.name);

  check(
    "lo cocinado entra, y marcado como cocinado",
    JSON.stringify(collectRecentDishes([entrada("Lentejas", { cooked: true })])) ===
      JSON.stringify([{ name: "Lentejas", cooked: true }]),
  );
  check(
    "lo planificado y sin resolver entra, pero sin cocinar",
    JSON.stringify(collectRecentDishes([entrada("Lentejas")])) ===
      JSON.stringify([{ name: "Lentejas", cooked: false }]),
  );

  /*
    El reparto que da sentido al motivo. Las tres primeras son imprevistos del
    DÍA: el plato no llegó a la mesa por algo ajeno a él, así que se cae de la
    lista y el generador lo puede recuperar la semana siguiente —que es lo que
    la app hacía con TODOS los descartes antes de que existiera el motivo—.
  */
  check(
    "descartado por comer fuera: se recupera",
    nombres([entrada("Lentejas", { skipped: true, reason: "ate_out" })])
      .length === 0,
  );
  check(
    "descartado por pedir algo: se recupera",
    nombres([entrada("Lentejas", { skipped: true, reason: "takeaway" })])
      .length === 0,
  );
  check(
    "descartado por faltar ingredientes: se recupera",
    nombres([
      entrada("Lentejas", { skipped: true, reason: "missing_ingredients" }),
    ]).length === 0,
  );

  /*
    Y la única que cambia de bando: «no nos apetecía» es un rechazo DEL PLATO,
    no del día. Si se cayera de la lista como los demás, el generador tendría vía
    libre para volver a ofrecer siete días después justo lo que el hogar acaba de
    rechazar. Este es el caso que justifica la columna entera: sin él, el motivo
    es un dato que nadie lee y la rama se borraría en cualquier limpieza sin que
    los tipos ni el resto de los checks se enteraran.
  */
  check(
    "descartado por no apetecer: NO se recupera, se queda como reciente",
    JSON.stringify(
      collectRecentDishes([
        entrada("Lentejas", { skipped: true, reason: "not_appealing" }),
      ]),
    ) === JSON.stringify([{ name: "Lentejas", cooked: false }]),
  );

  /*
    Descartar sin contestar el motivo conserva el comportamiento anterior a la
    columna: se recupera. Equivocarse hacia el rechazo sería peor —esconder un
    plato del recetario sin que nadie lo haya pedido—, y un silencio es más veces
    «cambió el día» que «no nos gusta».
  */
  check(
    "descartado sin motivo: se recupera (como antes de que hubiera motivos)",
    nombres([entrada("Lentejas", { skipped: true })]).length === 0,
  );
  check(
    "un motivo que la app no conoce no cuenta como rechazo",
    nombres([entrada("Lentejas", { skipped: true, reason: "vino_mi_suegra" })])
      .length === 0,
  );

  check(
    "el mismo plato dos veces sale una sola vez",
    JSON.stringify(nombres([entrada("Lentejas"), entrada("Lentejas")])) ===
      JSON.stringify(["Lentejas"]),
  );
  check(
    "basta que UNA vez se cocinara para que cuente como cocinado",
    collectRecentDishes([
      entrada("Lentejas"),
      entrada("Lentejas", { cooked: true }),
    ])[0]?.cooked === true,
  );
  check(
    "acentos y mayúsculas no crean un plato nuevo, y manda el nombre del primero",
    JSON.stringify(nombres([entrada("Puré de verduras"), entrada("PURE DE VERDURAS")])) ===
      JSON.stringify(["Puré de verduras"]),
  );
  check(
    "una entrada sin nombre no llega al prompt",
    nombres([
      { recipeName: null, freeText: null, cookedAt: null, skippedAt: null, skippedReason: null },
    ]).length === 0,
  );
  check(
    "el texto libre vale como nombre",
    JSON.stringify(
      nombres([
        {
          recipeName: null,
          freeText: "Sobras del domingo",
          cookedAt: null,
          skippedAt: null,
          skippedReason: null,
        },
      ]),
    ) === JSON.stringify(["Sobras del domingo"]),
  );
}

seccion("El contrato con el modelo: un hueco puede llegar vacío");

{
  const plato = () => ({
    recipe_name: "Gazpacho andaluz",
    saved_recipe_id: null,
    description: null,
    ingredients: [{ name: "Tomates", quantity: 1, unit: "kg" }],
  });
  /** Semana de 7 días con comida y cena, y los platos que decida `porHueco`. */
  const semana = (porHueco: (dia: number, hueco: string) => unknown[]) => ({
    days: Array.from({ length: 7 }, (_, day_index) => ({
      day_index,
      meals: ["lunch", "dinner"].map((slot) => ({
        slot,
        dishes: porHueco(day_index, slot),
      })),
    })),
  });

  check(
    "una semana normal cuadra con el schema",
    menuSchema.safeParse(semana(() => [plato()])).success,
  );

  // El fallo que esto fija: con `.min(1)` en `dishes`, el miércoles sin cena
  // tiraba la RESPUESTA ENTERA y un hogar con la regla «los miércoles no
  // planifiques cena» no podía generar menú nunca. El modelo obedece la
  // instrucción del prompt devolviendo el hueco vacío, y eso tiene que valer.
  check(
    "el hueco que el hogar no planifica llega vacío y la semana sigue valiendo",
    menuSchema.safeParse(
      semana((dia, hueco) =>
        dia === 2 && hueco === "dinner" ? [] : [plato()],
      ),
    ).success,
  );

  // Que una semana vacía del todo PARSEE no es un descuido: el schema no es
  // quien tiene que juzgar eso. Lo juzga `generateMenuAction`, que compara los
  // platos con los huecos que había que rellenar y ahí sí puede decir «no se
  // pudo generar, inténtalo de nuevo» en vez de perder la respuesta entera.
  check(
    "una semana entera vacía también parsea (juzgarla es cosa de la Server Action)",
    menuSchema.safeParse(semana(() => [])).success,
  );

  // El tope de platos por hueco NO está en el schema (sep-2026): `@ai-sdk/google`
  // no traslada `maxItems` a Gemini, así que no guiaba al modelo y lo único que
  // hacía era tirar la semana entera por un hueco con 3 platos. Lo recorta
  // `generateMenuAction` a `MAX_DISHES_PER_SLOT`, igual que el mínimo lo juzga
  // la acción y no el schema.
  check(
    "un hueco con 3 platos no tira la semana (el tope lo aplica la acción)",
    menuSchema.safeParse(semana(() => [plato(), plato(), plato()])).success,
  );

  check(
    "relajar el mínimo no ha relajado el resto: un plato sin nombre no vale",
    !menuSchema.safeParse(
      semana(() => [{ ...plato(), recipe_name: undefined }]),
    ).success,
  );

  check(
    "ni una unidad que la app no sabe convertir",
    !menuSchema.safeParse(
      semana(() => [
        { ...plato(), ingredients: [{ name: "Tomates", quantity: 1, unit: "cucharadas" }] },
      ]),
    ).success,
  );
}

console.log(
  fallos === 0
    ? "\nContexto del menú: todo correcto.\n"
    : `\nContexto del menú: ${fallos} fallo(s).\n`,
);
process.exit(fallos === 0 ? 0 : 1);
