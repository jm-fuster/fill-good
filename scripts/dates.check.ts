/**
 * Comprobaciones del calendario de la app (`src/lib/dates.ts`). Lo ejecuta
 * `npm run check:fechas` (ver `scripts/check-dates.mjs`, que lo empaqueta con
 * esbuild y —esto es lo importante— lo corre bajo VARIAS zonas horarias).
 *
 * Por qué hace falta. La app decide con el calendario ESPAÑOL, pero su código
 * corre en dos sitios con relojes distintos: el servidor de Vercel, que va en
 * UTC, y el móvil de quien la usa. Mientras cada lado leía su propio reloj, de
 * 00:00 a 02:00 hora española discrepaban, y no en algo cosmético: la interfaz
 * ofrecía «Lo cocinamos» y la acción contestaba «ese día todavía no ha pasado»,
 * /menus abría en la semana anterior y se declaraba pasada, /perfil enseñaba el
 * mes que acababa de cerrarse como si fuera el corriente y el botón de posponer
 * el repaso no posponía nada. Seis síntomas, un solo fallo.
 *
 * Lo que fija este check es esa única regla: **misma fecha civil se ejecute
 * donde se ejecute**. Por eso los casos no llevan la fecha «de hoy» sino
 * instantes concretos elegidos en las fronteras (medianoche española, cambio de
 * mes, cambio de año, verano contra invierno), y por eso el envoltorio lo corre
 * con TZ=UTC, TZ=Europe/Madrid y TZ=America/New_York: si alguien vuelve a dejar
 * que hable el reloj del proceso, las tres tandas dejan de coincidir.
 *
 * El compilador no defiende nada de esto: `new Date()` y la fecha española son
 * las dos un `Date`, y `todayLocalISO()` devuelve un `string` en cualquier caso.
 *
 * Lo que NO se comprueba: los instantes (`toISOString`, `created_at`), que son
 * instantes y no cambian de zona; ni la aritmética de `getWeekDays`/`shiftWeek`,
 * que solo cuenta días sobre un YYYY-MM-DD ya resuelto.
 */
import {
  currentMonthInSpain,
  dayOfMonthInSpain,
  expiryLabel,
  getCurrentSeason,
  getExpiryStatus,
  getWeekDays,
  getWeekStart,
  hourInSpain,
  isoDateInSpain,
  shiftDays,
  startOfDayInSpain,
  todayLocalISO,
} from "@/lib/dates";

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

const zona = process.env.TZ ?? "(la del sistema)";
console.log(`\n=== Calendario de la app · TZ del proceso: ${zona} ===`);

/*
  La franja que rompía todo. 22:30 UTC del 10 de agosto de 2026 son las 00:30
  del día 11 en España (verano, +02:00). Para el servidor era todavía día 10.
*/
const madrugadaVerano = "2026-08-10T22:30:00Z";
/* En invierno el desfase es de una hora: 23:30 UTC del 14 de enero = 00:30 del 15. */
const madrugadaInvierno = "2026-01-14T23:30:00Z";

seccion("La fecha es la española, no la del proceso");
check(
  "00:30 de una noche de verano ya es el día siguiente",
  isoDateInSpain(madrugadaVerano) === "2026-08-11",
  { real: isoDateInSpain(madrugadaVerano) },
);
check(
  "y en invierno también (una hora de desfase, no dos)",
  isoDateInSpain(madrugadaInvierno) === "2026-01-15",
  { real: isoDateInSpain(madrugadaInvierno) },
);
check(
  "a media tarde no hay duda posible",
  isoDateInSpain("2026-08-10T16:00:00Z") === "2026-08-10",
);
/*
  El caso que hacía que «¿qué hago hoy?» apuntara la receta a la comida de AYER:
  la hora ya se leía en España (decía 0) pero la fecha no (decía el día anterior).
  Hora y fecha tienen que hablar del MISMO día.
*/
check(
  "la hora española y la fecha española son del mismo día",
  hourInSpain(new Date(madrugadaVerano)) === 0 &&
    isoDateInSpain(madrugadaVerano) === "2026-08-11",
  { hora: hourInSpain(new Date(madrugadaVerano)) },
);

