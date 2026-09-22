/**
 * Informe de uso de Fill Good: `npm run informe:uso`.
 *
 * Responde a la pregunta que el análisis de retención de agosto de 2026 no pudo
 * contestar sin datos: qué hacen de verdad los hogares, dónde se quedan y quién
 * vuelve. NO es un `check:*`: no afirma nada, solo cuenta, y no va en CI ni en
 * `build:check`.
 *
 * Solo lectura (únicamente `select`), con la clave de servicio de `.env.local`,
 * porque las tablas de uso no se leen con el token de nadie (ver la migración
 * `20260922200832_eventos_de_uso.sql`). La salida va ANONIMIZADA: H1…Hn por
 * orden de creación, recuentos y fechas; nunca nombres, ids ni contenido.
 *
 * De dónde sale cada cosa, porque no todo es igual de fiable:
 *  - Tickets, compras, menús, platos cocinados, miembros y push salen de SUS
 *    tablas. Es historia completa, desde el primer día.
 *  - «Última actividad» es la última ESCRITURA de cualquier tipo. Quien entra a
 *    mirar y se va no aparece ahí; para eso están las visitas.
 *  - Visitas y eventos (repaso, invitación) solo existen desde que se aplicó
 *    esa migración. Si faltan, el informe lo dice en vez de enseñar ceros, que
 *    se leerían como «nadie entra».
 *
 * Usuarios de prueba: `USAGE_REPORT_EXCLUDE_USERS` (ids de Clerk separados por
 * comas, en `.env.local` o en el entorno). Sus hogares salen marcados y no
 * cuentan en los totales.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { createClient } from "@supabase/supabase-js";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..");

// .env.local: la última definición de cada clave gana, como en dotenv.
const env = {};
for (const line of readFileSync(join(raiz, ".env.local"), "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
}
if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error(
    "Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local.",
  );
  process.exit(1);
}
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const excluded = new Set(
  (process.env.USAGE_REPORT_EXCLUDE_USERS ?? env.USAGE_REPORT_EXCLUDE_USERS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
);

/** Todas las filas de una tabla, de mil en mil. `null` si la tabla no existe. */
async function all(table, cols, { optional = false } = {}) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from(table).select(cols).range(from, from + 999);
    if (error) {
      // 42P01 / PGRST205: la tabla no existe (migración sin aplicar).
      if (optional && (error.code === "42P01" || error.code === "PGRST205")) return null;
      throw new Error(`${table}: ${error.message}`);
    }
    out.push(...data);
    if (data.length < 1000) return out;
  }
}

const [households, members, receipts, trips, listItems, menus, entries, inventory, push, days, events] =
  await Promise.all([
    all("households", "id, created_at, pantry_reviewed_at, pantry_review_enabled"),
    all("household_members", "household_id, user_id, role, joined_at"),
    all("receipts", "household_id, status, created_at, confirmed_at"),
    all("shopping_trips", "household_id, closed_at"),
    all("shopping_list_items", "household_id, created_at, checked_at"),
    all("weekly_menus", "household_id, created_at"),
    all("menu_entries", "household_id, cooked_at, skipped_at"),
    all("inventory_items", "household_id, quantity, updated_at"),
    all("push_subscriptions", "household_id, created_at"),
    all("usage_days", "household_id, user_id, day", { optional: true }),
    all("usage_events", "household_id, name, props, created_at", { optional: true }),
  ]);

const NOW = Date.now();
const DAY = 86_400_000;
const t = (s) => (s ? new Date(s).getTime() : null);
const fecha = (ms) =>
  ms == null ? "—" : new Date(ms).toLocaleDateString("sv-SE", { timeZone: "Europe/Madrid" });
const hace = (ms) => (ms == null ? "—" : `${Math.floor((NOW - ms) / DAY)}d`);
const tras = (ms, base) => (ms == null ? "—" : `+${Math.floor((ms - base) / DAY)}d`);
const of = (rows, id) => (rows ?? []).filter((r) => r.household_id === id);
const maxOf = (arr) => {
  const v = arr.filter((x) => x != null);
  return v.length ? Math.max(...v) : null;
};
const within = (ms, d) => ms != null && NOW - ms < d * DAY;
// Un `date` de Postgres ('2026-09-22') se lee a mediodía: para contar días la
// hora da igual, y así ningún desfase horario lo pasa al día de al lado.
const dayMs = (d) => t(`${d}T12:00:00Z`);

