import "server-only";

import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";

import { currentMonthInSpain, dayOfMonthInSpain } from "@/lib/dates";
import {
  getMonthlySpending,
  type MonthlySpending,
} from "@/features/prices/spending";
import {
  getMonthlyTripStats,
  type MonthlyTripStats,
} from "@/features/shopping-list/queries";

/**
 * Marcador del hogar en el mes EN CURSO, para /perfil.
 *
 * No calcula nada por su cuenta: compone las mismas consultas que alimentan
 * /precios y /resumen. Ese es el punto de que exista — la hucha y las compras
 * perfectas tienen que dar la misma cifra se miren donde se miren, y la
 * credibilidad de esos números es lo que sostiene toda la gamificación.
 */

/** Días del mes durante los que el resumen recién cerrado se marca como novedad. */
const WRAPPED_IS_NEW_UNTIL_DAY = 7;

export type ProfileOverview = {
  spending: MonthlySpending;
  trips: MonthlyTripStats;
  /** false = el mes no tiene ni una compra confirmada. */
  hasData: boolean;
  /**
   * Hay hucha que enseñar. Sin descuentos ni desvío de precio el saldo sería un
   * 0,00 € sin contexto, y un cero pelado se lee como que la app no funciona.
   */
  hasSavings: boolean;
  /** Mes anterior en "yyyy-MM", para enlazar a su resumen. */
  prevMonth: string;
  /** Su nombre en minúscula ("junio"), para la etiqueta de la fila. */
  prevMonthLabel: string;
  /**
   * El resumen del mes anterior existe y todavía es una novedad. Sin estado de
   * "visto" en base de datos: se marca durante los primeros días del mes, que es
   * justo la ventana en la que llega el aviso del día 1.
   */
  wrappedIsNew: boolean;
};

export async function getProfileOverview(): Promise<ProfileOverview | null> {
  // El mes se fija aquí (y no se deja al valor por defecto de cada consulta)
  // para poder lanzar las dos en paralelo con la misma referencia temporal. Es
  // el mes ESPAÑOL: con el del proceso (UTC), durante las dos primeras horas
  // del día 1 la hucha y el objetivo seguían siendo los del mes que acababa de
  // cerrarse, y la fila de abajo ofrecía como «resumen» el del mes anterior a
  // ese.
  const month = currentMonthInSpain();
  const [spending, trips] = await Promise.all([
    getMonthlySpending(month),
    getMonthlyTripStats(month),
  ]);
  if (!spending) return null;

  return {
    spending,
    trips,
    hasData: spending.receiptCount > 0,
    hasSavings: spending.discountTotal > 0 || spending.savingsByPrice !== 0,
    prevMonth: spending.prevMonth,
    prevMonthLabel: format(parseISO(`${spending.prevMonth}-01`), "LLLL", {
      locale: es,
    }),
    wrappedIsNew:
      spending.prevTotal > 0 &&
      dayOfMonthInSpain() <= WRAPPED_IS_NEW_UNTIL_DAY,
  };
}
