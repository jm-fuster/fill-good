export type ExpiryStatus = "expired" | "soon" | "ok";

export type Season = "winter" | "summer";

/**
 * La app decide SIEMPRE con el calendario español, corra donde corra.
 *
 * Fill Good es un producto de mercado español y su día es el día que vive el
 * hogar. Vercel corre en UTC, así que durante la franja de 00:00 a 02:00 hora
 * española el servidor está todavía en la fecha de ayer, y hasta ahora cada
 * lado decidía por su cuenta: el cliente con el reloj del móvil y el servidor
 * con el suyo. Eso no producía «un desfase de horas» sino pantallas que se
 * contradicen entre sí —la interfaz ofrecía «Lo cocinamos» y la acción
 * contestaba «ese día todavía no ha pasado», /menus abría en la semana anterior
 * y se declaraba pasada, el mes en curso de /perfil era el anterior y el botón
 * de posponer el repaso no posponía nada—. Todos eran el mismo fallo contado
 * seis veces.
 *
 * Fijando la zona aquí, cliente y servidor calculan la MISMA fecha civil y esas
 * contradicciones dejan de ser posibles por construcción. Lo que sigue siendo
 * cierto es que un instante (`toISOString`, `created_at`) es un instante: esto
 * solo gobierna las fechas y los meses del calendario.
 */
const APP_TIME_ZONE = "Europe/Madrid";

/**
 * Formateadores a nivel de módulo. Construir un `Intl.DateTimeFormat` no es
 * gratis y `todayLocalISO`/`getExpiryStatus` se llaman una vez por fila del
 * inventario, así que se crean una sola vez.
 */
const spainDateFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: APP_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const spainHourFormat = new Intl.DateTimeFormat("es-ES", {
  timeZone: APP_TIME_ZONE,
  hour: "numeric",
  hour12: false,
});

/**
 * Fecha civil española de un instante, como YYYY-MM-DD. Se compone por partes
 * en vez de fiarse del formato del locale, que es cosa de la implementación.
 */
