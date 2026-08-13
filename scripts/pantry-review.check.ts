/**
 * Comprobaciones del repaso semanal de despensa. Lo ejecuta
 * `npm run check:repaso` (ver `scripts/check-pantry-review.mjs`, que lo empaqueta
 * con esbuild porque esto es TypeScript y tira del alias `@/`).
 *
 * Prueba `src/features/inventory/pantry-review.ts`, que decide POR QUÉ PRODUCTOS
 * se pregunta cada semana. Existe porque ahí todo son decisiones de atención, no
 * de tipos: el hueco es de ocho preguntas una vez por semana, y cada regla del
 * módulo está para no gastarlo en algo que la app ya sabe. Quitar cualquiera de
 * esos filtros deja los tipos intactos (una lista de filas sigue siendo una lista
 * de filas), el lint callado y el build verde — lo que cambia es que el repaso
 * empieza a preguntar por lo que acabas de contar a mano, y un repaso que hace
 * perder el tiempo se apaga a la segunda semana.
 *
 * El caso que justifica la mitad del archivo: **contestar «queda» tiene que
 * sacar la fila del repaso siguiente**. Es la respuesta más común y la única que
 * no cambia ningún valor de la fila, así que es fácil de tratar como un no-op —y
 * entonces el repaso vuelve a preguntar exactamente lo mismo cada semana, que es
 * el peor fallo posible aquí: castiga justo a quien contesta.
 *
 * Lo que NO se prueba: la consulta que reúne las filas
 * (`getPantryReviewCandidates`, contra la base), la escritura
 * (`savePantryReviewAction`) ni el pintado. Aquí solo se fija la elección.
 */
import {
  answerToQuantity,
  answerWantsRestock,
  MAX_PER_CATEGORY,
  MAX_REVIEW_ITEMS,
  MIN_REVIEW_ITEMS,
  MOVED_RECENTLY_DAYS,
  pickPantryReview,
  shouldYieldToDishes,
  YIELD_MAX_DAYS,
  type PantryReviewItem,
} from "@/features/inventory/pantry-review";

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

/**
 * Reloj fijo. Como en el resto de comprobaciones del repo, la fecha va clavada:
 * el módulo puntúa por días transcurridos, y con el reloj de hoy los casos
 * dejarían de medir lo mismo mañana.
 */
const AHORA = Date.parse("2026-08-13T10:00:00.000Z");

/** Instante ISO de hace N días. */
function hace(dias: number): string {
  return new Date(AHORA - dias * 86_400_000).toISOString();
}

let contador = 0;
function fila(over: Partial<PantryReviewItem> = {}): PantryReviewItem {
  contador += 1;
  return {
    id: `i${contador}`,
    productId: `p${contador}`,
    name: `Producto ${String(contador).padStart(2, "0")}`,
    quantity: 2,
    unit: "ud",
    location: "pantry",
    categoryId: null,
    reviewedAt: null,
    updatedAt: hace(40),
    purchaseCount: 0,
    hasMinimum: false,
    ...over,
  };
}

/** Rellena hasta pasar el mínimo, para poder probar un caso con una sola fila. */
function conRelleno(...items: PantryReviewItem[]): PantryReviewItem[] {
  const relleno = Array.from({ length: MIN_REVIEW_ITEMS }, () =>
    fila({ updatedAt: hace(30) }),
  );
  return [...items, ...relleno];
}

function ids(items: PantryReviewItem[]): string[] {
  return items.map((i) => i.id);
}

seccion("No se pregunta por lo que la app ya sabe");
{
  const cero = fila({ quantity: 0, updatedAt: hace(90) });
  const elegidos = pickPantryReview(conRelleno(cero), AHORA);
  check(
    "una fila a cero no entra, aunque sea la más vieja de todas",
    !ids(elegidos).includes(cero.id),
    { elegidos: ids(elegidos) },
  );
  const negativa = fila({ quantity: -1, updatedAt: hace(90) });
  check(
    "tampoco una cantidad negativa (dato roto, no pregunta)",
    !ids(pickPantryReview(conRelleno(negativa), AHORA)).includes(negativa.id),
  );
}

