/**
 * Comprobaciones de la sincronización de la lista de la compra. Lo ejecuta
 * `npm run check:lista` (ver `scripts/check-list-sync.mjs`, que lo empaqueta con
 * esbuild porque esto es TypeScript y tira del alias `@/`).
 *
 * Prueba las REGLAS de `src/features/shopping-list/list-sync.ts` con los
 * escenarios que provocaban los fallos que se veían en el móvil: una respuesta
 * del servidor que llega tarde y resucita lo que acabas de quitar, un eco que
 * devuelve el número viejo al stepper, un alta que desaparece porque la lectura
 * salió antes de crearla. Son carreras de tiempos: el compilador no las ve y a
 * mano solo se reproducen con suerte, así que se fijan aquí.
 *
 * Lo que NO se prueba: el pintado (eso se mira en pantalla) ni el transporte de
 * Realtime (eso depende de Supabase y de la identidad de réplica de la tabla,
 * ver la migración `..._lista_realtime_borrados.sql`).
 */
import {
  ADD_GRACE_MS,
  CHANGE_GRACE_MS,
  createHealScheduler,
  mergeDeltaInto,
  mergeSnapshot,
  sortSyncedItems,
  type ListItemRealtimeRow,
  type SyncGuards,
} from "@/features/shopping-list/list-sync";

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

/** Ítem de prueba con la forma mínima que exige la sincronización. */
type Item = {
  id: string;
  name: string;
  quantity: number | null;
  unit: null;
  isChecked: boolean;
  position: number;
  createdAt: string;
  /** Solo para comprobar que los campos del servidor sí entran. */
  categoryName?: string;
  productId?: string | null;
};

function item(id: string, extra: Partial<Item> = {}): Item {
  return {
    id,
    name: id.toUpperCase(),
    quantity: 1,
    unit: null,
    isChecked: false,
    position: 0,
    createdAt: "2026-07-30T10:00:00.000Z",
    ...extra,
  };
}

function guards(over: Partial<SyncGuards> = {}): SyncGuards {
  return {
    tombstones: new Set<string>(),
    recentAdds: new Map<string, number>(),
    recentChanges: new Map<string, number>(),
    isBusy: () => false,
    ...over,
  };
}

const ids = (items: Item[]) => items.map((i) => i.id).join(",");

// ── Lo quitado aquí no vuelve ───────────────────────────────────────────────
seccion("Quitar un artículo");
{
  const local = [item("a"), item("b")];
  const g = guards({ tombstones: new Set(["b"]) });

  // La respuesta que se pidió ANTES del borrado sigue trayendo la fila.
  const rezagada = mergeSnapshot(local.slice(0, 1), local, g);
  check("una respuesta rezagada no resucita lo quitado", ids(rezagada) === "a", {
    ids: ids(rezagada),
  });

  // El fallo real era este: bastaba UNA respuesta limpia para soltar el veto, y
  // la siguiente rezagada devolvía el artículo a la pantalla.
  const limpia = mergeSnapshot(rezagada, [item("a")], g);
  const otraRezagada = mergeSnapshot(limpia, local, g);
  check(
    "y sigue sin volver tras una respuesta limpia por medio",
    ids(otraRezagada) === "a",
    { ids: ids(otraRezagada) },
  );

  // Deshacer levanta el veto (mismo id, es la misma fila).
  const g2 = guards();
  const restaurada = mergeSnapshot([item("a")], local, g2);
  check("deshacer deja que vuelva", ids(restaurada) === "a,b", {
    ids: ids(restaurada),
  });
}

// ── Un alta reciente no se borra por una lectura vieja ──────────────────────
seccion("Añadir un artículo");
{
  const local = [item("a"), item("nuevo", { position: 9 })];
  const reciente = guards({
    recentAdds: new Map([["nuevo", Date.now()]]),
  });
  const conAlta = mergeSnapshot(local, [item("a")], reciente);
  check(
    "una lectura anterior al alta no se lleva el artículo nuevo",
    ids(conAlta) === "a,nuevo",
    { ids: ids(conAlta) },
  );

  // Pasada la gracia, una fila que el servidor no tiene es que ya no está.
  const vieja = guards({
    recentAdds: new Map([["nuevo", Date.now() - ADD_GRACE_MS - 1_000]]),
  });
  const sinAlta = mergeSnapshot(local, [item("a")], vieja);
  check(
    "pasada la gracia, lo que el servidor no tiene desaparece",
    ids(sinAlta) === "a",
    { ids: ids(sinAlta) },
  );

  // Y la memoria de altas recientes no crece sin fin.
  const podada = guards({
    recentAdds: new Map([["viejo", Date.now() - ADD_GRACE_MS - 1_000]]),
  });
  mergeSnapshot([], [], podada);
  check("la memoria de altas recientes se poda", podada.recentAdds.size === 0);
}

