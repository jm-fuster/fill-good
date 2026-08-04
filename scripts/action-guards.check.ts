/**
 * Comprobaciones de las guardas de las Server Actions que escriben los datos más
 * frágiles: las del menú y el descarte de tickets. Lo ejecuta
 * `npm run check:guardas` (ver `scripts/check-guards.mjs`, que lo empaqueta con
 * esbuild y sustituye Supabase, Clerk y las dos puertas de Next).
 *
 * Ejecuta las Server Actions REALES contra un cliente de Supabase falso, así que
 * no toca ninguna base ni necesita credenciales. Existe porque los cuatro fallos
 * de agosto de 2026 en `/menus` tenían todos la misma víctima y ningún check la
 * defendía: el par `menu_entries.recipe_id + cooked_at`, que es el ÚNICO sitio
 * donde vive la prueba de qué cocinó el hogar. De ahí salen `timesCooked` y
 * `lastCookedAt` (`getRecipeSignals`, lo que evita que el generador repita lo de
 * la semana pasada), el coste de la semana, los ingredientes de «añadir a la
 * lista lo que falte» y el descuento de la despensa al cocinar. Los cuatro
 * fallos fueron el mismo patrón: una regla razonada en una action y ausente en
 * su hermana.
 *
 * Lo que se fija aquí, y por qué no lo ve el compilador: las guardas son ramas
 * que devuelven un error, así que quitarlas no cambia ningún tipo. Lo que cambia
 * es lo que se ESCRIBE, y de eso solo se entera quien mire las escrituras. Por
 * eso cada caso comprueba dos cosas: el error que se devuelve y qué se ha tocado.
 *
 * El descarte de tickets vive aquí por ser de la misma familia con otra cara: ahí
 * la guarda existía —el borrado se filtra por `status`— y lo que faltaba era
 * CONTARLO, porque un borrado que no encuentra fila no es un error para Supabase
 * y la action devolvía «ok» sobre un ticket que seguía existiendo.
 *
 * Lo que NO cubre: el cliente falso entiende `.eq()`/`.is()` sobre listas y
 * devuelve una fila fija por tabla para `maybeSingle()`, no es un motor de SQL.
 * Así que no se prueba el camino feliz de copiar la semana (necesita que la
 * semana de origen tenga platos y la de destino no, o sea dos respuestas
 * distintas para la misma tabla), ni el reparto FIFO, ni nada que dependa de lo
 * que devolvería Postgres de verdad. Se prueban las DECISIONES de las actions.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  copyPreviousWeekAction,
  duplicateMenuEntryAction,
  rerollMenuEntryAction,
  updateMenuEntryAction,
} from "@/features/menus/actions";
import { deleteReceiptAction } from "@/features/receipts/actions";
import { getWeekDays, getWeekStart, shiftWeek } from "@/lib/dates";
import type { Database } from "@/lib/supabase/types";

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

// ---------------------------------------------------------------------------
// Cliente falso
// ---------------------------------------------------------------------------

type TableData = { single?: unknown; list?: unknown[] };
type Escritura = { tabla: string; op: string; datos: Record<string, unknown> };

/**
 * Cada tabla declara qué devuelve como fila única y como lista; toda escritura
 * se apunta y dice que ha ido bien. De los filtros solo entiende `.eq()` y
 * `.is()`, y solo cuando la columna existe en la fila de prueba: lo mismo que
 * hace el cliente falso de `check:alexa`, y por la misma razón —lo que se prueba
 * son las decisiones del código, no SQL—.
 *
 * `rpc` está aparte porque no es una tabla y porque es la palanca del caso más
 * fino de este check: `enforceAiRateLimit` llama a `record_ai_usage`, así que
 * decir «rate_limited» aquí permite comprobar el ORDEN entre la guarda y el
 * límite sin llamar nunca a la IA.
 */