seccion("No se pregunta por lo recién tocado");
{
  const ayer = fila({ updatedAt: hace(1) });
  check(
    "movido ayer con el stepper: el número es de fiar",
    !ids(pickPantryReview(conRelleno(ayer), AHORA)).includes(ayer.id),
  );
  const justo = fila({ updatedAt: hace(MOVED_RECENTLY_DAYS + 0.5) });
  check(
    `pasada la ventana de ${MOVED_RECENTLY_DAYS} días sí se pregunta`,
    ids(pickPantryReview(conRelleno(justo), AHORA)).includes(justo.id),
  );
  // Las dos fechas valen igual como prueba de que el número era cierto, así que
  // manda la MÁS RECIENTE. Cada mitad de la regla se rompe por su lado:
  const soloRepasada = fila({ updatedAt: hace(200), reviewedAt: hace(1) });
  check(
    "repasada ayer aunque la fila no se toque desde hace meses",
    !ids(pickPantryReview(conRelleno(soloRepasada), AHORA)).includes(
      soloRepasada.id,
    ),
  );
  const soloMovida = fila({ updatedAt: hace(1), reviewedAt: hace(200) });
  check(
    "movida ayer aunque no se repase desde hace meses",
    !ids(pickPantryReview(conRelleno(soloMovida), AHORA)).includes(
      soloMovida.id,
    ),
  );
}

seccion("Contestar saca la fila del repaso siguiente");
{
  // El caso que justifica la columna `reviewed_at`. «Queda» no cambia la
  // cantidad ni ningún otro valor de la fila: si no se sellara la respuesta, la
  // semana que viene volvería a salir la misma pregunta, y quien contesta saldría
  // peor parado que quien cierra la tarjeta.
  const antes = fila({ updatedAt: hace(120) });
  check(
    "sin contestar, sale (es de las más viejas)",
    ids(pickPantryReview(conRelleno(antes), AHORA)).includes(antes.id),
  );
  const despues: PantryReviewItem = { ...antes, reviewedAt: hace(0) };
  check(
    "tras contestar «queda» —que no toca la cantidad— ya no sale",
    !ids(pickPantryReview(conRelleno(despues), AHORA)).includes(despues.id),
    { quantity: despues.quantity, reviewedAt: despues.reviewedAt },
  );
  check(
    "y «queda» de verdad no cambia la cantidad",
    answerToQuantity("have") === null,
  );
}

seccion("Orden: primero lo que lleva más tiempo sin mirarse");
{
  const vieja = fila({ name: "Vieja", updatedAt: hace(200) });
  const media = fila({ name: "Media", updatedAt: hace(60) });
  const nueva = fila({ name: "Nueva", updatedAt: hace(10) });
  const elegidos = pickPantryReview([nueva, vieja, media], AHORA);
  check(
    "de más vieja a más nueva",
    ids(elegidos).join(",") === [vieja.id, media.id, nueva.id].join(","),
    { orden: elegidos.map((i) => i.name) },
  );
}

seccion("Correcciones sobre los días");
{
  const nevera = fila({ location: "fridge", updatedAt: hace(20) });
  const congelador = fila({ location: "freezer", updatedAt: hace(20) });
  const elegidos = pickPantryReview(conRelleno(nevera, congelador), AHORA);
  check(
    "a igualdad de días, la nevera pregunta antes que el congelador",
    ids(elegidos).indexOf(nevera.id) < ids(elegidos).indexOf(congelador.id),
  );

  const conMinimo = fila({ updatedAt: hace(20), hasMinimum: true });
  const sinMinimo = fila({ updatedAt: hace(20) });
  const elegidos2 = pickPantryReview(conRelleno(conMinimo, sinMinimo), AHORA);
  check(
    "el mínimo que escribió el usuario adelanta a lo demás",
    ids(elegidos2).indexOf(conMinimo.id) < ids(elegidos2).indexOf(sinMinimo.id),
  );

  const habitual = fila({ updatedAt: hace(20), purchaseCount: 30 });
  const raro = fila({ updatedAt: hace(20), purchaseCount: 0 });
  const elegidos3 = pickPantryReview(conRelleno(habitual, raro), AHORA);
  check(
    "lo que se compra a menudo pregunta antes",
    ids(elegidos3).indexOf(habitual.id) < ids(elegidos3).indexOf(raro.id),
  );
  // Con tope: si la habitualidad no se limitara, aplastaría los días sin mirar,
  // que es el término que de verdad manda.
  const habitualReciente = fila({ updatedAt: hace(10), purchaseCount: 500 });
  const olvidada = fila({ updatedAt: hace(300), purchaseCount: 0 });
  const elegidos4 = pickPantryReview(
    conRelleno(habitualReciente, olvidada),
    AHORA,
  );
  check(
    "pero no tanto como para ganar a algo olvidado hace 300 días",
    ids(elegidos4).indexOf(olvidada.id) <
      ids(elegidos4).indexOf(habitualReciente.id),
  );
}

