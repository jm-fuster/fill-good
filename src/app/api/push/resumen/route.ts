import { createHash, timingSafeEqual } from "node:crypto";

import { createClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/types";
import { formatEuro } from "@/lib/money";
import { isPushConfigured, sendPush, type PushTarget } from "@/lib/push/send";

/**
 * Resumen mensual del hogar (G4, push). Un único aviso por hogar el día 1, a los
 * suscriptores con `pref_wins = true`, enlazando a /resumen del mes que acaba de
 * cerrarse.
 *
 * Programación: `vercel.json` lo llama el día 1 de cada mes. Misma auth de cron
 * (`Authorization: Bearer $CRON_SECRET`) y mismo cliente service-role que
 * /api/push/caducidades — ver allí la explicación larga del porqué de cada pieza.
 *
 * NO reutiliza `getMonthlyWrapped`: aquel usa `createServerSupabaseClient`, que
 * exige el JWT de Clerk, y aquí no hay sesión de usuario. Este endpoint solo
 * necesita una cifra (lo aportado a la hucha), así que la calcula con una
 * agregación directa sobre `receipts` en vez de arrastrar todo el resumen.
 *
 * Solo se envía si el mes tiene algo que contar: un push de "has ahorrado
 * 0,00 €" es peor que no enviar nada.
 */

export const dynamic = "force-dynamic";

function safeEqual(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

/** Primer día del mes anterior y del actual, en YYYY-MM-DD. */
function closedMonthRange(today: Date): { start: string; end: string; label: string } {
  const end = new Date(today.getFullYear(), today.getMonth(), 1);
  const start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  const iso = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
  const label = start.toLocaleDateString("es-ES", { month: "long" });
  return { start: iso(start), end: iso(end), label };
}

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");
  if (!cronSecret || !authHeader || !safeEqual(authHeader, `Bearer ${cronSecret}`)) {
    return Response.json({ error: "No autorizado" }, { status: 401 });
  }

  if (!isPushConfigured()) {
    return Response.json({ sent: 0 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    console.error(
      "Resumen mensual: faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY.",
    );
    return Response.json(
      { error: "Configuración de servidor incompleta" },
      { status: 500 },
    );
  }
  const admin = createClient<Database>(url, serviceKey, {
    auth: { persistSession: false },
  });

  const { start, end, label } = closedMonthRange(new Date());
  const monthParam = start.slice(0, 7);

  const { data: subs, error: subsErr } = await admin
    .from("push_subscriptions")
    .select("household_id, endpoint, p256dh, auth")
    .eq("pref_wins", true);
  if (subsErr) {
    console.error("Resumen mensual: error leyendo suscripciones:", subsErr);
    return Response.json({ error: "Error de base de datos" }, { status: 500 });
  }

  const targetsByHousehold = new Map<string, PushTarget[]>();
  for (const s of subs ?? []) {
    const list = targetsByHousehold.get(s.household_id) ?? [];
    list.push({ endpoint: s.endpoint, p256dh: s.p256dh, auth: s.auth });
    targetsByHousehold.set(s.household_id, list);
  }

  const goneAll: string[] = [];
  let householdsProcessed = 0;
  let pushesSent = 0;

  for (const [householdId, targets] of targetsByHousehold) {
    const { data: receipts, error: receiptsErr } = await admin
      .from("receipts")
      .select("total_amount, discount_total, savings_amount")
      .eq("household_id", householdId)
      .eq("status", "confirmed")
      .gte("purchased_at", start)
      .lt("purchased_at", end);
    if (receiptsErr) {
      console.error(
        `Resumen mensual: error leyendo tickets de ${householdId}:`,
        receiptsErr,
      );
      continue;
    }
    // Un hogar sin compras el mes pasado no recibe nada: no hay resumen que dar.
    if (!receipts || receipts.length === 0) continue;

    const saved = receipts.reduce(
      (sum, r) =>
        sum + (Number(r.discount_total) || 0) + (Number(r.savings_amount) || 0),
      0,
    );
    const spent = receipts.reduce((sum, r) => sum + (Number(r.total_amount) || 0), 0);
    householdsProcessed += 1;

    // Con saldo negativo el titular no habla de ahorro: el resumen completo lo
    // cuenta con matices, pero una notificación no tiene sitio para matizar y
    // "has ahorrado -3 €" sería una forma tonta de empezar el mes.
    const body =
      saved > 0
        ? `Ahorrasteis ${formatEuro(saved)} en ${receipts.length} ${
            receipts.length === 1 ? "compra" : "compras"
          }`
        : `${receipts.length} ${receipts.length === 1 ? "compra" : "compras"}, ${formatEuro(spent)} de gasto`;

    const { sent, gone } = await sendPush(targets, {
      title: `Resumen de ${label}`,
      body,
      url: `/resumen?mes=${monthParam}`,
      tag: "monthly-wrapped",
    });
    pushesSent += sent;
    goneAll.push(...gone);
  }

  if (goneAll.length) {
    await admin.from("push_subscriptions").delete().in("endpoint", goneAll);
  }

  return Response.json({ month: monthParam, householdsProcessed, pushesSent });
}
