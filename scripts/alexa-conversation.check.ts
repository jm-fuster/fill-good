/**
 * Comprobaciones de la conversación de la skill de Alexa. Lo ejecuta
 * `npm run check:alexa` (ver `scripts/check-alexa.mjs`, que lo empaqueta con
 * esbuild porque esto es TypeScript y tira del alias `@/`).
 *
 * Ejecuta el despacho REAL (`dispatchAlexaRequest`) contra un cliente de
 * Supabase falso, así que prueba los handlers de verdad sin tocar ninguna base
 * ni necesitar credenciales. Cubre lo que ni el compilador ni el simulador de
 * Amazon pueden cubrir: que el estado de la conversación sobreviva a la ida y
 * vuelta por el dispositivo, y que una orden interrumpida se retome bien.
 *
 * Lo que NO se prueba aquí es el reconocimiento de voz: qué frase cae en qué
 * intent lo decide Alexa, y eso solo se ve en el simulador de la consola.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { dispatchAlexaRequest } from "@/features/alexa/handlers";
import { ordinalFromWord, pickCandidate } from "@/features/alexa/resolve";
import { SPEECH, speak, type SessionState } from "@/features/alexa/respond";
import {
  alexaEnvelopeSchema,
  getSpokenQuantity,
} from "@/features/alexa/schemas";
import { shiftDays, todayLocalISO } from "@/lib/dates";
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

const APP = "amzn1.ask.skill.test";

/**
 * Cliente de Supabase falso: cada tabla declara qué devuelve como fila única y
 * como lista, y toda escritura dice que ha ido bien.
 *
 * De todos los filtros solo entiende `.eq()`, y solo cuando la columna existe en
 * la fila de prueba: así se puede comprobar lo que sí decide el código (que el
 * menú se acote a un hueco, que los artículos marcados no se lean) sin acabar
 * escribiendo un motor de SQL. Lo que se prueba son las decisiones de la
 * conversación.
 */
type TableData = { single?: unknown; list?: unknown[] };
type Escritura = { tabla: string; op: string; datos: Record<string, unknown> };

/** Las escrituras que ha intentado el código, para poder mirarlas después. */
function escriturasDe(admin: SupabaseClient<Database>): Escritura[] {
  return (admin as unknown as { escrituras: Escritura[] }).escrituras;
}

/**
 * Las escrituras de una tabla. NO vacía el registro a propósito: un mismo caso
 * suele mirar varias tablas, y una versión que limpiaba al leer dejaba la
 * segunda consulta vacía —y por tanto la aserción, aprobando sola—. Cada caso
 * que mire escrituras empieza con `limpiarEscrituras`.
 */
function escriturasEn(
  admin: SupabaseClient<Database>,
  tabla: string,
): Escritura[] {
  return escriturasDe(admin).filter((e) => e.tabla === tabla);
}

/**
 * Olvida lo escrito hasta ahora. Los clientes falsos se comparten entre casos,
 * así que sin esto un caso que mira escrituras vería también las del anterior.
 */
function limpiarEscrituras(admin: SupabaseClient<Database>): void {
  escriturasDe(admin).length = 0;
}