seccion("La semana empieza el lunes español");
/*
  9 de agosto de 2026 es domingo. A las 22:30 UTC ya es lunes 10 en España, así
  que la semana visible tiene que ser la que empieza ESE lunes. Con el reloj del
  proceso, /menus abría en la semana anterior y encima la daba por pasada.
*/
check(
  "un domingo a las 00:30 españolas ya es la semana nueva",
  getWeekStart(new Date("2026-08-09T22:30:00Z")) === "2026-08-10",
  { real: getWeekStart(new Date("2026-08-09T22:30:00Z")) },
);
check(
  "un domingo por la tarde sigue siendo la semana que acaba",
  getWeekStart(new Date("2026-08-09T16:00:00Z")) === "2026-08-03",
);
check(
  "un lunes por la mañana es su propia semana",
  getWeekStart(new Date("2026-08-10T09:00:00Z")) === "2026-08-10",
);
check(
  "la semana tiene los siete días y acaba en domingo",
  getWeekDays("2026-08-10").length === 7 &&
    getWeekDays("2026-08-10")[6] === "2026-08-16",
);
/* Cambio de año: la semana no se calcula por número ISO, así que cruza sin ruido. */
check(
  "una semana a caballo entre diciembre y enero",
  getWeekStart(new Date("2026-12-31T12:00:00Z")) === "2026-12-28" &&
    getWeekDays("2026-12-28")[6] === "2027-01-03",
);

seccion("El mes en curso");
check(
  "a las 00:30 del día 1 el mes ya ha cambiado",
  currentMonthInSpain(new Date("2026-08-31T22:30:00Z")) === "2026-09",
  { real: currentMonthInSpain(new Date("2026-08-31T22:30:00Z")) },
);
check(
  "y el día del mes es 1, no 31",
  dayOfMonthInSpain(new Date("2026-08-31T22:30:00Z")) === 1,
);
check(
  "el último día del mes, hasta las 22:00 UTC, sigue siendo el mes viejo",
  currentMonthInSpain(new Date("2026-08-31T18:00:00Z")) === "2026-08",
);

seccion("Fronteras contra columnas timestamptz");
/*
  `shopping_trips.closed_at` es timestamptz: la frontera de mes tiene que ser un
  INSTANTE. Postgres lee '2026-09-01' como medianoche UTC, que en España son las
  02:00, así que una compra cerrada a la 01:00 del día 1 caía en el mes anterior.
*/
check(
  "en verano la medianoche española son las 22:00 UTC del día antes",
  startOfDayInSpain("2026-09-01") === "2026-08-31T22:00:00.000Z",
  { real: startOfDayInSpain("2026-09-01") },
);
check(
  "en invierno son las 23:00 UTC del día antes",
  startOfDayInSpain("2026-01-01") === "2025-12-31T23:00:00.000Z",
  { real: startOfDayInSpain("2026-01-01") },
);
/* El día del cambio de hora: en España se cambia a las 02:00/03:00, así que la
   medianoche existe igual y el helper no puede quedarse sin candidato. */
check(
  "el día del cambio de hora de marzo tiene medianoche",
  startOfDayInSpain("2026-03-29") === "2026-03-28T23:00:00.000Z",
  { real: startOfDayInSpain("2026-03-29") },
);
check(
  "y el de octubre también",
  startOfDayInSpain("2026-10-25") === "2026-10-24T22:00:00.000Z",
  { real: startOfDayInSpain("2026-10-25") },
);

seccion("Caducidades, contadas en días de calendario");
/*
  Estas se apoyan en el «hoy» real, así que se fijan por relación y no por valor:
  lo que no puede pasar es que el badge diga «caduca hoy» sobre algo de ayer.
*/
const hoy = todayLocalISO();
check("lo de hoy caduca hoy", getExpiryStatus(hoy)?.days === 0);
check("y se rotula como tal", expiryLabel(0) === "Caduca hoy");
check(
  "«caduca hoy» NO es «caducado»",
  getExpiryStatus(hoy)?.status === "soon",
);
check(
  "lo de ayer sí está caducado",
  getExpiryStatus(shiftDays(hoy, -1))?.status === "expired",
);
check(
  "lo de dentro de tres días avisa",
  getExpiryStatus(shiftDays(hoy, 3))?.status === "soon",
);
check(
  "lo de dentro de un mes no",
  getExpiryStatus(shiftDays(hoy, 30))?.status === "ok",
);
check("sin fecha no hay estado", getExpiryStatus(null) === null);

seccion("Temporada");
check(
  "mayo es verano",
  getCurrentSeason(new Date("2026-05-15T12:00:00Z")) === "summer",
);
check(
  "octubre es invierno",
  getCurrentSeason(new Date("2026-10-15T12:00:00Z")) === "winter",
);
/* La madrugada del 1 de mayo: con el mes del proceso, servidor y cliente
   elegían recetarios distintos durante dos horas. */
check(
  "a las 00:30 del 1 de mayo ya es verano",
  getCurrentSeason(new Date("2026-04-30T22:30:00Z")) === "summer",
  { real: getCurrentSeason(new Date("2026-04-30T22:30:00Z")) },
);

console.log(
  fallos === 0
    ? `\nCalendario (TZ=${zona}): todo correcto.\n`
    : `\nCalendario (TZ=${zona}): ${fallos} fallo(s).\n`,
);
process.exit(fallos === 0 ? 0 : 1);
