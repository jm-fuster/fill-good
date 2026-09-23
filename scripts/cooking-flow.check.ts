/**
 * Comprobaciones del modo cocinado (`src/features/recipes/cooking-flow.ts`). Lo
 * ejecuta `npm run check:cocina` (ver `scripts/check-cooking-flow.mjs`, que lo
 * empaqueta con esbuild porque esto es TypeScript y tira del alias `@/`).
 *
 * Por qué hace falta comprobarlo. Son dos reglas y las dos son invisibles para
 * el compilador:
 *
 * 1. **Por dónde se entra.** El progreso vive en `localStorage`, o sea que del
 *    otro lado hay un `string | null` y nada más: lo pudo escribir una versión
 *    anterior de la app, otra pestaña, o nadie. Y el número que lleva dentro
 *    apunta a una lista de pasos que se puede haber EDITADO entre dos sesiones
 *    —o desde el otro móvil mientras cocinas—. Un índice fuera de rango no falla
 *    con un error: pinta una pantalla en blanco donde debería ir el paso, que es
 *    justo lo que nadie relaciona con «edité la receta».
 *
 * 2. **Qué se ofrece al terminar.** `toggleEntryCookedAction` rechaza marcar
 *    como cocinado un día que todavía no ha llegado. Si la pantalla de cierre no
 *    copia ese veto, ofrece un botón cuyo único desenlace posible es un aviso de
 *    error, y encima en el momento de celebrar que el plato está hecho. Quitar
 *    esa rama no cambia ningún tipo —`FinishOffer` sigue siendo `FinishOffer`—:
 *    lo único que cambia es lo que sale por pantalla.
 *
 * 3. **Qué tiempos se ofrecen para poner en marcha.** `step-timers.ts` adivina
 *    sobre texto libre escrito por una persona o por un modelo, donde
 *    «20 minutos» y «200 g» son los dos un número seguido de letras. El coste de
 *    equivocarse no es simétrico —un tiempo no detectado se pone a mano, un chip
 *    de «180 min» sacado de «180 grados» arruina la cena—, así que lo que fijan
 *    los casos de abajo es sobre todo lo que NO debe detectar.
 *
 * Lo que NO se comprueba: el componente, la escritura en `localStorage` ni las
 * Server Actions que encadena el cierre (esas las cubre `check:guardas`).
 */
import {
  clampStep,
  finishOffer,
  progressStorageKey,
  PROGRESS_TTL_MS,
  readProgress,
  timesCookedLabel,
  writeProgress,
  type CookingEntry,
} from "@/features/recipes/cooking-flow";
import {
  findStepTimers,
  formatCountdown,
  MAX_TIMERS_PER_STEP,
  timerLabel,
} from "@/features/recipes/step-timers";

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

/** Una hora fija: comparar contra el reloj real no mediría lo mismo dos veces. */
const AHORA = 1_754_400_000_000;

function guardado(step: number, hace = 0): string {
  return writeProgress(step, AHORA - hace);
}

/** Entrada del menú con lo justo que mira `finishOffer`. */
function entrada(date: string, cookedAt: string | null = null): CookingEntry {
  return { id: "e1", date, cookedAt };
}

seccion("Acotar el paso a los que existen");
check("un índice normal pasa entero", clampStep(3, 8) === 3);
check("el primero es 0", clampStep(0, 8) === 0);
check("el último es total - 1", clampStep(7, 8) === 7);
check(
  "un índice más allá del final cae en el último paso que existe",
  clampStep(12, 8) === 7,
  { real: clampStep(12, 8) },
);
check("un negativo cae en el primero", clampStep(-4, 8) === 0);
check("sin pasos no hay paso: 0", clampStep(5, 0) === 0);
check("un decimal se trunca, no se redondea", clampStep(3.9, 8) === 3, {
  real: clampStep(3.9, 8),
});
check("un NaN cae en el primero", clampStep(Number.NaN, 8) === 0);