function toISODateInSpain(d: Date): string {
  const parts = spainDateFormat.formatToParts(d);
  const get = (type: string) =>
    parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

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
  // El mes es el español, no el del proceso: en la madrugada del 1 de mayo o
  // del 1 de octubre, servidor y cliente elegirían temporadas distintas y con
  // ellas dos recetarios distintos.
  const month = Number(toISODateInSpain(date).slice(5, 7));
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
  // Las dos fechas se construyen igual (medianoche local del proceso a partir
  // de un YYYY-MM-DD), así que la resta cuenta días de calendario sin que la
  // zona del proceso intervenga. Lo que fija cuál es «hoy» es todayLocalISO.
  const today = new Date(`${todayLocalISO()}T00:00:00`);
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

/**
 * Hoy como YYYY-MM-DD en España, lo ejecute el navegador o el servidor (ver
 * `APP_TIME_ZONE`). Los dos lados obtienen la misma respuesta, que es lo que
 * permite que la interfaz solo ofrezca lo que la acción va a aceptar.
 */
export function todayLocalISO(): string {
  return toISODateInSpain(new Date());
}

/**
 * Mes en curso en España, como YYYY-MM. Es el que decide qué gasto es «el de
 * este mes» en /perfil y qué mes se da por cerrado en /resumen: leerlo del
 * reloj del proceso hacía que, durante las primeras horas del día 1, la app
 * enseñara el mes anterior como si fuera el corriente.
 */
export function currentMonthInSpain(date: Date = new Date()): string {
  return toISODateInSpain(date).slice(0, 7);
}

/** Día del mes (1–31) en España. */
export function dayOfMonthInSpain(date: Date = new Date()): number {
  return Number(toISODateInSpain(date).slice(8, 10));
}

/**
 * Fecha civil española (YYYY-MM-DD) de un instante ISO, como los `created_at`
 * que PostgREST serializa en UTC. Recortar esos instantes con `slice(0, 10)`
 * archiva en el día anterior todo lo ocurrido de madrugada.
 */
export function isoDateInSpain(instant: string): string {
  return toISODateInSpain(new Date(instant));
}

/**
 * Instante en que empieza, en España, la fecha civil `dateISO`, en ISO con Z.
 *
 * Para comparar contra columnas `timestamptz` (`shopping_trips.closed_at`).
 * Postgres castea la cadena '2026-09-01' a medianoche UTC, o sea las 02:00 de
 * Madrid en verano: una compra cerrada a la 01:00 del día 1 se contaba en el
 * mes ANTERIOR, mientras su ticket —cuya `purchased_at` es un `date` sin zona—
 * contaba en el nuevo. Las dos cifras del mismo mes salían de dos calendarios.
 *
 * España usa solo dos offsets (+01:00 en invierno, +02:00 en verano) y cambia
 * la hora a las 02:00/03:00, así que la medianoche existe todos los días y
 * exactamente uno de los dos candidatos es la de verdad: se queda el que,
 * traducido de vuelta a hora española, marca las 0 h.
 */
export function startOfDayInSpain(dateISO: string): string {
  for (const offset of ["+01:00", "+02:00"]) {
    const candidate = new Date(`${dateISO}T00:00:00${offset}`);
    if (toISODateInSpain(candidate) === dateISO && hourInSpain(candidate) === 0) {
      return candidate.toISOString();
    }
  }
  // Inalcanzable mientras España siga con esos dos offsets. Si algún día
  // cambiara, una frontera aproximada es mejor que una excepción en el panel.
  return new Date(`${dateISO}T00:00:00Z`).toISOString();
}

/**
 * Ahora, en milisegundos desde epoch. Es `Date.now()` con un nombre, y existe
 * para poder leer el reloj desde el render de un Server Component: ahí es
 * legítimo —se renderiza una vez por petición— pero llamar directamente a una
 * función impura dentro de un componente es lo que veta el compilador de React,
 * sin distinguir servidor de cliente.
 *
 * No lo uses en un componente CLIENTE: ahí el render se repite y el número
 * cambiaría entre repintados. Si un cliente necesita «cuándo se cargó esto», que
 * se lo pase el servidor como prop (lo hace el modo cocinado).
 */
export function nowMs(): number {
  return Date.now();
}

/**
 * Hora del día (0–23) en España. Para decisiones de franja («¿comida o cena?»)
 * tomadas en SERVIDOR: Vercel corre en UTC y su reloj va 1–2 horas por detrás —
 * a las 17:30 españolas `getHours()` decía 15 y la receta de «hoy» caía en la
 * comida en vez de en la cena, todos los días de verano.
 *
 * Fue el primer sitio donde se fijó la zona; hoy la fecha va por el mismo
 * criterio (`APP_TIME_ZONE`), así que la hora y el día ya no pueden discrepar:
 * antes, a las 00:20, esta función decía «madrugada» mientras la fecha decía
 * todavía ayer, y «¿qué hago hoy?» apuntaba la receta a la comida de AYER.
 */
export function hourInSpain(date: Date = new Date()): number {
  return Number(spainHourFormat.format(date));
}

/**
 * Si es una fecha YYYY-MM-DD que EXISTE. La forma no basta: «2026-02-30»
 * pasa cualquier regex y Postgres la rechaza en una columna `date`, que en el
 * ticket era perder el insert con la llamada de IA ya pagada. Se comprueba
 * en UTC puro porque aquí no hay instante ni zona: solo si el día existe.
 */
export function isCalendarDate(value: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  return (
    date.getUTCFullYear() === y &&
    date.getUTCMonth() === mo - 1 &&
    date.getUTCDate() === d
  );
}

/** Desplaza una fecha YYYY-MM-DD N días (negativo = hacia atrás). */
export function shiftDays(dateISO: string, days: number): string {
  const d = new Date(`${dateISO}T00:00:00`);
  d.setDate(d.getDate() + days);
  return toISODate(d);
}

/**
 * Lunes de la semana de `d` (por defecto hoy), como YYYY-MM-DD.
 *
 * Parte de la fecha CIVIL española y desde ahí solo cuenta días, así que la
 * semana que abre /menus es la misma en el móvil y en el servidor. Con el reloj
 * del proceso, un lunes a las 00:30 el servidor devolvía el lunes anterior: la
 * página abría en la semana que acababa de terminar y, como el cliente sí sabía
 * que era lunes, la daba por pasada y escondía todos los botones.
 */
export function getWeekStart(d: Date = new Date()): string {
  const date = new Date(`${toISODateInSpain(d)}T00:00:00`);
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

/**
 * Etiqueta relativa en días desde una fecha pasada (YYYY-MM-DD) hasta hoy:
 * "hoy" / "ayer" / "hace N días". Pensada para "última vez que se cocinó".
 */
export function relativeDaysLabel(dateStr: string): string {
  const today = new Date(`${todayLocalISO()}T00:00:00`);
  const target = new Date(`${dateStr}T00:00:00`);
  const days = Math.round((today.getTime() - target.getTime()) / 86_400_000);
  if (days <= 0) return "hoy";
  if (days === 1) return "ayer";
  return `hace ${days} días`;
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
