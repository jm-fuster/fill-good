import type { LocationType, UnitType } from "@/lib/supabase/types";

/**
 * Elección de a qué productos se pregunta en el repaso semanal de despensa, y en
 * qué orden. Puro y sin I/O a propósito (lo fija `npm run check:repaso`): quien
 * reúne las filas es `getPantryReviewCandidates`, y quien las pinta es el modal.
 *
 * El repaso existe porque el inventario se desactualiza SOLO: fuera del stepper y
 * del descuento al cocinar, nada apunta el consumo del día a día. En vez de
 * pedirle a la gente que apunte cada yogur —que no lo va a hacer—, se le pregunta
 * una vez por semana por un puñado de productos y se contesta de un toque.
 *
 * De ahí la restricción que gobierna todo el módulo: **el hueco es pequeño y
 * caro**. Se interrumpe al usuario una vez por semana, con sitio para ocho
 * preguntas, así que cada hueco gastado en algo que la app ya sabe (o que acabas
 * de contar a mano) es una pregunta que no se le hace a lo que de verdad está
 * mal. Casi todo lo que hay aquí es esa aritmética.
 */

/** Tope de preguntas por repaso: lo que cabe en un minuto a un toque cada una. */
export const MAX_REVIEW_ITEMS = 8;

/**
 * Por debajo de esto no se ofrece repaso. Interrumpir para preguntar por dos
 * productos cuesta más atención de la que devuelve, y además entrena a cerrar la
 * tarjeta sin leerla — que es como se pierde el hueco para siempre.
 */
export const MIN_REVIEW_ITEMS = 3;

/**
 * Días que un número recién tocado se da por bueno. El stepper de anteayer es
 * mejor prueba que la memoria de quien contesta, así que preguntar por eso es
 * gastar un hueco para confirmar lo que ya sabemos.
 */
export const MOVED_RECENTLY_DAYS = 3;

/**
 * Tope de productos de la misma categoría. No es una regla de datos, es de
 * atención: un repaso que pregunta por ocho lácteos parece un formulario, y ocho
 * cosas de sitios distintos parece un paseo por la casa. Solo cambia a quién le
 * toca antes; no encoge el repaso (ver `pickPantryReview`).
 */
export const MAX_PER_CATEGORY = 3;

/**
 * Cuánto pesa cada ubicación en la probabilidad de que el número esté mal. La
 * nevera se vacía sola (lo fresco se consume y se estropea), el congelador casi
 * no se mueve y a la despensa se le presupone el término medio. Es la única
 * heurística del módulo que habla de comida y no de fechas.
 */
const LOCATION_DRIFT: Record<LocationType, number> = {
  fridge: 1.6,
  pantry: 1,
  other: 1,
  freezer: 0.6,
};

/** Lo que el repaso necesita saber de una fila del inventario. */
export type PantryReviewItem = {
  /** `inventory_items.id`: se pregunta por la FILA, no por el producto. */
  id: string;
  productId: string;
  name: string;
  quantity: number;
  unit: UnitType;
  location: LocationType;
  /** Para el tope por categoría; null = sin clasificar. */
  categoryId: string | null;
  /** Última respuesta del repaso (instante ISO), null si nunca se contestó. */
  reviewedAt: string | null;
  /** Último cambio de la fila (instante ISO), lo mantiene el trigger. */
  updatedAt: string;
  /** Veces que el hogar lo ha comprado (`products.purchase_count`). */
  purchaseCount: number;
  /** El usuario le puso mínimo: pidió que se le avisara de este producto. */
  hasMinimum: boolean;
};

/**
 * Última prueba de que el número de la fila era cierto, como instante en ms.
 *
 * Son las dos fechas y no una: `reviewedAt` es «una persona miró la despensa y lo
 * confirmó» y `updatedAt` es «la fila cambió», también cuando la cambió un ticket
 * o el descuento al cocinar. Las dos valen igual como prueba, así que cuenta la
 * más reciente. Mirar solo `reviewedAt` haría preguntar por lo que acabas de
 * contar con el stepper; mirar solo `updatedAt` dejaría el efecto de la respuesta
 * «queda» —no volver a preguntar— colgando de un trigger de Postgres, que es una
 * dependencia invisible desde este archivo.
 */