seccion("Retomar por donde ibas");
check("sin nada guardado se empieza de cero", readProgress(null, 8, AHORA) === 0);
check(
  "un progreso recién escrito se retoma",
  readProgress(guardado(4), 8, AHORA) === 4,
);
check(
  "dentro del plazo se retoma",
  readProgress(guardado(4, PROGRESS_TTL_MS - 1000), 8, AHORA) === 4,
);
check(
  "pasado el plazo se empieza de cero",
  readProgress(guardado(4, PROGRESS_TTL_MS + 1000), 8, AHORA) === 0,
);
/*
  El reloj del móvil se puede mover (cambio de zona, ajuste a mano). Sin este
  lado de la comprobación, un `at` en el futuro daba una diferencia NEGATIVA, que
  nunca supera el plazo: el progreso no caducaba jamás.
*/
check(
  "un progreso con fecha futura no vale (el reloj se movió)",
  readProgress(guardado(4, -60_000), 8, AHORA) === 0,
);
/*
  La pantalla lee SIEMPRE con el mismo instante (el de la carga, congelado: leer
  el reloj en cada render es impuro), así que tiene que escribir con ese mismo
  instante. Estos dos casos son el bicho que salió de confundirlos: escribiendo
  con el reloj de cada avance, el sello queda por delante del instante de
  lectura, la comprobación del reloj movido salta y el paso vuelve al primero en
  cuanto avanzas. Los dos parámetros son `number`, así que aquí no hay tipo que
  avise.
*/
check(
  "escrito con el instante de carga (lo que hace la pantalla): se retoma",
  readProgress(writeProgress(4, AHORA), 8, AHORA) === 4,
);
check(
  "escrito con un reloj posterior al de lectura: NO se retoma",
  readProgress(writeProgress(4, AHORA + 5_000), 8, AHORA) === 0,
);
check(
  "un texto que no es JSON se ignora",
  readProgress("paso 4", 8, AHORA) === 0,
);
check("un JSON de otra forma se ignora", readProgress("[1,2]", 8, AHORA) === 0);
check(
  "un JSON sin los campos que esperamos se ignora",
  readProgress('{"paso":4}', 8, AHORA) === 0,
);
check("un null literal se ignora", readProgress("null", 8, AHORA) === 0);
/*
  El caso que de verdad pasa: guardas el progreso, alguien recorta la receta a
  tres pasos y vuelves. Sin acotar, la pantalla pediría el paso 6 de una lista de
  3 y pintaría un hueco en blanco donde va el texto.
*/
check(
  "una receta recortada desde la última vez no deja el paso fuera de rango",
  readProgress(guardado(6), 3, AHORA) === 2,
  { real: readProgress(guardado(6), 3, AHORA) },
);
check(
  "una receta que se quedó sin pasos empieza en 0",
  readProgress(guardado(6), 0, AHORA) === 0,
);

seccion("La clave del progreso es por receta");
check(
  "dos recetas no comparten progreso",
  progressStorageKey("r1") !== progressStorageKey("r2"),
);
check(
  "la misma receta da siempre la misma clave",
  progressStorageKey("r1") === progressStorageKey("r1"),
);

seccion("Qué se ofrece al terminar");
const HOY = "2026-08-06";
check(
  "sin entrada del menú no hay nada que marcar",
  finishOffer(null, HOY) === "none",
);
check(
  "un plato de hoy sin contestar ofrece el botón",
  finishOffer(entrada(HOY), HOY) === "mark",
);
check(
  "un plato de ayer sin contestar ofrece el botón",
  finishOffer(entrada("2026-08-05"), HOY) === "mark",
);
check(
  "un plato ya marcado no se vuelve a preguntar",
  finishOffer(entrada("2026-08-05", "2026-08-05"), HOY) === "already",
);
/*
  El caso por el que existe la función. El servidor VETA marcar un día futuro
  (`toggleEntryCookedAction`), así que ofrecerlo aquí sería un botón que solo
  puede acabar en un aviso de error — en la pantalla que celebra el plato.
*/
check(
  "un plato planificado para mañana NO ofrece marcarlo",
  finishOffer(entrada("2026-08-07"), HOY) === "future",
);
check(
  "el veto mira el día, no la semana: pasado mañana tampoco",
  finishOffer(entrada("2026-08-08"), HOY) === "future",
);
check(
  "un plato futuro YA marcado se queda en «ya está», no en «futuro»",
  finishOffer(entrada("2026-08-07", "2026-08-07"), HOY) === "already",
);

