export type ExpiryStatus = "expired" | "soon" | "ok";

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
