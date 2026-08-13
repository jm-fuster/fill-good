import { cookies } from "next/headers";

import { getWeekStart, nowMs, todayLocalISO } from "@/lib/dates";
import { getPendingCheckinEntries } from "@/features/menus/queries";
import { shouldYieldToDishes } from "../pantry-review";
import {
  getPantryReviewCandidates,
  getPantryReviewPrefs,
  type PantryReviewEntry,
} from "../queries";
import { PantryReviewCard } from "./pantry-review-card";

/**
 * Decide en el SERVIDOR si toca preguntar por la despensa. Se monta en el shell,
 * así que se evalúa en todas las páginas: por eso lo barato va primero (las
 * cookies no cuestan consultas) y las queries solo se hacen si de verdad puede
 * haber tarjeta.
 *
 * Seis condiciones, todas necesarias:
 *   1. El hogar tiene el repaso activo (`pantry_review_enabled`, true sin fila).
 *   2. Nadie de la casa ha repasado ya esta semana.
 *   3. La X de hoy no está pulsada en este dispositivo (snooze diario).
 *   4. No se ha silenciado esta semana en este dispositivo.
 *   5. No hay un repaso de platos pendiente (ver abajo).
 *   6. Hay suficientes candidatos (lo decide `pickPantryReview`).
 *
 * Si algo falla, devuelve null: una tarjeta opcional no puede tumbar el shell.
 */
async function loadPantryReview(): Promise<PantryReviewEntry[] | null> {
  try {
    const cookieStore = await cookies();
    if (cookieStore.get("pantry_review_snooze")?.value === todayLocalISO()) {
      return null;
    }
    if (
      cookieStore.get("pantry_review_silenced_week")?.value === getWeekStart()
    ) {
      return null;
    }

    const prefs = await getPantryReviewPrefs();
    if (!prefs.enabled) return null;
    /*
      La cadencia semanal vive en la base y no en una cookie porque el repaso es
      trabajo del HOGAR: si tu pareja repasó el lunes, a ti no hay que
      preguntarte. Y hace falta explícitamente, aunque contestar ya saque esas
      filas del cálculo: en una despensa de noventa productos, contestar por
      ocho deja ochenta y dos «sin repasar» y la tarjeta volvería el mismo día.
      Se compara la SEMANA (lunes español), no las 24 horas: así el repaso cae
      siempre en un día natural de la semana en vez de ir corriéndose.
    */
    if (
      prefs.reviewedAt !== null &&
      getWeekStart(new Date(prefs.reviewedAt)) === getWeekStart()
    ) {
      return null;
    }

    /*
      Dos tarjetas apiladas encima del <h1> no son dos recordatorios, son ruido:
      la segunda no se lee. Cuando las dos podrían salir cede esta, porque el
      repaso de platos pregunta por los últimos siete días y su respuesta se
      pierde con el tiempo (nadie recuerda si cenó eso el martes pasado),
      mientras que la despensa sigue ahí mañana.

      Pero la cesión va ACOTADA (`shouldYieldToDishes`), y eso no es un detalle:
      sin tope, la cola de platos sin resolver —que solo se vacía si alguien la
      contesta— callaba la despensa para siempre justo en las casas con más
      productos. El porqué completo, con los números reales que lo destaparon,
      está en `pantry-review.ts`.

      La consulta extra solo se paga después de las puertas baratas, o sea como
      mucho una vez por semana y hogar.
    */
    const platos = await getPendingCheckinEntries();
    if (
      platos.length > 0 &&
      shouldYieldToDishes({
        reviewedAt: prefs.reviewedAt,
        householdSince: prefs.createdAt,
        nowMs: nowMs(),
      })
    ) {
      return null;
    }

    const items = await getPantryReviewCandidates();
    if (items.length === 0) return null;

    return items;
  } catch {
    return null;
  }
}

export async function PantryReviewBanner() {
  const items = await loadPantryReview();
  if (!items) return null;
  return <PantryReviewCard items={items} />;
}
