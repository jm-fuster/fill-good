export type ExpiryStatus = "expired" | "soon" | "ok";

export type Season = "winter" | "summer";

/**
 * Temporada de una fecha (por defecto hoy) con el modelo simple de dos
 * estaciones para España:
 *   · invierno = octubre–abril (meses 10, 11, 12, 1, 2, 3, 4)
 *   · verano   = mayo–septiembre (meses 5, 6, 7, 8, 9)
 * Ejemplos: julio (7) → "summer"; enero (1) → "winter"; octubre (10) →
 * "winter"; mayo (5) → "summer". Una receta con seasons=['all'] vale siempre;
 * una de seasons=['winter'] no debería salir en un menú de julio.
 */
export function getCurrentSeason(date: Date = new Date()): Season {
  const month = date.getMonth() + 1; // 1 = enero … 12 = diciembre
  return month >= 5 && month <= 9 ? "summer" : "winter";
}

/**
 * Estado de caducidad de una fecha (YYYY-MM-DD). `warnDays` = umbral de aviso
 * "caduca pronto". Devuelve null si no hay fecha.
 */
export function getExpiryStatus(
  expiry: string | null | undefined,
  warnDays = 3,
): { status: ExpiryStatus; days: number } | null {
  if (!expiry) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(`${expiry}T00:00:00`);
  const days = Math.round((target.getTime() - today.getTime()) / 86_400_000);
  if (days < 0) return { status: "expired", days };
  if (days <= warnDays) return { status: "soon", days };
  return { status: "ok", days };
}

function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Lunes de la semana de `d` (por defecto hoy), como YYYY-MM-DD. */
export function getWeekStart(d: Date = new Date()): string {
  const date = new Date(d);
  date.setHours(0, 0, 0, 0);
  const day = date.getDay(); // 0=domingo … 6=sábado
  const diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff);
  return toISODate(date);
}

/** Los 7 días (lunes→domingo) a partir de un week_start YYYY-MM-DD. */
export function getWeekDays(weekStart: string): string[] {
  const base = new Date(`${weekStart}T00:00:00`);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(base);
    d.setDate(base.getDate() + i);
    return toISODate(d);
  });
}

/** Desplaza un week_start N semanas. */
export function shiftWeek(weekStart: string, weeks: number): string {
  const d = new Date(`${weekStart}T00:00:00`);
  d.setDate(d.getDate() + weeks * 7);
  return toISODate(d);
}

/** Texto corto para el badge de caducidad. */
export function expiryLabel(days: number): string {
  if (days < 0) {
    const d = Math.abs(days);
    return d === 1 ? "Caducó ayer" : `Caducó hace ${d} días`;
  }
  if (days === 0) return "Caduca hoy";
  if (days === 1) return "Caduca mañana";
  return `Caduca en ${days} días`;
}