// ── Escritura propia en vuelo: manda lo local ──────────────────────────────
seccion("Escritura propia en vuelo");
{
  const local = [item("a", { isChecked: true, quantity: 3, position: 5 })];
  const servidor = [
    item("a", {
      isChecked: false,
      quantity: 2,
      position: 0,
      name: "NOMBRE NUEVO",
      categoryName: "Lácteos",
    }),
  ];

  const ocupada = mergeSnapshot(local, servidor, guards({ isBusy: () => true }));
  check(
    "no pisa el marcado ni la cantidad de una fila que se está escribiendo",
    ocupada[0].isChecked === true && ocupada[0].quantity === 3,
    ocupada[0],
  );
  check(
    "ni su posición (un reorden a medio guardar no salta)",
    ocupada[0].position === 5,
    ocupada[0],
  );
  check(
    "pero sí trae lo que solo sabe el servidor (categoría, nombre)",
    ocupada[0].categoryName === "Lácteos" && ocupada[0].name === "NOMBRE NUEVO",
    ocupada[0],
  );

  const libre = mergeSnapshot(local, servidor, guards());
  check(
    "sin escritura en vuelo, manda el servidor",
    libre[0].isChecked === false && libre[0].quantity === 2,
    libre[0],
  );
}

// ── Cambio ajeno durante una lectura ───────────────────────────────────────
/*
  El que faltaba (auditoría del 23-sep-2026). En el móvil A salta el latido y
  sale una cura; 100 ms después B marca «Leche» y el cambio llega a A por
  Realtime, que la pinta marcada; 200 ms más tarde llega la respuesta de la cura,
  leída ANTES del cambio de B, con «Leche» sin marcar. Sin salvaguarda, A volvía
  a verla pendiente hasta el siguiente latido, y con la cantidad era peor: el
  siguiente «+» de A escribía sobre el número viejo, pisando el de B. Con ~40
  latidos por móvil en una compra de veinte minutos, pasaba más de una vez.
*/
seccion("Cambio ajeno durante una lectura");
{
  // A ya aplicó el cambio de B (marcada, 2 ud); la cura trae lo de antes.
  const local = [item("a", { isChecked: true, quantity: 2 })];
  const curaVieja = [item("a", { isChecked: false, quantity: 3 })];

  const reciente = guards({ recentChanges: new Map([["a", Date.now()]]) });
  const r = mergeSnapshot(local, curaVieja, reciente);
  check(
    "una cura leída antes del cambio de la pareja no lo deshace",
    r[0].isChecked === true && r[0].quantity === 2,
    r[0],
  );

  const vieja = guards({
    recentChanges: new Map([["a", Date.now() - CHANGE_GRACE_MS - 1_000]]),
  });
  const r2 = mergeSnapshot(local, curaVieja, vieja);
  check(
    "pasada la ventana, manda el servidor (no se congela lo local)",
    r2[0].isChecked === false && r2[0].quantity === 3,
    r2[0],
  );
  check("y la memoria de cambios recientes se poda", vieja.recentChanges.size === 0);
}

// ── Cambios sueltos de Realtime ────────────────────────────────────────────
seccion("Cambio suelto de Realtime");
{
  const row = (over: Partial<ListItemRealtimeRow> = {}): ListItemRealtimeRow => ({
    id: "a",
    list_id: "lista",
    product_id: null,
    name: "ROTULO DE LA FILA",
    // `numeric` de Postgres puede llegar como cadena.
    quantity: "2.50",
    unit: null,
    is_checked: true,
    added_by: null,
    position: 4,
    created_at: "2026-07-30T11:00:00.000Z",
    ...over,
  });

  const libre = mergeDeltaInto(item("a", { productId: null }), row());
  check("la cantidad llega como número", libre.quantity === 2.5, libre);
  check("el marcado se aplica", libre.isChecked === true, libre);
  check("la posición se aplica", libre.position === 4, libre);
  check(
    "en un texto libre, el nombre de la fila es el que vale",
    libre.name === "ROTULO DE LA FILA",
    libre,
  );

  // Con producto vinculado el nombre que se ve es el del PRODUCTO: la columna de
  // la fila es solo el rótulo del alta y puede haber quedado desfasada al
  // renombrar desde el inventario. Pisarlo devolvería el nombre viejo.
  const vinculado = mergeDeltaInto(
    item("a", { productId: "p1", name: "Aceite de oliva virgen extra" }),
    row({ product_id: "p1", name: "Aceite" }),
  );
  check(
    "con producto vinculado NO se pisa el nombre vivo",
    vinculado.name === "Aceite de oliva virgen extra",
    vinculado,
  );
}

