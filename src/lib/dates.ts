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