seccion("Cuántas veces lo habéis cocinado");
check("cero veces no dice nada", timesCookedLabel(0) === null);
check("un negativo no dice nada", timesCookedLabel(-1) === null);
check(
  "la primera vez se dice con palabras",
  timesCookedLabel(1) === "Primera vez que lo cocináis",
  { real: timesCookedLabel(1) },
);
check(
  "de la segunda en adelante, con el ordinal",
  timesCookedLabel(3) === "Es la 3.ª vez que lo cocináis",
  { real: timesCookedLabel(3) },
);

/** Los segundos de los tiempos detectados en un paso, en orden. */
function tiempos(paso: string): number[] {
  return findStepTimers(paso).map((t) => t.seconds);
}
/** Los rótulos, para los casos en que lo que se mira es cómo se escriben. */
function rotulos(paso: string): string[] {
  return findStepTimers(paso).map((t) => t.label);
}

seccion("Tiempos que SÍ se detectan");
check("minutos en cifras", tiempos("Cuece 35 minutos a fuego bajo")[0] === 2100);
check("abreviado a «min»", tiempos("Hornea 25 min")[0] === 1500);
check("con punto detrás", tiempos("Hornea 25 min. y saca")[0] === 1500);
check("horas", tiempos("Deja reposar 2 horas")[0] === 7200);
check("una «h» suelta", tiempos("Marina 1 h en la nevera")[0] === 3600);
check("segundos", tiempos("Escalda 45 segundos")[0] === 45);
check("decimal con coma", tiempos("Cuece 1,5 horas")[0] === 5400);
/*
  De un intervalo se toma el extremo BAJO: el temporizador sirve para ir a
  MIRAR, no para dar algo por acabado. Quedarse corto te lleva a la olla dos
  minutos antes; pasarse la quema.
*/
check("intervalo con guion: el extremo bajo", tiempos("Sofríe 10-12 minutos")[0] === 600);
check("intervalo con «a»", tiempos("Sofríe 10 a 12 minutos")[0] === 600);
check("intervalo con «entre … y …»", tiempos("Hornea entre 20 y 25 minutos")[0] === 1200);
/*
  «1 h 30 min» son dos coincidencias pegadas. Sin unirlas salían dos chips —«1 h»
  y «30 min»— que juntos son hora y media pero por separado no son nada.
*/
check("«1 h 30 min» es UN tiempo", tiempos("Asa 1 h 30 min")[0] === 5400, {
  real: tiempos("Asa 1 h 30 min"),
});
check("y solo uno", tiempos("Asa 1 h 30 min").length === 1);
check("«1 h y 30 min» también", tiempos("Asa 1 h y 30 min")[0] === 5400);
check("«hora y media»", tiempos("Deja reposar 1 hora y media")[0] === 5400, {
  real: tiempos("Deja reposar 1 hora y media"),
});
/*
  Pero solo si van pegados: dos tiempos que hablan de cosas distintas en la misma
  frase siguen siendo dos.
*/
check(
  "dos tiempos separados por texto NO se funden",
  JSON.stringify(tiempos("Hornea 1 h y sirve tras 30 min de reposo")) ===
    JSON.stringify([3600, 1800]),
  { real: tiempos("Hornea 1 h y sirve tras 30 min de reposo") },
);
check(
  "varios tiempos en un paso salen en orden",
  JSON.stringify(tiempos("Sofríe 5 minutos y luego cuece 35 minutos")) ===
    JSON.stringify([300, 2100]),
);

seccion("Tiempos que NO se deben detectar (lo que de verdad importa)");
check("los grados del horno no son minutos", tiempos("Precalienta a 180 grados").length === 0);
check(
  "un horno a 200 ºC con su tiempo detecta SOLO el tiempo",
  JSON.stringify(tiempos("Hornea a 200 ºC durante 25 minutos")) ===
    JSON.stringify([1500]),
  { real: tiempos("Hornea a 200 ºC durante 25 minutos") },
);
check("los gramos no", tiempos("Añade 200 g de harina").length === 0);
/*
  `m` y `s` a secas se quedan fuera: en una receta son metros y son segundos con
  la misma probabilidad, y equivocarse hacia el falso positivo es lo caro.
*/
check("«2 m» no es un tiempo", tiempos("Corta tiras de 2 m").length === 0);
check("los mililitros tampoco", tiempos("Vierte 200 ml de caldo").length === 0);
check("ni los grados en decimal", tiempos("Baja a 62,5 grados").length === 0);
check("una palabra que empieza por «h»", tiempos("Añade 3 huevos").length === 0);
check("una palabra que empieza por «min»", tiempos("Usa 2 minipimientos").length === 0);
/*
  Los números en palabras se quedan fuera a propósito: distinguir «diez segundos»
  de «diez dientes de ajo» pide entender la frase, no reconocer un patrón.
*/
check("los números en palabras no se adivinan", tiempos("Remueve diez segundos").length === 0);
check("un paso sin tiempos no inventa ninguno", tiempos("Pica la cebolla en dados").length === 0);
check("un paso vacío no revienta", tiempos("").length === 0);

