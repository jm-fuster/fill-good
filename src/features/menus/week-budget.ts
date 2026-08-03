/**
 * Presupuesto de la semana para el menú (PURO, sin I/O, sin IA).
 *
 * El hogar ya fija un objetivo de gasto MENSUAL (`households.monthly_budget`,
 * el que pinta `BudgetBar` en /precios). De ahí sale el objetivo semanal, y
 * contra él se contrasta el coste estimado del menú (M7).
 *
 * LA REGLA QUE DEFINE ESTE MÓDULO: solo se AVISA de que se pasa; nunca se dice
 * que se va bien. No es prudencia decorativa, son dos magnitudes distintas:
 *
 *   · El presupuesto mensual cubre TODA la compra: comida, sí, pero también
 *     detergente, papel de cocina, pañales y lo que caiga.
 *   · El coste del menú son solo los ingredientes de los platos planificados.
 *
 * Así que un menú por DEBAJO del objetivo no demuestra nada —queda por comprar
 * todo lo demás— y decir «vas bien» sería una promesa que la app no puede
 * cumplir. Uno por ENCIMA sí es concluyente: si solo la comida planificada ya se
 * pasa, el mes se pasa seguro, porque el resto de la compra únicamente puede
 * sumar. Por eso el aviso es de una sola dirección.
 *
 * El mismo razonamiento vale para los platos SIN PRECIO. El total de M7 es un
 * SUELO (`complete: false` = hay ingredientes sin precio conocido), y un suelo
 * que ya se pasa del objetivo sigue siendo una respuesta firme: lo que falta por
 * contar solo puede empeorarlo. Por eso un total parcial también avisa, y lo
 * dice.
 */
import { roundCents } from "@/lib/money";

/**
 * Semanas que trae un mes de media (52 semanas ÷ 12 meses = 4,33). Dividir entre
 * 4 daría un objetivo semanal más alto que el mensual repartido de verdad, y el
 * aviso dejaría pasar semanas que sí se pasan.
 */
const WEEKS_PER_MONTH = 52 / 12;

/**
 * Cuánto multiplicar el coste de una receta para saber qué costará en ESTE
 * hogar. Solo escala HACIA ARRIBA, y la asimetría es deliberada:
 *
 *   · Si sois más de los que da la receta, hay que cocinar más y se compra más:
 *     una receta para 2 en una casa de 4 cuesta el doble, sin discusión. Sin
 *     esto, una casa de cuatro veía TODAS sus semanas a mitad de precio —las 43
 *     recetas del pack inicial vienen escritas para 2— y el aviso de presupuesto
 *     no saltaba nunca. Un aviso que no salta se lee como que vas bien.
 *
 *   · Si sois menos, NO se divide. Una receta para 4 en una casa de 2 no se
 *     compra a la mitad: se hace la olla entera y se come dos días. La app no
 *     tiene modelo de sobras, así que dividir prometería un ahorro que no ocurre
 *     — y como el aviso es de una sola dirección, quedarse corto significa
 *     callarse ante una semana que sí se pasa.
 */
export function servingsFactor(
  recipeServings: number,
  householdServings: number,
): number {
  if (!(recipeServings > 0) || !(householdServings > 0)) return 1;
  return Math.max(1, householdServings / recipeServings);
}

/** Objetivo semanal derivado del mensual; null si el hogar no ha fijado ninguno. */
export function weeklyBudgetTarget(monthlyBudget: number | null): number | null {
  if (monthlyBudget === null || !Number.isFinite(monthlyBudget)) return null;
  if (monthlyBudget <= 0) return null;
  return roundCents(monthlyBudget / WEEKS_PER_MONTH);
}

/** Coste estimado de la semana tal como lo calcula /menus (M7). */
export type WeekCost = {
  total: number;
  /** false = algún plato no tiene precio: `total` es un suelo, no el importe. */
  complete: boolean;
};

export type WeekBudgetWarning = {
  /** Objetivo semanal contra el que se ha comparado. */
  target: number;
  /** Coste estimado de la semana. */
  total: number;
  /** Cuánto se pasa. Siempre > 0: sin exceso no hay aviso que dar. */
  overBy: number;
  /** El exceso es un MÍNIMO porque hay platos sin precio. */
  partial: boolean;
};

/**
 * Devuelve el aviso si el menú de la semana ya se pasa del objetivo, o null si
 * no hay nada que avisar: sin presupuesto fijado, sin ningún plato con precio o
 * —lo más frecuente— porque el coste cabe dentro y de eso no se dice nada.
 */
export function assessWeekBudget(
  weekCost: WeekCost | null,
  monthlyBudget: number | null,
): WeekBudgetWarning | null {
  const target = weeklyBudgetTarget(monthlyBudget);
  if (target === null || weekCost === null) return null;

  const overBy = roundCents(weekCost.total - target);
  if (overBy <= 0) return null;

  return {
    target,
    total: roundCents(weekCost.total),
    overBy,
    partial: !weekCost.complete,
  };
}