seccion("Tope de preguntas");
{
  const muchas = Array.from({ length: 40 }, (_, n) =>
    fila({ updatedAt: hace(30 + n) }),
  );
  const elegidos = pickPantryReview(muchas, AHORA);
  check(
    `nunca más de ${MAX_REVIEW_ITEMS} preguntas`,
    elegidos.length === MAX_REVIEW_ITEMS,
    { salieron: elegidos.length },
  );
}

seccion("El tope por categoría reordena, no encoge");
{
  // Todo de la misma categoría: el repaso sigue siendo de ocho. Si el tope
  // recortara, una despensa monotemática tendría repasos de tres preguntas.
  const mismaCat = Array.from({ length: 20 }, (_, n) =>
    fila({ categoryId: "lacteos", updatedAt: hace(30 + n) }),
  );
  check(
    "20 productos de la misma categoría siguen dando un repaso completo",
    pickPantryReview(mismaCat, AHORA).length === MAX_REVIEW_ITEMS,
    { salieron: pickPantryReview(mismaCat, AHORA).length },
  );

  // Habiendo de dónde sacar, sí se reparte.
  const cat = (id: string, dias: number) =>
    Array.from({ length: 6 }, (_, n) =>
      fila({ categoryId: id, updatedAt: hace(dias + n) }),
    );
  const elegidos = pickPantryReview(
    [...cat("a", 200), ...cat("b", 100), ...cat("c", 50)],
    AHORA,
  );
  const deA = elegidos.filter((i) => i.categoryId === "a").length;
  check(
    `con alternativas, no más de ${MAX_PER_CATEGORY} de la categoría dominante`,
    deA === MAX_PER_CATEGORY,
    { deA, total: elegidos.length },
  );
  check("y el repaso sigue completo", elegidos.length === MAX_REVIEW_ITEMS, {
    total: elegidos.length,
  });

  // Y el matiz que decide el orden de las dos vueltas: cuando NO hay de dónde
  // sacar, el tope cede antes que dejar el repaso corto. Con dos categorías de
  // seis y tope de tres solo se llenan seis huecos respetándolo, así que los dos
  // últimos salen del sobrante — y salen de la categoría más vieja, que es lo que
  // habría que preguntar de todos modos. Es el caso que alguien "arreglaría"
  // haciendo que el tope recorte, y entonces la despensa de dos categorías
  // tendría repasos de seis preguntas en vez de ocho.
  const dos = pickPantryReview([...cat("a", 200), ...cat("b", 50)], AHORA);
  check(
    "con solo dos categorías el tope cede y el repaso sigue completo",
    dos.length === MAX_REVIEW_ITEMS,
    { total: dos.length },
  );
  check(
    "y lo que se pasa del tope es de la categoría más vieja",
    dos.filter((i) => i.categoryId === "a").length > MAX_PER_CATEGORY,
    { deA: dos.filter((i) => i.categoryId === "a").length },
  );

  // "Sin clasificar" no es un sitio de la casa: es la ausencia del dato, así que
  // no se limita como si fuera un grupo.
  const sinCat = Array.from({ length: 20 }, (_, n) =>
    fila({ categoryId: null, updatedAt: hace(30 + n) }),
  );
  check(
    "los productos sin categoría no se limitan entre sí",
    pickPantryReview(sinCat, AHORA).length === MAX_REVIEW_ITEMS,
  );
}

seccion("Se rinde en vez de interrumpir por dos cosas");
{
  const pocas = Array.from({ length: MIN_REVIEW_ITEMS - 1 }, () =>
    fila({ updatedAt: hace(50) }),
  );
  check(
    `con menos de ${MIN_REVIEW_ITEMS} candidatos no se ofrece repaso`,
    pickPantryReview(pocas, AHORA).length === 0,
  );
  const justas = Array.from({ length: MIN_REVIEW_ITEMS }, () =>
    fila({ updatedAt: hace(50) }),
  );
  check(
    `con ${MIN_REVIEW_ITEMS} sí`,
    pickPantryReview(justas, AHORA).length === MIN_REVIEW_ITEMS,
  );
  check("una despensa vacía no ofrece repaso", pickPantryReview([], AHORA).length === 0);
}