seccion("Topes del temporizador");
check("por debajo del mínimo no se ofrece", tiempos("Remueve 5 segundos").length === 0);
check("justo en el mínimo sí", tiempos("Remueve 10 segundos")[0] === 10);
/*
  Ocho horas de reposo no es un temporizador: la cuenta atrás vive en una pestaña
  del navegador y prometería un despertador que no va a sonar.
*/
check("un reposo de toda la noche no se ofrece", tiempos("Deja en salmuera 8 horas").length === 0);
check("seis horas es el último que entra", tiempos("Guisa 6 horas")[0] === 21600);
check(
  "no salen más chips que el tope",
  findStepTimers("15 min, 20 min, 25 min, 30 min y 35 min").length ===
    MAX_TIMERS_PER_STEP,
);
check(
  "un tiempo repetido no da dos chips iguales",
  tiempos("Reposa 5 minutos, remueve y reposa otros 5 minutos").length === 1,
);

seccion("Cómo se escriben");
check("segundos", timerLabel(45) === "45 s");
check("minutos justos", timerLabel(2100) === "35 min");
check("una hora en punto no dice «60 min»", timerLabel(3600) === "1 h");
check("hora y algo", timerLabel(5400) === "1 h 30 min");
check("el rótulo del chip sale del mismo sitio", rotulos("Asa 1 h 30 min")[0] === "1 h 30 min");
// Auditoría del 23-sep-2026: tres lecturas que salían mal.
check(
  "«90 segundos» dice lo que cuenta (no un «2 min» que cuenta 1:30)",
  rotulos("Deja reposar 90 segundos")[0] === "1 min 30 s",
  { real: rotulos("Deja reposar 90 segundos") },
);
check(
  "«3 o 4 minutos» es un intervalo: el extremo bajo",
  tiempos("Cuece 3 o 4 minutos")[0] === 180,
  { real: tiempos("Cuece 3 o 4 minutos") },
);
check("y «5 ó 6» también", tiempos("Saltea 5 ó 6 minutos")[0] === 300);
check(
  "«y media» solo suma detrás de horas (no «10 minutos y media hora» → 11 min)",
  tiempos("Hornea 10 minutos y media hora más")[0] === 600,
  { real: tiempos("Hornea 10 minutos y media hora más") },
);
check("«1 hora y media» sigue siendo hora y media", tiempos("Guisa 1 hora y media")[0] === 5400);

seccion("La cuenta atrás");
check("mm:ss", formatCountdown(95_000) === "01:35", { real: formatCountdown(95_000) });
check("con horas cambia de formato", formatCountdown(3_725_000) === "1:02:05", {
  real: formatCountdown(3_725_000),
});
check("cero es 00:00", formatCountdown(0) === "00:00");
check("en negativo no cuenta hacia atrás", formatCountdown(-5000) === "00:00");
/*
  Redondeo hacia ARRIBA, como un reloj de cocina: recién arrancado un
  temporizador de 35 min tiene que leerse «35:00» y no «34:59», y la cuenta llega
  a 00:00 justo cuando suena, no un segundo antes.
*/
check("recién arrancado se lee entero", formatCountdown(2_100_000) === "35:00");
check("un resto de segundo todavía se ve", formatCountdown(1) === "00:01");

console.log(
  fallos === 0
    ? "\nModo cocinado: todo correcto.\n"
    : `\nModo cocinado: ${fallos} fallo(s).\n`,
);
process.exit(fallos === 0 ? 0 : 1);