function fake(
  tables: Record<string, TableData>,
  opciones: { rateLimited?: boolean } = {},
): SupabaseClient<Database> {
  const escrituras: Escritura[] = [];
  const from = (table: string): unknown => {
    const filtros: [string, unknown][] = [];
    const negados: [string, unknown][] = [];
    const rows = () =>
      (tables[table]?.list ?? []).filter((row) => {
        const fila = row as Record<string, unknown>;
        const pasa = ([columna, valor]: [string, unknown]) =>
          !(columna in fila) || fila[columna] === valor;
        return filtros.every(pasa) && !negados.some(pasa);
      });
    const chain: unknown = new Proxy(
      {},
      {
        get(_target, prop) {
          if (prop === "then") {
            return (resolve: (value: unknown) => void) =>
              resolve({ data: rows(), error: null });
          }
          if (prop === "maybeSingle" || prop === "single") {
            return () =>
              Promise.resolve({
                data: tables[table]?.single ?? null,
                error: null,
              });
          }
          if (prop === "eq" || prop === "is") {
            return (columna: string, valor: unknown) => {
              filtros.push([columna, valor]);
              return chain;
            };
          }
          // `.neq` se entiende para no aprobar por accidente: un filtro que el
          // falso ignorase dejaría pasar filas que en la base quedan fuera.
          if (prop === "neq") {
            return (columna: string, valor: unknown) => {
              negados.push([columna, valor]);
              return chain;
            };
          }
          if (prop === "insert" || prop === "update" || prop === "delete") {
            return (datos?: Record<string, unknown>) => {
              escrituras.push({ tabla: table, op: prop, datos: datos ?? {} });
              return chain;
            };
          }
          return () => chain;
        },
      },
    );
    return chain;
  };
  const rpc = async () => ({
    data: null,
    error: opciones.rateLimited ? { message: "rate_limited" } : null,
  });
  return { from, rpc, escrituras } as unknown as SupabaseClient<Database>;
}

function escriturasEn(
  cliente: SupabaseClient<Database>,
  tabla: string,
): Escritura[] {
  return (
    cliente as unknown as { escrituras: Escritura[] }
  ).escrituras.filter((e) => e.tabla === tabla);
}

/** Monta el cliente del caso y lo deja donde lo lee el sustituto de Supabase. */
function usar(
  tables: Record<string, TableData>,
  opciones: { rateLimited?: boolean } = {},
): SupabaseClient<Database> {
  const cliente = fake(
    {
      // El hogar del que todo cuelga. `getCurrentHousehold` corre de verdad: lee
      // esta membresía y, sin cookie de hogar activo, se queda con la única.
      household_members: {
        list: [
          {
            user_id: "u1",
            role: "owner",
            joined_at: "2026-01-01T00:00:00Z",
            household: {
              id: "h1",
              name: "Casa de prueba",
              invite_code: "ABC123",
              created_at: "2026-01-01T00:00:00Z",
              monthly_budget: 400,
            },
          },
        ],
      },
      ...tables,
    },
    opciones,
  );
  (globalThis as { __fakeSupabase?: unknown }).__fakeSupabase = cliente;
  return cliente;
}

// ---------------------------------------------------------------------------
// Fechas: relativas a hoy, para que el check no caduque
// ---------------------------------------------------------------------------

const SEMANA = getWeekStart();
/** Dos semanas atrás: entera en el pasado sea hoy el día que sea. */
const SEMANA_PASADA = shiftWeek(SEMANA, -2);
const DIA_DE_ESTA_SEMANA = getWeekDays(SEMANA)[3]!;
const DIA_DE_OTRA_SEMANA = getWeekDays(shiftWeek(SEMANA, 1))[0]!;

/*
  Id de entrada con forma de UUID de verdad, y no un «e1»: `updateMenuEntryAction`
  valida con zod antes de nada, así que con un id inventado devolvía «Invalid
  UUID» y los casos que esperaban CERO escrituras pasaban por la razón
  equivocada. Es la trampa de siempre al mirar escrituras: aprobar por un fallo
  anterior. Por eso, ahí donde se espera una escritura, se comprueba también que
  no haya error.
*/
const ENTRADA_ID = "11111111-1111-4111-8111-111111111111";
/** Id de ticket, por el mismo motivo que `ENTRADA_ID`. */
const TICKET_ID = "22222222-2222-4222-8222-222222222222";

const RESUELTO = "Ese plato ya está resuelto: para cambiarlo, deshaz la marca.";
const LIMITE = "Has generado menús muchas veces seguidas. Espera un poco y vuelve a intentarlo.";

console.log("\nGuardas de las acciones del menú\n");

// ---------------------------------------------------------------------------
// 1. Copiar la semana anterior sobre una semana ya pasada
// ---------------------------------------------------------------------------