function lastKnownMs(item: PantryReviewItem): number {
  const updated = Date.parse(item.updatedAt);
  const reviewed = item.reviewedAt === null ? NaN : Date.parse(item.reviewedAt);
  // Una fecha ilegible no debe dar por fresco lo que no lo está: si las dos
  // fallan, queda un 0 (época) y la fila sale como muy vieja, que es el lado
  // seguro del error — preguntar de más molesta, callar de menos miente.
  const a = Number.isNaN(updated) ? 0 : updated;
  const b = Number.isNaN(reviewed) ? 0 : reviewed;
  return Math.max(a, b);
}

/** Días transcurridos (con decimales) entre dos instantes. */
function daysSince(ms: number, nowMs: number): number {
  return (nowMs - ms) / 86_400_000;
}

/**
 * Cuántas papeletas tiene esta fila de estar equivocada. Sin unidades: solo
 * ordena. El término dominante son los días sin prueba, y el resto son
 * correcciones sobre eso.
 */
function driftScore(item: PantryReviewItem, nowMs: number): number {
  const stale = Math.max(0, daysSince(lastKnownMs(item), nowMs));
  let score = stale * LOCATION_DRIFT[item.location];
  // Quien puso un mínimo pidió explícitamente que se le avisara de este
  // producto: es la única señal de interés que escribe el propio usuario, y vale
  // más que cualquier cosa que la app deduzca.
  if (item.hasMinimum) score += 6;
  // Lo que se compra a menudo se gasta a menudo. Con tope, porque a partir de
  // unas cuantas compras ya es "habitual" y seguir sumando aplastaría los días
  // sin mirar, que es lo que de verdad manda.
  score += Math.min(item.purchaseCount, 10) * 0.8;
  return score;
}

/**
 * Elige por qué filas se pregunta en este repaso, de más sospechosa a menos.
 * Devuelve la lista vacía cuando no merece la pena interrumpir.
 *
 * `nowMs` entra por parámetro y no se lee del reloj aquí para que la función sea
 * pura y comprobable. Ojo: son INSTANTES, no fechas del calendario, así que aquí
 * no interviene `lib/dates` ni la zona de España (ver AGENTS.md).
 */
export function pickPantryReview<T extends PantryReviewItem>(
  items: T[],
  nowMs: number,
): T[] {
  const candidates = items.filter((item) => {
    // De lo que está a cero la app ya sabe la respuesta, y además ya lo cuenta
    // como agotado en las sugerencias de la lista. Preguntarlo gastaría un hueco
    // para que el usuario nos confirme algo que le estamos enseñando nosotros.
    if (!(item.quantity > 0)) return false;
    // Recién tocado: el número es de fiar, no hace falta preguntar.
    if (daysSince(lastKnownMs(item), nowMs) < MOVED_RECENTLY_DAYS) return false;
    return true;
  });

  const ordered = candidates
    .map((item) => ({ item, score: driftScore(item, nowMs) }))
    // El desempate por nombre no es cosmético: la lista se ve, se cierra y se
    // vuelve a abrir, y dos órdenes distintos para los mismos datos parecen un
    // fallo. Con `sort` inestable entre iguales, hace falta un criterio total.
    .sort(
      (a, b) =>
        b.score - a.score || a.item.name.localeCompare(b.item.name, "es"),
    )
    .map((entry) => entry.item);

  // Tope por categoría en dos vueltas: primero lo que cabe respetándolo y luego
  // se rellena con los apartados. Así el tope solo decide a QUIÉN le toca antes
  // y nunca deja el repaso a medias — un repaso de tres preguntas porque la
  // despensa entera es de la misma categoría sería peor que uno de ocho.
  const perCategory = new Map<string, number>();
  const picked: T[] = [];
  const overflow: T[] = [];
  for (const item of ordered) {
    if (picked.length >= MAX_REVIEW_ITEMS) break;
    const key = item.categoryId ?? "";
    const used = perCategory.get(key) ?? 0;
    // Sin categoría no hay grupo que limitar: "sin clasificar" no es un sitio de
    // la casa, es la ausencia del dato.
    if (item.categoryId !== null && used >= MAX_PER_CATEGORY) {
      overflow.push(item);
      continue;
    }
    perCategory.set(key, used + 1);
    picked.push(item);
  }
  for (const item of overflow) {
    if (picked.length >= MAX_REVIEW_ITEMS) break;
    picked.push(item);
  }

  return picked.length >= MIN_REVIEW_ITEMS ? picked : [];
}