function fakeAdmin(tables: Record<string, TableData>): SupabaseClient<Database> {
  const escrituras: Escritura[] = [];
  const from = (table: string): unknown => {
    const filtros: [string, unknown][] = [];
    const rows = () =>
      (tables[table]?.list ?? []).filter((row) =>
        filtros.every(([columna, valor]) => {
          const fila = row as Record<string, unknown>;
          return !(columna in fila) || fila[columna] === valor;
        }),
      );
    const chain: unknown = new Proxy(
      {},
      {
        get(_target, prop) {
          // El eslabón es "thenable": así `await supabase.from(x).select(y)`
          // resuelve igual que en el cliente de verdad.
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
          // `.is(col, null)` filtra igual que `.eq` con null, y es como se pide
          // «lo que no está saltado» o «sin autor».
          if (prop === "eq" || prop === "is") {
            return (columna: string, valor: unknown) => {
              filtros.push([columna, valor]);
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
  return { from, escrituras } as unknown as SupabaseClient<Database>;
}

const LINK = { single: { id: "l1", household_id: "h1", user_id: "u1" } };
// El vínculo va siempre con su membresía viva: requireLink la re-verifica en
// cada petición (auditoría 2026-07-31). Sin esta fila, el vínculo se borra.
const MIEMBRO = { single: { user_id: "u1" } };
const LISTA = { single: { id: "list1" } };

const YOGUR_NATURAL = {
  id: "p1",
  name: "Yogur natural",
  normalized_name: "yogur natural",
  default_unit: "ud",
  default_location: "fridge",
};
const YOGUR_GRIEGO = {
  id: "p2",
  name: "Yogur griego",
  normalized_name: "yogur griego",
  default_unit: "ud",
  default_location: "fridge",
};
const SEIS_YOGURES = {
  list: [
    { id: "i1", quantity: 6, unit: "ud", location: "fridge", expiry_date: null },
  ],
};

const YOGURES = fakeAdmin({
  alexa_links: LINK, household_members: MIEMBRO,
  products: { list: [YOGUR_NATURAL] },
  inventory_items: SEIS_YOGURES,
  shopping_lists: LISTA,
  // El id que devuelve el insert del historial: es lo que anota el deshacer.
  inventory_events: { single: { id: "ev-nuevo" } },
});

/** Dos productos que se parecen: el caso que obliga a preguntar. */
const DOS_YOGURES = fakeAdmin({
  alexa_links: LINK, household_members: MIEMBRO,
  products: { list: [YOGUR_NATURAL, YOGUR_GRIEGO] },
  inventory_items: SEIS_YOGURES,
  shopping_lists: LISTA,
});

const ARROZ = fakeAdmin({
  alexa_links: LINK, household_members: MIEMBRO,
  products: {
    list: [
      {
        id: "p2",
        name: "Arroz",
        normalized_name: "arroz",
        default_unit: "kg",
        default_location: "pantry",
      },
    ],
  },
  inventory_items: {
    list: [
      { id: "i2", quantity: 2, unit: "kg", location: "pantry", expiry_date: null },
    ],
  },
  shopping_lists: LISTA,
});

const VACIO = fakeAdmin({ alexa_links: LINK, household_members: MIEMBRO, shopping_lists: LISTA });

/** Un Echo que todavía no se ha vinculado con ningún hogar. */
const SIN_VINCULO = fakeAdmin({});

const MANANA = shiftDays(todayLocalISO(), 1);
const HOY = todayLocalISO();

/** Hogar con cosas que decir: lista con artículos y dos productos que caducan. */
const CON_AVISOS = fakeAdmin({
  alexa_links: LINK, household_members: MIEMBRO,
  shopping_lists: LISTA,
  shopping_list_items: {
    list: [
      { id: "sli-1", name: "Pan", is_checked: false, product: null },
      // El rótulo quedó desfasado tras renombrar el producto: manda el producto.
      {
        id: "sli-2",
        name: "Leche",
        is_checked: false,
        product: { name: "Leche entera" },
      },
      // Ya en el carro: no se lee ni se puede volver a tachar.
      { id: "sli-3", name: "Arroz", is_checked: true, product: null },
    ],
  },
  inventory_items: {
    list: [
      { expiry_date: HOY, product: { name: "Pollo" } },
      { expiry_date: MANANA, product: { name: "Yogur natural" } },
      // Segundo lote del mismo yogur: es una sola cosa de la que preocuparse.
      { expiry_date: MANANA, product: { name: "Yogur natural" } },
    ],
  },
});

const CON_MENU = fakeAdmin({
  alexa_links: LINK, household_members: MIEMBRO,
  shopping_lists: LISTA,
  weekly_menus: { single: { id: "m1" } },
  menu_entries: {
    list: [
      // A propósito en orden inverso: el orden lo pone SLOT_ORDER, no la query.
      {
        meal_slot: "dinner",
        free_text: null,
        skipped_at: null,
        recipe: { name: "Tortilla" },
      },
      { meal_slot: "lunch", free_text: "Lentejas", skipped_at: null, recipe: null },
      // Ya dijiste que este desayuno no lo hacías: no se cuenta.
      {
        meal_slot: "breakfast",
        free_text: "Tostadas",
        skipped_at: "2026-07-29T08:00:00Z",
        recipe: null,
      },
    ],
  },
});

/** Hogar con la cena de hoy planificada y su receta detrás. */
const CON_RECETA = fakeAdmin({
  alexa_links: LINK, household_members: MIEMBRO,
  weekly_menus: { single: { id: "m1" } },
  menu_entries: {
    list: [
      {
        id: "e1",
        meal_slot: "dinner",
        free_text: null,
        cooked_at: null,
        recipe_id: "r1",
        recipe: { name: "Lasaña de verduras" },
      },
    ],
  },
  recipe_ingredients: {
    list: [
      { name: "Tomate", quantity: 2, unit: "ud", product_id: "p-tomate" },
      // Sin producto en el catálogo: se queda fuera del descuento.
      { name: "Bechamel", quantity: 1, unit: "ud", product_id: null },
    ],
  },
  products: {
    list: [
      {
        id: "p-tomate",
        name: "Tomate frito",
        normalized_name: "tomate frito",
        default_unit: "ud",
        default_location: "pantry",
      },
    ],
  },
  inventory_items: {
    list: [
      {
        id: "lot-tomate",
        product_id: "p-tomate",
        quantity: 5,
        unit: "ud",
        location: "pantry",
        expiry_date: null,
      },
    ],
  },
  inventory_events: { single: { id: "ev-cocina" } },
});

function envelope(request: unknown, attributes?: SessionState) {
  return {
    version: "1.0",
    session: {
      new: false,
      sessionId: "s1",
      application: { applicationId: APP },
      user: { userId: "amzn1.ask.account.TEST" },
      ...(attributes ? { attributes } : {}),
    },
    request,
  };
}

let contador = 0;
function intentRequest(name: string, slots: Record<string, unknown> = {}) {
  contador += 1;
  return {
    type: "IntentRequest",
    requestId: `r-${contador}`,
    timestamp: "2026-07-29T10:00:00Z",
    locale: "es-ES",
    intent: { name, slots },
  };
}

/** Un slot tal como lo manda Alexa; con `id` si lo resolvió a un valor nuestro. */
function slot(name: string, value: string, id?: string) {
  return {
    name,
    value,
    ...(id
      ? {
          resolutions: {
            resolutionsPerAuthority: [
              {
                status: { code: "ER_SUCCESS_MATCH" },
                values: [{ value: { name: value, id } }],
              },
            ],
          },
        }
      : {}),
  };
}

async function run(
  request: unknown,
  attributes?: SessionState,
  admin: SupabaseClient<Database> = VACIO,
) {
  const parsed = alexaEnvelopeSchema.safeParse(envelope(request, attributes));
  if (!parsed.success) {
    throw new Error(`envelope inválido: ${parsed.error.message}`);
  }
  return dispatchAlexaRequest(parsed.data, admin);
}

type Respuesta = Awaited<ReturnType<typeof run>>;
const text = (r: Respuesta) => r.response.outputSpeech?.text ?? "";

/** Lo que Alexa nos devolvería en el turno siguiente: pasa por JSON, como allí. */
const siguienteTurno = (r: Respuesta) =>
  JSON.parse(JSON.stringify(r.sessionAttributes ?? {})) as SessionState;

const candidatos = [
  { id: "p1", name: "Yogur natural" },
  { id: "p2", name: "Yogur griego" },
];
const elegirRestar = (cantidad: number | null): SessionState => ({
  pendiente: { tipo: "elegir", accion: "restar", candidatos, cantidad, unidad: null },
});

async function main() {
  console.log("\n1. Ida y vuelta del estado de sesión por el esquema");
  {
    const emitido = speak("x", { state: elegirRestar(2) });
    const vuelta = alexaEnvelopeSchema.safeParse(
      envelope(
        intentRequest("RespuestaIntent"),
        JSON.parse(JSON.stringify(emitido.sessionAttributes)) as SessionState,
      ),
    );
    check("el «elegir» emitido vuelve a parsear", vuelta.success);
    const pendiente = vuelta.success
      ? vuelta.data.session?.attributes?.pendiente
      : null;
    check(
      "conserva acción, candidatos y cantidad",
      pendiente?.tipo === "elegir" &&
        pendiente.accion === "restar" &&
        pendiente.candidatos.length === 2 &&
        pendiente.cantidad === 2 &&
        pendiente.unidad === null,
      pendiente,
    );
  }
  {
    const emitido = speak("x", {
      state: {
        pendiente: { tipo: "unidad", accion: "sumar", productId: "p1", name: "Arroz" },
      },
    });
    const vuelta = alexaEnvelopeSchema.safeParse(
      envelope(intentRequest("RespuestaIntent"), emitido.sessionAttributes),
    );
    check(
      "el «unidad» emitido vuelve a parsear",
      vuelta.success &&
        vuelta.data.session?.attributes?.pendiente?.tipo === "unidad",
    );
  }
  {
    const vuelta = alexaEnvelopeSchema.safeParse(
      envelope(intentRequest("AMAZON.YesIntent"), {
        pendiente: { tipo: "loQueSea", cosa: 1 },
      } as unknown as SessionState),
    );
    check(
      "un pendiente corrupto se ignora en vez de dar 400",
      vuelta.success && vuelta.data.session?.attributes?.pendiente === undefined,
    );
  }

  console.log("\n2. Cantidades habladas (AMAZON.NUMBER no sabe de fracciones)");
  check(
    "«medio kilo» → 0,5",
    getSpokenQuantity({
      name: "RestarStockIntent",
      slots: {
        fraccion: slot("fraccion", "medio", "0.5"),
        unidad: slot("unidad", "kilos", "kg"),
      },
    }) === 0.5,
  );
  check(
    "«un cuarto de kilo» → 0,25 aunque el «un» caiga en cantidad",
    getSpokenQuantity({
      name: "RestarStockIntent",
      slots: {
        cantidad: slot("cantidad", "1"),
        fraccion: slot("fraccion", "un cuarto", "0.25"),
      },
    }) === 0.25,
  );
  check(
    "«dos kilos» sigue siendo 2",
    getSpokenQuantity({
      name: "RestarStockIntent",
      slots: {
        cantidad: slot("cantidad", "2"),
        unidad: slot("unidad", "kilos", "kg"),
      },
    }) === 2,
  );
  check(
    "sin cantidad sigue siendo null",
    getSpokenQuantity({ name: "RestarStockIntent", slots: {} }) === null,
  );

  console.log("\n3. Elegir entre candidatos (puro)");
  check("«natural» elige el natural", pickCandidate("natural", candidatos)?.id === "p1");
  check("«el natural» con artículo también", pickCandidate("el natural", candidatos)?.id === "p1");
  check("«griegos» en plural también", pickCandidate("griegos", candidatos)?.id === "p2");
  check("el nombre completo también", pickCandidate("yogur natural", candidatos)?.id === "p1");
  check("«yogur» a secas sigue siendo ambiguo", pickCandidate("yogur", candidatos) === null);
  check("algo que no está devuelve null", pickCandidate("leche", candidatos) === null);
  check("«la primera» → 1", ordinalFromWord("la primera") === 1);
  check("«segundo» → 2", ordinalFromWord("segundo") === 2);
  check("«natural» no es un ordinal", ordinalFromWord("natural") === null);

  console.log("\n4. Modo conversación (¿Algo más?)");
  {
    const r = await run({
      type: "LaunchRequest",
      requestId: "r0",
      timestamp: "2026-07-29T10:00:00Z",
      locale: "es-ES",
    });
    check("abrir la skill enciende el modo", r.sessionAttributes?.conversacion === true);
    check("y deja la sesión abierta", r.response.shouldEndSession === false);
  }
  {
    const r = await run(intentRequest("AMAZON.HelpIntent"), { conversacion: true });
    check("la ayuda propaga el modo", r.sessionAttributes?.conversacion === true);
    check("sin colar un «¿Algo más?» donde ya hay pregunta", !text(r).includes("¿Algo más?"));
  }
  {
    const r = await run(intentRequest("AMAZON.StopIntent"), { conversacion: true });
    check("«para» cierra de verdad", r.response.shouldEndSession === true);
    check("y no se le pega «¿Algo más?»", text(r) === SPEECH.stop, text(r));
  }
  {
    const r = await run(intentRequest("AMAZON.NoIntent"), { conversacion: true });
    check(
      "un «no» sin nada pendiente cierra",
      r.response.shouldEndSession === true && text(r) === SPEECH.stop,
      text(r),
    );
  }
  {
    const r = await run(intentRequest("AMAZON.HelpIntent"));
    check("fuera del modo, la marca no aparece", r.sessionAttributes?.conversacion === undefined);
  }

  console.log("\n5. Guardarraíles de las respuestas sueltas");
  {
    const r = await run(
      intentRequest("RespuestaIntent", { producto: slot("producto", "natural") }),
    );
    check("sin nada pendiente no hace nada", text(r) === SPEECH.nothingPending, text(r));
    check("y deja hablar otra vez", r.response.shouldEndSession === false);
  }
  {
    const r = await run(intentRequest("AMAZON.YesIntent"), elegirRestar(2));
    check(
      "un «sí» a un «¿cuál de ellas?» vuelve a preguntar",
      text(r) === SPEECH.ambiguousRetry(["Yogur natural", "Yogur griego"]),
      text(r),
    );
    check("y NO pierde la pregunta", r.sessionAttributes?.pendiente?.tipo === "elegir");
  }
  {
    const r = await run(
      intentRequest("RespuestaIntent", { producto: slot("producto", "yogur") }),
      elegirRestar(2),
      DOS_YOGURES,
    );
    check(
      "una respuesta que sigue siendo ambigua no adivina",
      text(r) === SPEECH.ambiguousRetry(["Yogur natural", "Yogur griego"]),
      text(r),
    );
  }
  {
    const r = await run(
      intentRequest("RespuestaIntent", { producto: slot("producto", "arroz") }),
      { pendiente: { tipo: "unidad", accion: "sumar", productId: "p2", name: "Arroz" } },
      ARROZ,
    );
    check(
      "una respuesta sin unidad vuelve a preguntar la unidad, con SU verbo",
      text(r) === SPEECH.askUnitReprompt("añado"),
      text(r),
    );
    check("conservando el pendiente", r.sessionAttributes?.pendiente?.tipo === "unidad");
  }
  {
    const r = await run(intentRequest("AMAZON.NoIntent"), {
      pendiente: { tipo: "apuntar", productId: "p1", name: "Pan", normalized: "pan" },
    });
    check("un «no» cancela lo pendiente", text(r) === SPEECH.emptiedNo, text(r));
    check("y no lo devuelve", r.sessionAttributes?.pendiente === undefined);
  }

  console.log("\n6. Retomar la orden interrumpida");
  {
    const r = await run(
      intentRequest("RespuestaIntent", { producto: slot("producto", "natural") }),
      elegirRestar(2),
      YOGURES,
    );
    check(
      "«el natural» retoma el «quita dos yogures» sin repetirlo",
      text(r) === "Vale, he quitado 2 unidades de Yogur natural. Ahora hay 4 unidades.",
      text(r),
    );
    check("y la pregunta ya no sigue viva", r.sessionAttributes?.pendiente === undefined);
  }
  {
    const r = await run(
      intentRequest("RespuestaIntent", { orden: slot("orden", "1") }),
      {
        pendiente: {
          tipo: "elegir",
          accion: "consultar",
          candidatos,
          cantidad: null,
          unidad: null,
        },
      },
      YOGURES,
    );
    check(
      "«la primera» vale igual, y consultar no escribe",
      text(r) === "Te quedan 6 unidades de Yogur natural.",
      text(r),
    );
  }
  {
    const r = await run(
      intentRequest("RespuestaIntent", { producto: slot("producto", "natural") }),
      elegirRestar(6),
      YOGURES,
    );
    check(
      "quedarse a cero ofrece apuntarlo",
      text(r) ===
        `Vale, he quitado 6 unidades de Yogur natural. Ya no queda nada.${SPEECH.offerList}`,
      text(r),
    );
    check("con la sesión abierta para el «sí»", r.response.shouldEndSession === false);
    check(
      "y el producto guardado",
      r.sessionAttributes?.pendiente?.tipo === "apuntar" &&
        r.sessionAttributes.pendiente.productId === "p1",
      r.sessionAttributes,
    );
  }
  {
    const r = await run(
      intentRequest("RespuestaIntent", {
        fraccion: slot("fraccion", "medio", "0.5"),
        unidad: slot("unidad", "kilos", "kg"),
      }),
      { pendiente: { tipo: "unidad", accion: "restar", productId: "p2", name: "Arroz" } },
      ARROZ,
    );
    check(
      "«medio kilo» a secas completa la resta a granel",
      text(r) === "Vale, he quitado 0,5 kilos de Arroz. Ahora hay 1,5 kilos.",
      text(r),
    );
  }
  {
    const r = await run(
      intentRequest("RespuestaIntent", { producto: slot("producto", "natural") }),
      { ...elegirRestar(2), conversacion: true },
      YOGURES,
    );
    check("en modo conversación remata con «¿Algo más?»", text(r).endsWith("¿Algo más?"), text(r));
    check("y no cierra", r.response.shouldEndSession === false);
    check("con reprompt, que Amazon lo exige", r.response.reprompt !== undefined);
    check("y el modo sigue encendido", r.sessionAttributes?.conversacion === true);
  }
  {
    const r = await run(
      intentRequest("RestarStockIntent", {
        producto: slot("producto", "yogures"),
        cantidad: slot("cantidad", "2"),
      }),
      undefined,
      YOGURES,
    );
    check(
      "la misma orden de una tacada NO se convierte en charla",
      text(r) === "Vale, he quitado 2 unidades de Yogur natural. Ahora hay 4 unidades.",
      text(r),
    );
    check("y cierra al terminar", r.response.shouldEndSession === true);
  }

  console.log("\n7. El otro lado: preguntar cuál era");
  {
    const r = await run(
      intentRequest("RestarStockIntent", {
        producto: slot("producto", "yogures"),
        cantidad: slot("cantidad", "2"),
      }),
      undefined,
      DOS_YOGURES,
    );
    check(
      "con dos parecidos pregunta en vez de adivinar",
      text(r) ===
        "Tengo varias cosas que se parecen a yogures: Yogur natural y Yogur griego. ¿Cuál de ellas?",
      text(r),
    );
    check("dejando la sesión abierta", r.response.shouldEndSession === false);
    const pendiente = r.sessionAttributes?.pendiente;
    check(
      "y guardando la orden entera para retomarla",
      pendiente?.tipo === "elegir" &&
        pendiente.accion === "restar" &&
        pendiente.cantidad === 2 &&
        pendiente.candidatos.length === 2,
      pendiente,
    );
    const r2 = await run(
      intentRequest("RespuestaIntent", { producto: slot("producto", "el griego") }),
      siguienteTurno(r),
      DOS_YOGURES,
    );
    check(
      "y el turno siguiente la completa",
      text(r2) === "Vale, he quitado 2 unidades de Yogur griego. Ahora hay 4 unidades.",
      text(r2),
    );
  }

  console.log("\n8. Consultas de solo lectura");
  {
    const r = await run(intentRequest("LeerListaIntent"), undefined, CON_AVISOS);
    check(
      "lee la lista con el nombre vivo del producto, y sin lo ya marcado",
      text(r) === "En la lista tienes Pan y Leche entera.",
      text(r),
    );
  }
  {
    const r = await run(intentRequest("LeerListaIntent"), undefined, VACIO);
    check("una lista vacía se dice y ya", text(r) === SPEECH.listEmpty, text(r));
  }
  {
    const muchos = fakeAdmin({
      alexa_links: LINK, household_members: MIEMBRO,
      shopping_lists: LISTA,
      shopping_list_items: {
        list: Array.from({ length: 11 }, (_, i) => ({
          name: `Cosa ${i + 1}`,
          is_checked: false,
          product: null,
        })),
      },
    });
    const r = await run(intentRequest("LeerListaIntent"), undefined, muchos);
    check(
      "una lista larga se corta y remite a la app",
      text(r) ===
        "En la lista tienes Cosa 1, Cosa 2, Cosa 3, Cosa 4, Cosa 5, Cosa 6, Cosa 7 " +
          "y Cosa 8. Y 3 cosas más, que las tienes en Fill Good.",
      text(r),
    );
  }
  {
    const r = await run(intentRequest("CaducidadesIntent"), undefined, CON_AVISOS);
    check(
      "lo que caduca va de lo más urgente a lo menos, sin repetir producto",
      text(r) === "Ojo con esto: Pollo caduca hoy y Yogur natural caduca mañana.",
      text(r),
    );
  }
  {
    const r = await run(intentRequest("CaducidadesIntent"), undefined, YOGURES);
    check(
      "sin nada a punto de caducar se dice que está todo en orden",
      text(r) === SPEECH.expiryNone,
      text(r),
    );
  }
  {
    const r = await run(intentRequest("MenuHoyIntent"), undefined, CON_MENU);
    check(
      "el menú de hoy se cuenta en el orden del día, y lo saltado no cuenta",
      text(r) === "Hoy toca de comida, Lentejas y de cena, Tortilla.",
      text(r),
    );
  }
  {
    const r = await run(
      intentRequest("MenuHoyIntent", { comida: slot("comida", "cenar", "dinner") }),
      undefined,
      CON_MENU,
    );
    check(
      "«qué hay de cena» acota a ese hueco",
      text(r) === "Hoy toca de cena, Tortilla.",
      text(r),
    );
  }
  {
    const r = await run(intentRequest("MenuHoyIntent"), undefined, VACIO);
    check("sin menú de la semana se dice", text(r) === SPEECH.menuNone, text(r));
  }

  console.log("\n9. Bienvenida con contexto");
  {
    const r = await run(
      {
        type: "LaunchRequest",
        requestId: "r-launch-1",
        timestamp: "2026-07-29T10:00:00Z",
        locale: "es-ES",
      },
      undefined,
      CON_AVISOS,
    );
    check(
      "al abrir, lo urgente por delante",
      text(r) ===
        "Hola. Te caducan 2 cosas pronto. Tienes 2 cosas apuntadas en la lista. ¿Qué apunto?",
      text(r),
    );
    check("y sigue encendiendo el modo", r.sessionAttributes?.conversacion === true);
  }
  {
    const r = await run(
      {
        type: "LaunchRequest",
        requestId: "r-launch-2",
        timestamp: "2026-07-29T10:00:00Z",
        locale: "es-ES",
      },
      undefined,
      VACIO,
    );
    check("sin nada que avisar, el saludo de siempre", text(r) === SPEECH.welcome, text(r));
  }
  {
    const r = await run(
      {
        type: "LaunchRequest",
        requestId: "r-launch-3",
        timestamp: "2026-07-29T10:00:00Z",
        locale: "es-ES",
      },
      undefined,
      SIN_VINCULO,
    );
    check(
      "abrir sin vínculo explica cómo vincular, en vez de saludar",
      text(r) === SPEECH.notLinked,
      text(r),
    );
    check("con la tarjeta para el móvil", r.response.card !== undefined);
  }

  console.log("\n10. Tirar: se dice distinto, se anota igual");
  {
    limpiarEscrituras(YOGURES);
    const r = await run(
      intentRequest("TirarStockIntent", {
        producto: slot("producto", "yogures"),
        cantidad: slot("cantidad", "2"),
      }),
      undefined,
      YOGURES,
    );
    check(
      "se dice con el verbo que usó el usuario",
      text(r) === "Vale, he tirado 2 unidades de Yogur natural. Ahora hay 4 unidades.",
      text(r),
    );
    const eventos = escriturasEn(YOGURES, "inventory_events");
    check(
      "y el historial lo anota como consumo, como el resto de la app",
      eventos.length === 1 && eventos[0].datos.kind === "consumed",
      eventos.map((e) => e.datos.kind),
    );
  }
  {
    limpiarEscrituras(YOGURES);
    const r = await run(
      intentRequest("RestarStockIntent", {
        producto: slot("producto", "yogures"),
        cantidad: slot("cantidad", "2"),
      }),
      undefined,
      YOGURES,
    );
    check(
      "gastar sigue registrándose como consumo",
      text(r).startsWith("Vale, he quitado") &&
        escriturasEn(YOGURES, "inventory_events")[0]?.datos.kind === "consumed",
      text(r),
    );
  }
  {
    const r = await run(
      intentRequest("TirarStockIntent", { producto: slot("producto", "arroz") }),
      undefined,
      ARROZ,
    );
    check(
      "al preguntar la unidad se usa «tiro», no «quito»",
      text(r) === "Tienes 2 kilos de Arroz. ¿Cuánto tiro? Por ejemplo: medio kilo.",
      text(r),
    );
    const pendiente = r.sessionAttributes?.pendiente;
    check(
      "y la orden guardada recuerda que era tirar",
      pendiente?.tipo === "unidad" && pendiente.accion === "tirar",
      pendiente,
    );
  }
  {
    limpiarEscrituras(ARROZ);
    const r = await run(
      intentRequest("EstropearStockIntent", { producto: slot("producto", "arroz") }),
      undefined,
      ARROZ,
    );
    check(
      "«se ha estropeado» vacía y lo lamenta",
      text(r) === SPEECH.spoiledAsk("Arroz"),
      text(r),
    );
    check(
      "ofreciendo apuntarlo",
      r.sessionAttributes?.pendiente?.tipo === "apuntar" &&
        r.response.shouldEndSession === false,
    );
    const eventos = escriturasEn(ARROZ, "inventory_events");
    check(
      "y lo tirado se registra entero, como consumo",
      eventos.length === 1 &&
        eventos[0].datos.kind === "consumed" &&
        eventos[0].datos.quantity === 2,
      eventos.map((e) => e.datos),
    );
  }

  {
    // Guardarraíl: desde que la app dejó de contabilizar el desperdicio (f0b2404)
    // NINGÚN camino de voz debe volver a escribir 'discarded'. Si alguien
    // reintroduce la distinción en el historial sin querer, salta aquí.
    limpiarEscrituras(YOGURES);
    for (const nombre of [
      "TirarStockIntent",
      "RestarStockIntent",
      "EstropearStockIntent",
      "AgotarStockIntent",
    ]) {
      await run(
        intentRequest(nombre, { producto: slot("producto", "yogures") }),
        undefined,
        YOGURES,
      );
    }
    const kinds = escriturasEn(YOGURES, "inventory_events").map(
      (e) => e.datos.kind,
    );
    check(
      "ningún camino de voz escribe ya «discarded»",
      kinds.length === 4 && kinds.every((k) => k === "consumed"),
      kinds,
    );
  }

  console.log("\n11. Tachar de la lista");
  {
    limpiarEscrituras(CON_AVISOS);
    const r = await run(
      intentRequest("MarcarCompradoIntent", { producto: slot("producto", "el pan") }),
      undefined,
      CON_AVISOS,
    );
    check("tacha lo comprado", text(r) === SPEECH.listChecked("Pan"), text(r));
    const escrituras = escriturasEn(CON_AVISOS, "shopping_list_items");
    check(
      "marcándolo como comprado, sin tocar existencias",
      escrituras.length === 1 &&
        escrituras[0].op === "update" &&
        escrituras[0].datos.is_checked === true,
      escrituras,
    );
    check(
      "no se registra ningún movimiento de inventario",
      escriturasEn(CON_AVISOS, "inventory_events").length === 0,
    );
  }
  {
    limpiarEscrituras(CON_AVISOS);
    const r = await run(
      intentRequest("MarcarCompradoIntent", { producto: slot("producto", "atún") }),
      undefined,
      CON_AVISOS,
    );
    check(
      "lo que no está en la lista se dice claro",
      text(r) === SPEECH.listItemUnknown("atún"),
      text(r),
    );
    check(
      "y no se escribe nada al no encontrarlo",
      escriturasEn(CON_AVISOS, "shopping_list_items").length === 0,
    );
  }
  {
    const dosLeches = fakeAdmin({
      alexa_links: LINK, household_members: MIEMBRO,
      shopping_lists: LISTA,
      shopping_list_items: {
        list: [
          { id: "a", name: "Leche entera", is_checked: false, product: null },
          { id: "b", name: "Leche desnatada", is_checked: false, product: null },
        ],
      },
    });
    const r = await run(
      intentRequest("MarcarCompradoIntent", { producto: slot("producto", "leche") }),
      undefined,
      dosLeches,
    );
    check(
      "con dos parecidos NO se tacha a boleo",
      text(r) === SPEECH.listItemAmbiguous(["Leche entera", "Leche desnatada"]),
      text(r),
    );
    check(
      "y no se escribe nada",
      escriturasEn(dosLeches, "shopping_list_items").length === 0,
    );
  }
  {
    const ultimo = fakeAdmin({
      alexa_links: LINK, household_members: MIEMBRO,
      shopping_lists: LISTA,
      shopping_list_items: {
        list: [{ id: "z", name: "Pan", is_checked: false, product: null }],
      },
    });
    const r = await run(
      intentRequest("MarcarCompradoIntent", { producto: slot("producto", "pan") }),
      undefined,
      ultimo,
    );
    check(
      "al tachar el último se dice que ya está todo",
      text(r) === SPEECH.listCheckedLast("Pan"),
      text(r),
    );
  }
  {
    limpiarEscrituras(CON_AVISOS);
    const r = await run(
      intentRequest("MarcarCompradoIntent", { producto: slot("producto", "arroz") }),
      undefined,
      CON_AVISOS,
    );
    check(
      "lo que ya estaba tachado se dice, no se vuelve a tachar",
      text(r) === SPEECH.listAlreadyChecked("Arroz"),
      text(r),
    );
    check(
      "y no se escribe nada",
      escriturasEn(CON_AVISOS, "shopping_list_items").length === 0,
    );
  }

  console.log("\n12. Borrar de la lista NO es tacharlo");
  {
    limpiarEscrituras(CON_AVISOS);
    const r = await run(
      intentRequest("BorrarDeListaIntent", { producto: slot("producto", "el pan") }),
      undefined,
      CON_AVISOS,
    );
    check("se borra y se dice", text(r) === SPEECH.listDeleted("Pan"), text(r));
    const escrituras = escriturasEn(CON_AVISOS, "shopping_list_items");
    check(
      "con un borrado de verdad",
      escrituras.length === 1 && escrituras[0].op === "delete",
      escrituras,
    );
    // La razón de ser de este intent: lo tachado entra al inventario al
    // finalizar la compra, así que tachar lo que ya no quieres metería en casa
    // un producto que nunca se compró.
    check(
      "y sin marcarlo como comprado por el camino",
      !escrituras.some((e) => e.datos.is_checked === true),
      escrituras,
    );
  }
  {
    limpiarEscrituras(CON_AVISOS);
    const r = await run(
      intentRequest("BorrarDeListaIntent", { producto: slot("producto", "atún") }),
      undefined,
      CON_AVISOS,
    );
    check(
      "borrar algo que no está tampoco inventa nada",
      text(r) === SPEECH.listItemUnknown("atún") &&
        escriturasEn(CON_AVISOS, "shopping_list_items").length === 0,
      text(r),
    );
  }
  {
    const dosLeches = fakeAdmin({
      alexa_links: LINK, household_members: MIEMBRO,
      shopping_lists: LISTA,
      shopping_list_items: {
        list: [
          { id: "a", name: "Leche entera", is_checked: false, product: null },
          { id: "b", name: "Leche desnatada", is_checked: false, product: null },
        ],
      },
    });
    const r = await run(
      intentRequest("BorrarDeListaIntent", { producto: slot("producto", "leche") }),
      undefined,
      dosLeches,
    );
    check(
      "y con dos parecidos NO se borra a boleo",
      text(r) === SPEECH.listItemAmbiguous(["Leche entera", "Leche desnatada"]) &&
        escriturasEn(dosLeches, "shopping_list_items").length === 0,
      text(r),
    );
  }

  console.log("\n13. Deshacer la última orden");
  {
    limpiarEscrituras(YOGURES);
    await run(
      intentRequest("RestarStockIntent", {
        producto: slot("producto", "yogures"),
        cantidad: slot("cantidad", "2"),
      }),
      undefined,
      YOGURES,
    );
    const anotado = escriturasEn(YOGURES, "alexa_requests").find(
      (e) => e.datos.undo !== undefined,
    );
    const plan = anotado?.datos.undo as
      | { lots: { id: string; quantity: number | null }[]; events: unknown[] }
      | undefined;
    check(
      "restar anota cómo deshacerse, con la cantidad PREVIA del lote",
      plan?.lots.length === 1 &&
        plan.lots[0].id === "i1" &&
        plan.lots[0].quantity === 6,
      plan,
    );
    check(
      "y el evento de historial que creó",
      Array.isArray(plan?.events) && plan.events.length === 1,
      plan?.events,
    );
    check(
      "junto al altavoz que la dictó",
      anotado?.datos.link_id === "l1",
      anotado?.datos.link_id,
    );
  }
  {
    const conDeshacer = fakeAdmin({
      alexa_links: LINK, household_members: MIEMBRO,
      alexa_requests: {
        single: {
          request_id: "r-anterior",
          undo: {
            productId: "p1",
            name: "Yogur natural",
            lots: [{ id: "i1", quantity: 6 }],
            events: [{ id: "ev1", quantity: 2 }],
          },
          undone_at: null,
        },
      },
      // El evento llevaba 5: la orden le sumó 2, así que deben quedar 3.
      inventory_events: { single: { quantity: 5 } },
    });
    const r = await run(intentRequest("DeshacerIntent"), undefined, conDeshacer);
    check("deshace y lo dice", text(r) === SPEECH.undone("Yogur natural"), text(r));

    const lotes = escriturasDe(conDeshacer).filter(
      (e) => e.tabla === "inventory_items",
    );
    check(
      "devolviendo el lote a la cantidad que tenía",
      lotes.length === 1 && lotes[0].op === "update" && lotes[0].datos.quantity === 6,
      lotes,
    );
    const eventos = escriturasDe(conDeshacer).filter(
      (e) => e.tabla === "inventory_events",
    );
    check(
      "y descontando del historial solo lo suyo, sin borrar el evento entero",
      eventos.length === 1 && eventos[0].op === "update" && eventos[0].datos.quantity === 3,
      eventos,
    );
    check(
      "la orden queda marcada como deshecha",
      escriturasDe(conDeshacer).some(
        (e) => e.tabla === "alexa_requests" && e.datos.undone_at !== undefined,
      ),
    );
  }
  {
    // Lote que creó la propia orden: deshacerlo es que no exista, no dejarlo a 0.
    const conAlta = fakeAdmin({
      alexa_links: LINK, household_members: MIEMBRO,
      alexa_requests: {
        single: {
          request_id: "r-alta",
          undo: {
            productId: "p1",
            name: "Arroz",
            lots: [{ id: "nuevo", quantity: null }],
            events: [],
          },
          undone_at: null,
        },
      },
    });
    const r = await run(intentRequest("DeshacerIntent"), undefined, conAlta);
    const lotes = escriturasDe(conAlta).filter((e) => e.tabla === "inventory_items");
    check(
      "una fila que no existía antes se borra, no se deja en cero",
      text(r) === SPEECH.undone("Arroz") &&
        lotes.length === 1 &&
        lotes[0].op === "delete",
      lotes,
    );
  }
  {
    const r = await run(intentRequest("DeshacerIntent"), undefined, VACIO);
    check(
      "sin nada reciente que deshacer se dice",
      text(r) === SPEECH.nothingToUndo,
      text(r),
    );
  }
  {
    const yaDeshecho = fakeAdmin({
      alexa_links: LINK, household_members: MIEMBRO,
      alexa_requests: {
        single: {
          request_id: "r-ya",
          undo: { productId: "p1", name: "Pan", lots: [], events: [] },
          undone_at: "2026-07-29T10:00:00Z",
        },
      },
    });
    const r = await run(intentRequest("DeshacerIntent"), undefined, yaDeshecho);
    check(
      "y no se deshace dos veces",
      text(r) === SPEECH.alreadyUndone,
      text(r),
    );
    check(
      "sin tocar el inventario",
      escriturasDe(yaDeshecho).filter((e) => e.tabla === "inventory_items")
        .length === 0,
    );
  }
  {
    const corrupto = fakeAdmin({
      alexa_links: LINK, household_members: MIEMBRO,
      alexa_requests: {
        single: {
          request_id: "r-raro",
          undo: { productId: "p1", lots: "esto no es una lista" },
          undone_at: null,
        },
      },
    });
    const r = await run(intentRequest("DeshacerIntent"), undefined, corrupto);
    check(
      "un plan con una forma que no reconocemos no se aplica a medias",
      text(r) === SPEECH.nothingToUndo &&
        escriturasDe(corrupto).filter((e) => e.tabla === "inventory_items")
          .length === 0,
      text(r),
    );
  }

  console.log("\n14. «Hemos cenado la lasaña»");
  {
    limpiarEscrituras(CON_RECETA);
    const r = await run(
      intentRequest("CocinadoIntent", { plato: slot("plato", "lasaña") }),
      undefined,
      CON_RECETA,
    );
    check(
      "marca el plato y PREGUNTA antes de descontar",
      text(r) === SPEECH.cookedAsk("Lasaña de verduras", 2, 1),
      text(r),
    );
    check("dejando la sesión abierta", r.response.shouldEndSession === false);
    const entradas = escriturasEn(CON_RECETA, "menu_entries");
    check(
      "el cocinado se escribe ya, y limpia el «no se hizo»",
      entradas.length === 1 &&
        entradas[0].datos.cooked_at !== undefined &&
        entradas[0].datos.skipped_at === null,
      entradas,
    );
    check(
      "sin tocar todavía el inventario",
      escriturasEn(CON_RECETA, "inventory_items").length === 0,
    );

    // El «sí» del turno siguiente, con el estado tal como lo devuelve Alexa.
    const pendiente = siguienteTurno(r);
    check(
      "las líneas viajan ya resueltas en la sesión",
      pendiente.pendiente?.tipo === "descontar" &&
        pendiente.pendiente.lines.length === 1 &&
        pendiente.pendiente.lines[0].productId === "p-tomate" &&
        pendiente.pendiente.lines[0].quantity === 2,
      pendiente.pendiente,
    );

    limpiarEscrituras(CON_RECETA);
    const r2 = await run(
      intentRequest("AMAZON.YesIntent"),
      pendiente,
      CON_RECETA,
    );
    check(
      "el «sí» descuenta y lo cuenta",
      text(r2) === SPEECH.cookedDeducted(1),
      text(r2),
    );
    const lotes = escriturasEn(CON_RECETA, "inventory_items");
    check(
      "bajando el lote de 5 a 3",
      lotes.length === 1 && lotes[0].datos.quantity === 3,
      lotes,
    );
    const eventos = escriturasEn(CON_RECETA, "inventory_events");
    check(
      "y dejando rastro en el historial, que la app no deja",
      eventos.some((e) => e.datos.kind === "consumed" && e.datos.quantity === 2),
      eventos.map((e) => e.datos),
    );
    const undo = escriturasEn(CON_RECETA, "alexa_requests").find(
      (e) => e.datos.undo !== undefined,
    );
    const plan = undo?.datos.undo as { name: string; lots: unknown[] } | undefined;
    check(
      "con un solo plan de deshacer para toda la receta",
      plan?.name === "Lasaña de verduras" && plan.lots.length === 1,
      plan,
    );
  }
  {
    limpiarEscrituras(CON_RECETA);
    const r = await run(
      intentRequest("AMAZON.NoIntent"),
      {
        pendiente: {
          tipo: "descontar",
          recipeName: "Lasaña de verduras",
          lines: [
            {
              productId: "p-tomate",
              productName: "Tomate frito",
              unit: "ud",
              quantity: 2,
            },
          ],
        },
      },
      CON_RECETA,
    );
    check("un «no» deja el inventario en paz", text(r) === SPEECH.cookedKept, text(r));
    check(
      "sin escribir nada",
      escriturasEn(CON_RECETA, "inventory_items").length === 0,
    );
  }
  {
    // «Hemos cenado» a secas: el hueco sale del participio, vía TipoComida.
    limpiarEscrituras(CON_RECETA);
    const r = await run(
      intentRequest("CocinadoIntent", {
        comida: slot("comida", "cenado", "dinner"),
      }),
      undefined,
      CON_RECETA,
    );
    check(
      "«hemos cenado» resuelve la cena de hoy sin nombrar el plato",
      text(r) === SPEECH.cookedAsk("Lasaña de verduras", 2, 1),
      text(r),
    );
  }
  {
    const yaCocinado = fakeAdmin({
      alexa_links: LINK, household_members: MIEMBRO,
      weekly_menus: { single: { id: "m1" } },
      menu_entries: {
        list: [
          {
            id: "e1",
            meal_slot: "dinner",
            free_text: null,
            cooked_at: "2026-07-29",
            recipe_id: "r1",
            recipe: { name: "Lasaña de verduras" },
          },
        ],
      },
    });
    const r = await run(
      intentRequest("CocinadoIntent", { plato: slot("plato", "lasaña") }),
      undefined,
      yaCocinado,
    );
    check(
      "lo ya cocinado no se vuelve a descontar",
      text(r) === SPEECH.cookedAlready("Lasaña de verduras"),
      text(r),
    );
    check(
      "y no se escribe nada",
      escriturasDe(yaCocinado).filter((e) => e.tabla === "menu_entries").length ===
        0,
    );
  }
  {
    const textoLibre = fakeAdmin({
      alexa_links: LINK, household_members: MIEMBRO,
      weekly_menus: { single: { id: "m1" } },
      menu_entries: {
        list: [
          {
            id: "e2",
            meal_slot: "dinner",
            free_text: "Sobras",
            cooked_at: null,
            recipe_id: null,
            recipe: null,
          },
        ],
      },
    });
    const r = await run(
      intentRequest("CocinadoIntent", {
        comida: slot("comida", "cenado", "dinner"),
      }),
      undefined,
      textoLibre,
    );
    check(
      "un plato sin receta se marca, y se dice que no hay qué descontar",
      text(r) === SPEECH.cookedNoRecipe("Sobras"),
      text(r),
    );
  }
  {
    const dosPlatos = fakeAdmin({
      alexa_links: LINK, household_members: MIEMBRO,
      weekly_menus: { single: { id: "m1" } },
      menu_entries: {
        list: [
          {
            id: "a",
            meal_slot: "lunch",
            free_text: "Lentejas",
            cooked_at: null,
            recipe_id: null,
            recipe: null,
          },
          {
            id: "b",
            meal_slot: "dinner",
            free_text: "Tortilla",
            cooked_at: null,
            recipe_id: null,
            recipe: null,
          },
        ],
      },
    });
    const r = await run(intentRequest("CocinadoIntent"), undefined, dosPlatos);
    check(
      "sin nombre y con dos platos hoy, pregunta en vez de elegir",
      text(r) === SPEECH.cookedWhich(["Lentejas", "Tortilla"]),
      text(r),
    );
    check(
      "y no marca ninguno",
      escriturasDe(dosPlatos).filter((e) => e.tabla === "menu_entries").length ===
        0,
    );
  }
  {
    const r = await run(
      intentRequest("CocinadoIntent", { plato: slot("plato", "paella") }),
      undefined,
      CON_RECETA,
    );
    check(
      "un plato que hoy no está en el menú se dice",
      text(r) === SPEECH.cookedNoDish,
      text(r),
    );
  }

  console.log("\n15. Un ex-miembro se queda sin voz");
  {
    // Vínculo vivo pero sin membresía: quien vinculó el Echo salió del hogar
    // (o fue expulsado) después. Debe responder como «sin vincular» y borrar
    // el vínculo huérfano, no seguir sirviendo datos del hogar.
    const EX_MIEMBRO = fakeAdmin({ alexa_links: LINK, shopping_lists: LISTA });
    const r = await run(
      {
        type: "LaunchRequest",
        requestId: "r-exmiembro-1",
        timestamp: "2026-07-29T10:00:00Z",
        locale: "es-ES",
      },
      undefined,
      EX_MIEMBRO,
    );
    check(
      "responde como si no hubiera vínculo",
      text(r) === SPEECH.notLinked,
      text(r),
    );
    check(
      "y el vínculo huérfano se borra",
      escriturasEn(EX_MIEMBRO, "alexa_links").some((e) => e.op === "delete"),
    );
  }

  if (fallos > 0) {
    console.log(`\n${fallos} comprobaciones FALLIDAS.\n`);
    process.exit(1);
  }
  console.log("\nConversación de Alexa: todo correcto.\n");
}

await main();