console.log("copyPreviousWeekAction");
{
  const cliente = usar({
    weekly_menus: { single: { id: "m-prev" } },
    menu_entries: { list: [{ menu_id: "m-prev", date: SEMANA_PASADA }] },
  });
  const r = await copyPreviousWeekAction(SEMANA_PASADA);

  check("una semana entera pasada se rechaza", Boolean(r.error), r);
  check(
    "y lo dice por lo que es, no por otra cosa",
    (r.error ?? "").includes("ya ha pasado"),
    r,
  );
  /*
    Cero escrituras es LA aserción: sembrar platos en días ya vividos creaba
    entradas sin `cooked_at` que el repaso preguntaba una a una sin que nadie las
    hubiera planificado.
  */
  check(
    "no siembra ni un plato en días ya vividos",
    escriturasEn(cliente, "menu_entries").length === 0,
    escriturasEn(cliente, "menu_entries"),
  );
  /*
    Y ni siquiera crea el menú de esa semana: la guarda va ANTES de `ensureMenu`.
    Si se colara detrás, quedaría una fila de `weekly_menus` vacía por cada vez
    que alguien lo intenta.
  */
  check(
    "ni crea el menú de esa semana",
    escriturasEn(cliente, "weekly_menus").length === 0,
    escriturasEn(cliente, "weekly_menus"),
  );
}

// ---------------------------------------------------------------------------
// 2. «Otra idea» sobre un plato ya resuelto
// ---------------------------------------------------------------------------

console.log("\nrerollMenuEntryAction");

/** Entrada tal como la lee el reroll, con su semana embebida. */
function entrada(extra: Record<string, unknown>) {
  return {
    single: {
      menu_id: "m1",
      meal_slot: "dinner",
      cooked_at: null,
      skipped_at: null,
      menu: { week_start: SEMANA },
      ...extra,
    },
  };
}

{
  const cliente = usar({ menu_entries: entrada({ cooked_at: SEMANA }) });
  const r = await rerollMenuEntryAction(ENTRADA_ID);
  check("un plato cocinado no se cambia por otra idea", r.error === RESUELTO, r);
  check(
    "y no se toca la entrada",
    escriturasEn(cliente, "menu_entries").length === 0,
  );
}

{
  const cliente = usar({ menu_entries: entrada({ skipped_at: SEMANA }) });
  const r = await rerollMenuEntryAction(ENTRADA_ID);
  check("un plato marcado «no se hizo» tampoco", r.error === RESUELTO, r);
  check(
    "y tampoco se toca",
    escriturasEn(cliente, "menu_entries").length === 0,
  );
}

/*
  El orden importa y es lo que fija este par: la guarda va antes del rate limit,
  así que negar un reroll no gasta cuota de IA. Con el contador diciendo
  «rate_limited» en los dos casos, el error delata quién habló primero.
*/
{
  usar({ menu_entries: entrada({ cooked_at: SEMANA }) }, { rateLimited: true });
  const r = await rerollMenuEntryAction(ENTRADA_ID);
  check("la guarda habla ANTES del rate limit (no gasta cuota)", r.error === RESUELTO, r);
}

{
  usar({ menu_entries: entrada({}) }, { rateLimited: true });
  const r = await rerollMenuEntryAction(ENTRADA_ID);
  check(
    "y un plato sin resolver la pasa (llega al rate limit)",
    r.error === LIMITE,
    r,
  );
}

// ---------------------------------------------------------------------------
// 3. Guardar el texto de un plato enlazado a una receta
// ---------------------------------------------------------------------------

console.log("\nupdateMenuEntryAction");

const ENLAZADO = { single: { recipe: { name: "Gazpacho" } } };

{
  const cliente = usar({ menu_entries: ENLAZADO });
  const r = await updateMenuEntryAction(ENTRADA_ID, "Gazpacho");
  check("guardar el MISMO nombre no escribe nada", !r.error, r);
  /*
    Lo que se protege: el update pone `recipe_id` a null a propósito (editar
    desvincula), y el panel llega con el nombre de la receta ya escrito. Sin esta
    rama, abrir el panel y pulsar «Guardar» desvinculaba la receta sin que nadie
    hubiera cambiado nada, y con ella se iban coste, ingredientes y señales.
  */
  check(
    "y por tanto no desvincula la receta",
    escriturasEn(cliente, "menu_entries").length === 0,
    escriturasEn(cliente, "menu_entries"),
  );
}

{
  const cliente = usar({ menu_entries: ENLAZADO });
  await updateMenuEntryAction(ENTRADA_ID, "  GAZPACHO  ");
  check(
    "ni con otras mayúsculas y espacios (compara normalizado)",
    escriturasEn(cliente, "menu_entries").length === 0,
  );
}

{
  const cliente = usar({ menu_entries: ENLAZADO });
  const r = await updateMenuEntryAction(ENTRADA_ID, "Gazpacho con picatostes");
  const [escritura] = escriturasEn(cliente, "menu_entries");
  check("un nombre distinto SÍ se guarda", !r.error && escritura?.op === "update", {
    r,
    escritura,
  });
  check(
    "y entonces sí desvincula, que es lo pedido",
    escritura?.datos.recipe_id === null && escritura?.datos.source === "manual",
    escritura,
  );
}