seccion("Mismo dato, mismo orden");
{
  // La lista se ve, se cierra y se vuelve a abrir: dos órdenes distintos para los
  // mismos datos parecen un fallo. Con puntuaciones empatadas y un `sort`
  // inestable, hace falta el desempate total por nombre.
  const base = Array.from({ length: 12 }, () => fila({ updatedAt: hace(30) }));
  const revuelta = [...base].reverse();
  check(
    "el orden no depende de cómo llegaran las filas",
    ids(pickPantryReview(base, AHORA)).join(",") ===
      ids(pickPantryReview(revuelta, AHORA)).join(","),
    {
      a: ids(pickPantryReview(base, AHORA)),
      b: ids(pickPantryReview(revuelta, AHORA)),
    },
  );
}

seccion("Una fecha ilegible cae del lado seguro");
{
  const rota = fila({ updatedAt: "no es una fecha", reviewedAt: null });
  check(
    "se trata como muy vieja (preguntar de más molesta; callar de menos miente)",
    ids(pickPantryReview(conRelleno(rota), AHORA))[0] === rota.id,
    { elegidos: ids(pickPantryReview(conRelleno(rota), AHORA)) },
  );
}

seccion("Ceder el sitio al repaso de platos está ACOTADO");
{
  /*
    El fallo que motivó esta sección, encontrado con datos reales el 13-ago-2026:
    la cesión sin tope no aplazaba la pregunta, la eliminaba. De ocho hogares,
    los tres con más despensa (126, 52 y 7 filas; entre 6 y 95 productos sin
    mirar) arrastraban 11, 3 y 8 platos pasados sin resolver, y esa cola solo se
    vacía si alguien la contesta — que es precisamente lo que la feature del
    repaso de platos asume que nadie hace. O sea que la despensa quedaba callada
    PARA SIEMPRE justo en las casas que más la necesitan.

    Nada de esto lo ve el compilador: `platos.length > 0` y la versión con tope
    devuelven las dos un booleano.
  */
  const nunca = null;
  check(
    "con un repaso reciente, se cede (el de platos caduca antes)",
    shouldYieldToDishes({
      reviewedAt: hace(3),
      householdSince: hace(400),
      nowMs: AHORA,
    }),
  );
  check(
    "un hogar recién creado que nunca ha repasado también cede",
    shouldYieldToDishes({
      reviewedAt: nunca,
      householdSince: hace(2),
      nowMs: AHORA,
    }),
  );
  check(
    `pasados ${YIELD_MAX_DAYS} días sin poder repasar, la despensa toma su turno`,
    !shouldYieldToDishes({
      reviewedAt: hace(YIELD_MAX_DAYS + 1),
      householdSince: hace(400),
      nowMs: AHORA,
    }),
  );
  check(
    "y el caso real: hogar viejo que NUNCA ha repasado no cede más",
    !shouldYieldToDishes({
      reviewedAt: nunca,
      householdSince: hace(400),
      nowMs: AHORA,
    }),
  );
  // Sin referencia o con fecha ilegible se cede: aplazar una pregunta es más
  // barato que apilar dos tarjetas sin haber demostrado que hiciera falta.
  check(
    "sin fecha de creación se cede",
    shouldYieldToDishes({
      reviewedAt: nunca,
      householdSince: null,
      nowMs: AHORA,
    }),
  );
  check(
    "con una fecha ilegible se cede",
    shouldYieldToDishes({
      reviewedAt: "vaya fecha",
      householdSince: "tampoco",
      nowMs: AHORA,
    }),
  );
}

seccion("Qué escribe cada respuesta");
{
  check("«se acabó» pone la cantidad a cero", answerToQuantity("out") === 0);
  check("«queda» no toca la cantidad", answerToQuantity("have") === null);
  // «Poco» dice «cómpralo», no «tengo 1,5». Inventar una cifra para representar
  // «poco» metería en el inventario un número que nadie ha contado, y del que
  // luego se restaría al cocinar.
  check("«poco» tampoco la toca", answerToQuantity("low") === null);

  check("«se acabó» va a la lista", answerWantsRestock("out"));
  check("«poco» también va a la lista", answerWantsRestock("low"));
  check("«queda» no va a la lista", !answerWantsRestock("have"));
}

console.log(
  fallos === 0
    ? "\nRepaso de despensa: todo correcto.\n"
    : `\nRepaso de despensa: ${fallos} fallo(s).\n`,
);
process.exit(fallos === 0 ? 0 : 1);
