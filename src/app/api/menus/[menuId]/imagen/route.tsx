import { ImageResponse } from "next/og";
import { auth } from "@clerk/nextjs/server";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getMenuEntries, getMenuPrefs } from "@/features/menus/queries";
import { activeSlots } from "@/features/menus/slots";
import { getCurrentHousehold } from "@/features/household/queries";
import { getWeekDays } from "@/lib/dates";

// Necesita Node (Clerk auth + Supabase). ImageResponse funciona en Node.
export const runtime = "nodejs";

// Colores FIJOS: una imagen (Satori) no puede leer las CSS vars del tema; se usa
// una paleta clara coherente con la marca (verde fresco del primario).
const COLORS = {
  bg: "#ffffff",
  text: "#111827",
  muted: "#6b7280",
  primary: "#2e7d5b",
  border: "#e5e7eb",
  slotBg: "#f6f8f7",
};

function capitalize(value: string): string {
  return value.length > 0 ? value[0]!.toUpperCase() + value.slice(1) : value;
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ menuId: string }> },
) {
  const { userId } = await auth();
  if (!userId) {
    return new Response("No autorizado", { status: 401 });
  }

  const { menuId } = await params;
  const supabase = createServerSupabaseClient();

  // RLS aísla por hogar: un menú de otro hogar no devuelve fila → 404.
  const { data: menu } = await supabase
    .from("weekly_menus")
    .select("week_start")
    .eq("id", menuId)
    .maybeSingle();
  if (!menu) {
    return new Response("Menú no encontrado", { status: 404 });
  }

  const [household, entries, prefs] = await Promise.all([
    getCurrentHousehold(),
    getMenuEntries(menuId),
    getMenuPrefs(),
  ]);

  const days = getWeekDays(menu.week_start);
  const slots = activeSlots(prefs.planBreakfast);

  // Platos por hueco (ya vienen ordenados por fecha, slot y posición).
  const bySlot = new Map<string, string[]>();
  for (const e of entries) {
    const text = e.recipeName ?? e.freeText ?? "";
    if (!text) continue;
    const key = `${e.date}|${e.slot}`;
    const arr = bySlot.get(key) ?? [];
    arr.push(text);
    bySlot.set(key, arr);
  }

  const weekRange = `${format(parseISO(days[0]!), "d 'de' MMMM", {
    locale: es,
  })} – ${format(parseISO(days[6]!), "d 'de' MMMM", { locale: es })}`;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          backgroundColor: COLORS.bg,
          color: COLORS.text,
          padding: 56,
          fontFamily: "sans-serif",
        }}
      >
        {/* Cabecera */}
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              display: "flex",
              fontSize: 24,
              fontWeight: 700,
              color: COLORS.primary,
              textTransform: "uppercase",
              letterSpacing: 2,
            }}
          >
            {household?.name ?? "Mi hogar"}
          </div>
          <div style={{ display: "flex", fontSize: 56, fontWeight: 800 }}>
            Menú de la semana
          </div>
          <div style={{ display: "flex", fontSize: 26, color: COLORS.muted }}>
            {capitalize(weekRange)}
          </div>
        </div>

        {/* Días */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            marginTop: 28,
            gap: 12,
          }}
        >
          {days.map((date) => (
            <div
              key={date}
              style={{
                display: "flex",
                flexDirection: "row",
                border: `1px solid ${COLORS.border}`,
                borderRadius: 16,
                padding: 16,
                gap: 16,
              }}
            >
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  width: 150,
                }}
              >
                <div style={{ display: "flex", fontSize: 26, fontWeight: 700 }}>
                  {capitalize(format(parseISO(date), "EEEE", { locale: es }))}
                </div>
                <div style={{ display: "flex", fontSize: 20, color: COLORS.muted }}>
                  {format(parseISO(date), "d 'de' MMM", { locale: es })}
                </div>
              </div>

              <div
                style={{ display: "flex", flexDirection: "row", flex: 1, gap: 12 }}
              >
                {slots.map((slot) => {
                  const dishes = bySlot.get(`${date}|${slot.key}`) ?? [];
                  return (
                    <div
                      key={slot.key}
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        flex: 1,
                        backgroundColor: COLORS.slotBg,
                        borderRadius: 12,
                        padding: 12,
                        gap: 4,
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          fontSize: 17,
                          fontWeight: 700,
                          color: COLORS.primary,
                          textTransform: "uppercase",
                          letterSpacing: 1,
                        }}
                      >
                        {slot.label}
                      </div>
                      {dishes.length > 0 ? (
                        dishes.map((dish, i) => (
                          <div
                            key={i}
                            style={{ display: "flex", fontSize: 22, lineHeight: 1.2 }}
                          >
                            {dish}
                          </div>
                        ))
                      ) : (
                        <div
                          style={{
                            display: "flex",
                            fontSize: 20,
                            color: COLORS.muted,
                          }}
                        >
                          —
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Pie */}
        <div
          style={{
            display: "flex",
            marginTop: "auto",
            paddingTop: 24,
            fontSize: 22,
            color: COLORS.muted,
          }}
        >
          Fill Good · Compra lo justo, ahorra más
        </div>
      </div>
    ),
    { width: 1080, height: 1600 },
  );
}
