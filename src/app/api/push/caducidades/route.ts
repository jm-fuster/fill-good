import { createClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/types";
import { getExpiryStatus } from "@/lib/dates";
import { isPushConfigured, sendPush, type PushTarget } from "@/lib/push/send";

/**
 * Resumen diario de caducidades (push). Emite un único aviso por hogar con lo
 * que caduca en los próximos 3 días, a los suscriptores con `pref_expiry = true`.
 *
 * Programación: `vercel.json` lo llama a diario (Vercel Cron añade la cabecera
 * `Authorization: Bearer $CRON_SECRET` automáticamente cuando la env `CRON_SECRET`
 * existe en el proyecto). TAREA DEL USUARIO: definir `CRON_SECRET` en `.env.local`
 * y en el dashboard de Vercel — sin ella este endpoint responde 401 a todo.
 *
 * Alternativa equivalente si el despliegue NO está en Vercel (no implementada
 * aquí; `vercel.json` es la vía primaria): `pg_cron` + `pg_net` haciendo un GET
 * a la URL de producción con la misma cabecera Bearer. El proyecto ya usa
 * `pg_cron` (ver supabase/migrations/20260723160000_data_retention.sql).
 *
 * Corre sin sesión de usuario, así que usa un cliente service-role (sin RLS),
 * replicando scripts/backfill-price-insights.mjs (mismas env vars). NO se puede
 * usar createServerSupabaseClient (exige el JWT de Clerk).
 */

// No cachear: depende de la cabecera de autorización y de datos en vivo.
export const dynamic = "force-dynamic";

const WARN_DAYS = 3;

/** Texto de una única línea próxima a caducar, en minúscula para el body. */
function dueLabel(expiry: string): string {
  const status = getExpiryStatus(expiry, WARN_DAYS);
  const days = status?.days ?? 0;
  if (days < 0) return "ya está caducado";
  if (days === 0) return "caduca hoy";
  if (days === 1) return "caduca mañana";
  return `caduca en ${days} días`;
}

export async function GET(request: Request) {
  // 1. Auth de cron: solo con el Bearer correcto. Sin CRON_SECRET definida,
  //    ninguna petición coincide (el endpoint queda cerrado por defecto).
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return Response.json({ error: "No autorizado" }, { status: 401 });
  }

  // 6. Sin claves VAPID el push es inerte: mismo criterio que el resto del push.
  if (!isPushConfigured()) {
    return Response.json({ sent: 0 });
  }

  // 2. Cliente service-role (sin RLS).
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    console.error(
      "Resumen de caducidades: faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY.",
    );
    return Response.json(
      { error: "Configuración de servidor incompleta" },
      { status: 500 },
    );
  }
  const admin = createClient<Database>(url, serviceKey, {
    auth: { persistSession: false },
  });

  // 3a. Suscripciones con el resumen de caducidades activo, agrupadas por hogar.
  const { data: subs, error: subsErr } = await admin
    .from("push_subscriptions")
    .select("household_id, endpoint, p256dh, auth")
    .eq("pref_expiry", true);
  if (subsErr) {
    console.error("Resumen de caducidades: error leyendo suscripciones:", subsErr);
    return Response.json({ error: "Error de base de datos" }, { status: 500 });
  }

  const targetsByHousehold = new Map<string, PushTarget[]>();
  for (const s of subs ?? []) {
    const list = targetsByHousehold.get(s.household_id) ?? [];
    list.push({ endpoint: s.endpoint, p256dh: s.p256dh, auth: s.auth });
    targetsByHousehold.set(s.household_id, list);
  }

  // Límite de la ventana: hoy + 3 días (YYYY-MM-DD).
  const limitDate = new Date();
  limitDate.setDate(limitDate.getDate() + WARN_DAYS);
  const limitIso = limitDate.toISOString().slice(0, 10);

  const goneAll: string[] = [];
  let householdsProcessed = 0;
  let pushesSent = 0;

  // 3b + 4. Por hogar con suscriptores: lo que caduca en ≤3 días → un push.
  for (const [householdId, targets] of targetsByHousehold) {
    const { data: items, error: itemsErr } = await admin
      .from("inventory_items")
      .select("expiry_date, product:products(name)")
      .eq("household_id", householdId)
      .not("expiry_date", "is", null)
      .gt("quantity", 0)
      .lte("expiry_date", limitIso)
      .order("expiry_date", { ascending: true });
    if (itemsErr) {
      console.error(
        `Resumen de caducidades: error leyendo inventario de ${householdId}:`,
        itemsErr,
      );
      continue;
    }
    if (!items || items.length === 0) continue;
    householdsProcessed += 1;

    const first = items[0];
    const firstName =
      (first.product as { name: string } | null)?.name ?? "Un producto";
    const body =
      items.length === 1
        ? `${firstName} ${dueLabel(first.expiry_date as string)}`
        : `${items.length} productos caducan en los próximos ${WARN_DAYS} días`;

    const { sent, gone } = await sendPush(targets, {
      title: "Caducidades",
      body,
      url: "/inventario",
      tag: "expiry-digest",
    });
    pushesSent += sent;
    goneAll.push(...gone);
  }

  // Higiene: borrar los endpoints muertos (404/410) devueltos (obligatorio, ver
  // el comentario de sendPush y el patrón de notify.ts).
  if (goneAll.length) {
    await admin.from("push_subscriptions").delete().in("endpoint", goneAll);
  }

  // 5. Contadores para depurar.
  return Response.json({ householdsProcessed, pushesSent });
}