/**
 * Cuánto tiempo como máximo puede el repaso de despensa ceder el sitio al de
 * platos antes de tomar su turno aunque coincidan.
 */
export const YIELD_MAX_DAYS = 14;

/**
 * Si el repaso de despensa debe apartarse porque hay platos pasados sin resolver.
 *
 * Existe porque la cesión **tiene que estar acotada**, y no es obvio: la versión
 * sin tope parecía razonable —dos tarjetas apiladas encima del `<h1>` son ruido,
 * y el repaso de platos caduca antes, así que ceda la despensa— y con datos
 * reales resultó ser una cesión PERMANENTE. Los tres hogares con más despensa
 * (126, 52 y 7 filas, entre 6 y 95 productos sin mirar) arrastraban 11, 3 y 8
 * platos sin resolver, y esa cola solo se vacía si alguien la contesta: es decir,
 * justo lo que la feature del repaso de platos da por hecho que nadie hace. El
 * resultado es que la despensa quedaba callada para siempre en las casas que más
 * la necesitan, que son las que más productos tienen.
 *
 * El tope convierte «cede» en «cede su turno», no en «se calla». Pasadas dos
 * semanas sin haber podido repasar, la despensa sale igual: dos tarjetas una vez
 * cada dos semanas es un precio pequeño al lado de no preguntar nunca.
 *
 * Sin repasos previos se mide desde que existe el hogar: una casa recién creada
 * cede sin más (no lleva nada acumulado), y una de hace meses que nunca ha podido
 * repasar es exactamente el caso que hay que rescatar.
 */
export function shouldYieldToDishes(opts: {
  /** Último repaso del hogar, o null si nunca. */
  reviewedAt: string | null;
  /** Cuándo se creó el hogar, referencia cuando no hay repasos. */
  householdSince: string | null;
  nowMs: number;
}): boolean {
  const referencia = opts.reviewedAt ?? opts.householdSince;
  // Sin referencia o con una fecha ilegible se cede, que es el lado prudente:
  // como mucho se aplaza una pregunta, mientras que al revés se apilarían dos
  // tarjetas sin haber demostrado que hiciera falta.
  if (referencia === null) return true;
  const desde = Date.parse(referencia);
  if (Number.isNaN(desde)) return true;
  return daysSince(desde, opts.nowMs) < YIELD_MAX_DAYS;
}

/** Respuesta del usuario a una fila del repaso. */
export type PantryAnswer = "have" | "low" | "out";

/**
 * Nueva cantidad de la fila según la respuesta, o `null` para no tocarla.
 *
 * Las tres contestan a la misma pregunta («¿te queda?») pero solo dos tocan la
 * cantidad, y la que no la toca es precisamente la más común: «queda» tiene que
 * poder contestarse sin que la app se invente un número. Su efecto es sellar
 * `reviewed_at`, que es lo que impide que la pregunta vuelva la semana siguiente.
 *
 * «Poco» tampoco cambia la cantidad, y es deliberado: el usuario está diciendo
 * «cómpralo», no «tengo 1,5». Inventar una cifra para representar «poco» metería
 * en el inventario un número que nadie ha contado y que luego se restaría al
 * cocinar. Lo que sí hace «poco» es mandar el producto a la lista de la compra,
 * igual que «se acabó» — la diferencia entre las dos es solo si queda algo en
 * casa mientras tanto.
 */
export function answerToQuantity(answer: PantryAnswer): number | null {
  return answer === "out" ? 0 : null;
}

/** Si esta respuesta convierte al producto en candidato a la lista. */
export function answerWantsRestock(answer: PantryAnswer): boolean {
  return answer === "low" || answer === "out";
}