{
  const cliente = usar({ menu_entries: ENLAZADO });
  const r = await updateMenuEntryAction(ENTRADA_ID, "   ");
  check(
    "sin texto se quita el plato (misma semántica que «Quitar»)",
    !r.error && escriturasEn(cliente, "menu_entries")[0]?.op === "delete",
    { r, escrituras: escriturasEn(cliente, "menu_entries") },
  );
}

// ---------------------------------------------------------------------------
// 4. Duplicar un plato fuera de su semana
// ---------------------------------------------------------------------------

console.log("\nduplicateMenuEntryAction");

const ORIGEN = {
  single: {
    menu_id: "m1",
    recipe_id: "r1",
    free_text: null,
    menu: { week_start: SEMANA },
  },
};

{
  const cliente = usar({ menu_entries: ORIGEN });
  const r = await duplicateMenuEntryAction(ENTRADA_ID, DIA_DE_OTRA_SEMANA, "dinner");
  check("una fecha de otra semana se rechaza", Boolean(r.error), r);
  /*
    La copia se inserta con el `menu_id` del original: con una fecha de otra
    semana la fila nace invisible en la UI —que pinta semana por semana— y a la
    vez viva para el repaso, que busca por rango de fechas y no por `menu_id`.
  */
  check(
    "y no nace ningún plato fantasma",
    escriturasEn(cliente, "menu_entries").length === 0,
    escriturasEn(cliente, "menu_entries"),
  );
}

{
  const cliente = usar({ menu_entries: ORIGEN });
  const r = await duplicateMenuEntryAction(
    ENTRADA_ID,
    DIA_DE_ESTA_SEMANA,
    "dinner",
  );
  const [escritura] = escriturasEn(cliente, "menu_entries");
  check("dentro de la semana sí duplica", !r.error && escritura?.op === "insert", {
    r,
    escritura,
  });
  check(
    "acotado al hogar",
    escritura?.datos.household_id === "h1",
    escritura,
  );
  /*
    La copia nace sin cocinar: copiar `cooked_at` daría por comido un plato que
    nadie ha hecho, y además lo sacaría del repaso.
  */
  check(
    "y nace sin cocinar ni marcar",
    !("cooked_at" in (escritura?.datos ?? {})) &&
      !("skipped_at" in (escritura?.datos ?? {})),
    escritura,
  );
}

// ---------------------------------------------------------------------------
// 5. Descartar un ticket ya confirmado
// ---------------------------------------------------------------------------

/*
  Esta guarda ES de otra clase que las cuatro de arriba, y por eso está aquí: el
  borrado ya se filtraba con `.neq("status", "confirmed")`, o sea que un ticket
  confirmado NUNCA se borraba. Lo que fallaba era el parte de guerra — un borrado
  que no encuentra fila no es un error para Supabase, así que la action decía `ok`
  y la pantalla remataba con «Ticket descartado» sobre un ticket que seguía ahí,
  con su stock y sus precios dentro del hogar.

  Lo que se fija es que se lea el estado ANTES y se conteste con la verdad. Ojo:
  este check NO puede fijarlo por las escrituras, porque el cliente falso no
  distingue «borré una fila» de «no borré ninguna» — igual que Supabase—. Se fija
  por el error, que es justo lo que faltaba.
*/
console.log("\ndeleteReceiptAction");

{
  const cliente = usar({ receipts: { single: { status: "confirmed" } } });
  const r = await deleteReceiptAction(TICKET_ID);
  check(
    "un ticket confirmado no se descarta en silencio",
    (r.error ?? "").includes("ya está confirmado"),
    r,
  );
  check(
    "y no se intenta borrar",
    escriturasEn(cliente, "receipts").length === 0,
    escriturasEn(cliente, "receipts"),
  );
}

{
  usar({ receipts: { single: null } });
  const r = await deleteReceiptAction(TICKET_ID);
  check("un ticket que no existe lo dice", r.error === "Ticket no encontrado.", r);
}

{
  const cliente = usar({ receipts: { single: { status: "parsed" } } });
  const r = await deleteReceiptAction(TICKET_ID);
  check("uno sin confirmar sí se descarta", !r.error, r);
  check(
    "y se borra de verdad",
    escriturasEn(cliente, "receipts")[0]?.op === "delete",
    escriturasEn(cliente, "receipts"),
  );
}

console.log(
  fallos === 0
    ? "\nGuardas de las acciones: todo correcto.\n"
    : `\nGuardas de las acciones: ${fallos} fallo(s).\n`,
);
process.exit(fallos === 0 ? 0 : 1);