const sorted = [...households].sort((a, b) => t(a.created_at) - t(b.created_at));
const rows = sorted.map((h, i) => {
  const created = t(h.created_at);
  const mem = of(members, h.id);
  const test = mem.some((m) => excluded.has(m.user_id));
  const invited = mem
    .filter((m) => m.role !== "owner")
    .map((m) => t(m.joined_at))
    .sort((a, b) => a - b);
  const confirmed = of(receipts, h.id)
    .filter((r) => r.status === "confirmed")
    .map((r) => t(r.confirmed_at) ?? t(r.created_at))
    .sort((a, b) => a - b);
  const cooked = of(entries, h.id).map((e) => t(e.cooked_at)).filter(Boolean);
  const visits = of(days, h.id).map((d) => dayMs(d.day));
  const lastWrite = maxOf([
    ...confirmed,
    ...of(receipts, h.id).map((r) => t(r.created_at)),
    ...of(trips, h.id).map((r) => t(r.closed_at)),
    ...of(listItems, h.id).flatMap((r) => [t(r.created_at), t(r.checked_at)]),
    ...of(menus, h.id).map((r) => t(r.created_at)),
    ...cooked,
    ...of(entries, h.id).map((e) => t(e.skipped_at)),
    ...of(inventory, h.id).map((r) => t(r.updated_at)),
    ...of(push, h.id).map((r) => t(r.created_at)),
    ...invited,
  ]);
  return {
    view: {
      H: `H${i + 1}`,
      prueba: test ? "sí" : "",
      alta: fecha(created),
      miembros: mem.length,
      invitado: invited.length ? tras(invited[0], created) : "—",
      tickets: confirmed.length,
      "1er tkt": tras(confirmed[0] ?? null, created),
      "2º tkt": tras(confirmed[1] ?? null, created),
      compras: of(trips, h.id).length,
      menús: of(menus, h.id).length,
      cocinados: cooked.length,
      despensa: of(inventory, h.id).filter((r) => r.quantity > 0).length,
      push: of(push, h.id).length,
      "últ. escritura": hace(lastWrite),
      ...(days
        ? {
            "visitas 7d": visits.filter((ms) => within(ms, 7)).length,
            "visitas 30d": visits.filter((ms) => within(ms, 30)).length,
            "últ. visita": hace(maxOf(visits)),
          }
        : {}),
    },
    test,
    household: h,
    members: mem.length,
    tickets: confirmed.length,
    lastWrite,
    lastVisit: maxOf(visits),
  };
});

console.log("\nHogares (anonimizados, por orden de alta):");
console.table(rows.map((r) => r.view));

const real = rows.filter((r) => !r.test);
const n = (f) => real.filter(f).length;
console.log(
  `\n${rows.length} hogares (${rows.length - real.length} de prueba). Sobre los ${real.length} restantes:`,
);
console.log(`  con 2+ miembros (invitación aceptada): ${n((r) => r.members >= 2)}`);
console.log(`  con 1+ ticket confirmado:              ${n((r) => r.tickets >= 1)}`);
console.log(`  con 2+ tickets confirmados:            ${n((r) => r.tickets >= 2)}`);
console.log(`  con alguna escritura en 7 / 30 días:   ${n((r) => within(r.lastWrite, 7))} / ${n((r) => within(r.lastWrite, 30))}`);
if (days) {
  console.log(`  con alguna visita en 7 / 30 días:      ${n((r) => within(r.lastVisit, 7))} / ${n((r) => within(r.lastVisit, 30))}`);
}

if (!events || !days) {
  console.log(
    "\nVisitas y eventos: las tablas todavía no existen (falta aplicar la migración 20260922200832_eventos_de_uso).",
  );
  process.exit(0);
}

const realIds = new Set(real.map((r) => r.household.id));
const ev = events.filter((e) => realIds.has(e.household_id));
const byName = (name) => ev.filter((e) => e.name === name);
const sum = (list, key) => list.reduce((acc, e) => acc + (Number(e.props?.[key]) || 0), 0);
const answers = byName("pantry_review_answered");
const answerCount = (a) => answers.filter((e) => e.props?.answer === a).length;
const offered = sum(byName("pantry_review_opened"), "offered");
const firstEvent = events.length ? Math.min(...events.map((e) => t(e.created_at))) : null;
const since = firstEvent == null ? "sin eventos todavía" : fecha(firstEvent);

console.log(`\nRepaso de despensa (hogares reales; eventos desde ${since}):`);
console.log(`  abierto:           ${byName("pantry_review_opened").length} veces, ${offered} productos ofrecidos`);
console.log(
  `  respuestas:        ${answers.length}` +
    (offered ? ` (${Math.round((answers.length / offered) * 100)}% de lo ofrecido)` : "") +
    ` · queda ${answerCount("have")} · poco ${answerCount("low")} · se acabó ${answerCount("out")}`,
);
console.log(`  a la lista:        ${sum(byName("pantry_review_to_list"), "count")} productos`);
const postponed = byName("pantry_review_postponed");
console.log(
  `  aplazado:          ${postponed.filter((e) => e.props?.until === "tomorrow").length} a mañana · ${postponed.filter((e) => e.props?.until === "week").length} la semana`,
);
console.log(
  `  desactivado:       ${byName("pantry_review_disabled").length} · reactivado ${byName("pantry_review_enabled").length}`,
);

const shared = byName("invite_shared");
// Solo las aceptadas desde que hay eventos: comparar compartidos de un mes con
// aceptadas de toda la historia daría una tasa que no significa nada.
const accepted = members.filter(
  (m) =>
    realIds.has(m.household_id) &&
    m.role !== "owner" &&
    firstEvent != null &&
    t(m.joined_at) >= firstEvent,
).length;
console.log(`\nInvitaciones (desde ${since}):`);
console.log(
  `  enlace compartido: ${shared.length} (${shared.filter((e) => e.props?.via === "share").length} con compartir · ${shared.filter((e) => e.props?.via === "copy").length} copiado)`,
);
console.log(`  aceptadas:         ${accepted}`);