// ── Orden ──────────────────────────────────────────────────────────────────
seccion("Orden de la lista");
{
  const desordenados = [
    item("cogido", { isChecked: true, position: 0 }),
    item("segundo", { position: 2 }),
    item("primero", { position: 1 }),
  ];
  const ordenados = sortSyncedItems(desordenados);
  check(
    "lo pendiente va antes de lo que ya está en el carro",
    ids(ordenados) === "primero,segundo,cogido",
    { ids: ids(ordenados) },
  );

  const enElPasillo = sortSyncedItems(desordenados, { checkedLast: false });
  check(
    "en el modo compra manda la posición (los cogidos los agrupa el pasillo)",
    ids(enElPasillo) === "cogido,primero,segundo",
    { ids: ids(enElPasillo) },
  );

  const empate = sortSyncedItems([
    item("nuevo", { position: 1, createdAt: "2026-07-30T12:00:00.000Z" }),
    item("antiguo", { position: 1, createdAt: "2026-07-30T09:00:00.000Z" }),
  ]);
  check(
    "a igual posición, desempata la antigüedad",
    ids(empate) === "antiguo,nuevo",
    { ids: ids(empate) },
  );
}

// ── Agrupar las curas ──────────────────────────────────────────────────────
seccion("Agrupador de curas");

const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));

{
  let veces = 0;
  const scheduler = createHealScheduler(async () => {
    veces += 1;
  });

  // Quince altas de golpe son quince eventos: UNA lectura.
  for (let i = 0; i < 15; i++) scheduler.schedule(20);
  await espera(80);
  check("una ráfaga de cambios se cura una sola vez", veces === 1, { veces });

  // Gana el plazo más corto: pedir "en 2 s" después de "en 20 ms" no lo retrasa.
  veces = 0;
  scheduler.schedule(20);
  scheduler.schedule(2_000);
  await espera(80);
  check("gana el plazo más corto pedido", veces === 1, { veces });

  scheduler.dispose();
  veces = 0;
  scheduler.schedule(10);
  await espera(50);
  check("al desmontar no se cura más", veces === 0, { veces });

  scheduler.resume();
  scheduler.schedule(10);
  await espera(50);
  check("y al volver a montar (React en desarrollo) sí", veces === 1, { veces });
  scheduler.dispose();
}

{
  // Si el cambio llega MIENTRAS se está leyendo, hay que volver a leer: los datos
  // en vuelo pueden ser anteriores a ese cambio.
  let veces = 0;
  let enCurso = false;
  let solapadas = 0;
  const lenta = createHealScheduler(async () => {
    if (enCurso) solapadas += 1;
    enCurso = true;
    veces += 1;
    await espera(60);
    enCurso = false;
  });

  lenta.schedule(0);
  await espera(20);
  lenta.schedule(0); // llega con la lectura a medias
  await espera(200);
  check("un cambio durante la lectura provoca otra", veces === 2, { veces });
  check("y nunca hay dos lecturas a la vez", solapadas === 0, { solapadas });
  lenta.dispose();
}

{
  // Una cura que falla no puede dejar el agrupador colgado.
  let veces = 0;
  const rota = createHealScheduler(async () => {
    veces += 1;
    throw new Error("sin red");
  });
  rota.schedule(0);
  await espera(50);
  rota.schedule(0);
  await espera(50);
  check("una cura que falla no bloquea las siguientes", veces === 2, { veces });
  rota.dispose();
}

console.log(
  fallos === 0
    ? "\nSincronización de la lista: todo correcto.\n"
    : `\nSincronización de la lista: ${fallos} fallo(s).\n`,
);
process.exit(fallos === 0 ? 0 : 1);
