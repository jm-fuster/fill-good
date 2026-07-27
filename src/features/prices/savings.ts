import { roundCents } from "@/lib/money";
import { baseUnitFactor, unitFamily } from "@/lib/units";
import type { UnitType } from "@/lib/supabase/types";

/**
 * Hucha del hogar (G1, fase 1): cuánto ha ahorrado —o de más ha pagado— el hogar
 * en un ticket, comparando cada línea con lo que ese mismo producto venía
 * costándole en las últimas semanas. Módulo neutro (sin I/O) como
 * `chain-comparison.ts`, para poder reutilizarlo y testearlo.
 *
 * Reglas que sostienen la credibilidad del número (y que son el diseño, no un
 * detalle de implementación):
 *
 *  · SALDO NETO Y CON SIGNO. Si has pagado más de lo habitual, la cifra baja. Una
 *    hucha que solo sube es una hucha que nadie se cree, y en cuanto el usuario
 *    desconfía del número deja de creerse la pantalla entera.
 *  · VENTANA MÓVIL, no histórico completo. Con inflación, tu media histórica
 *    siempre queda por debajo del precio de hoy: el saldo tendería a negativo
 *    solo por el paso del tiempo y la hucha acabaría midiendo el IPC en vez de
 *    tus decisiones. Comparar contra las últimas semanas es neutral a inflación.
 *  · MÍNIMO DE MUESTRA. Con una sola compra previa, cualquier oferta o cambio de
 *    formato inventa un "ahorro" que no existe. Mismo criterio anti-muestra-de-1
 *    que `computeChainComparison`.
 *  · SOLO DENTRO DE LA MISMA FAMILIA DE UNIDAD. €/kg y €/ud no son comparables;
 *    ud↔peso jamás se convierte (ver `unitFamily`).
 */

/** Días hacia atrás que forman la referencia de precio de cada producto. */
export const SAVINGS_WINDOW_DAYS = 90;

/** Compras previas mínimas (en la ventana) para que un producto sea comparable. */
export const MIN_HISTORY_PURCHASES = 2;

export type PricedLine = {
  productId: string;
  /** Importe de la línea; null = la IA no lo extrajo → línea no valorable. */
  totalPrice: number | null;
  quantity: number;
  unit: UnitType;
  /** Nombre que ve el usuario; solo se usa para el copy de la celebración. */
  label?: string;
};

export type SavingsHighlight = {
  label: string;
  amount: number;
};

export type ReceiptSavings = {
  /**
   * Saldo neto en € del ticket, redondeado a céntimos. Positivo = has pagado
   * menos que tu referencia reciente; negativo = has pagado más.
   */
  net: number;
  /** Líneas que se han podido comparar (las demás no suman ni restan). */
  comparedLines: number;
  /** Producto donde más se ha ahorrado, si alguno aporta en positivo. */
  best: SavingsHighlight | null;
};

export const NO_SAVINGS: ReceiptSavings = {
  net: 0,
  comparedLines: 0,
  best: null,
};

/**
 * Lo que aporta un ticket a la hucha, ya sumado: el ahorro por precio (con signo)
 * más los descuentos impresos en el ticket (que siempre son a favor). Es la forma
 * en que el saldo viaja del servidor a la pantalla de celebración.
 */
export type ReceiptSavingsSummary = {
  /** Ahorro por precio frente a la referencia reciente; puede ser negativo. */
  byPrice: number;
  /** Descuentos del propio ticket (`receipts.discount_total`); nunca negativo. */
  discounts: number;
  /** byPrice + discounts. Lo que entra (o sale) de la hucha. */
  total: number;
  best: SavingsHighlight | null;
  comparedLines: number;
};

export function summarizeReceiptSavings(
  savings: ReceiptSavings,
  discounts: number,
): ReceiptSavingsSummary {
  const byPrice = roundCents(savings.net);
  const safeDiscounts = roundCents(Math.max(0, discounts));
  return {
    byPrice,
    discounts: safeDiscounts,
    total: roundCents(byPrice + safeDiscounts),
    best: savings.best,
    comparedLines: savings.comparedLines,
  };
}

/**
 * Precio por unidad base (g / ml / ud) de una línea. Normalizar a la unidad base
 * es lo que permite comparar una compra en kg con otra en g del mismo producto.
 */
function pricePerBaseUnit(line: PricedLine): number | null {
  if (line.totalPrice === null) return null;
  const qty = Number(line.quantity);
  const price = Number(line.totalPrice);
  if (!(qty > 0) || !(price > 0)) return null;
  return price / (qty * baseUnitFactor(line.unit));
}

/** Cantidad de la línea expresada en unidades base. */
function quantityInBaseUnits(line: PricedLine): number {
  return Number(line.quantity) * baseUnitFactor(line.unit);
}

/**
 * Saldo de ahorro de un ticket.
 *
 * @param paid    Líneas del ticket que se está confirmando.
 * @param history Compras previas de esos mismos productos DENTRO de la ventana y
 *                EXCLUYENDO el ticket actual (si se incluyera, cada compra
 *                arrastraría su propio precio hacia la referencia y el saldo
 *                tendería artificialmente a cero).
 */
export function computeReceiptSavings(
  paid: PricedLine[],
  history: PricedLine[],
): ReceiptSavings {
  // Referencia por producto y familia de unidad: precio medio por unidad base.
  // La clave incluye la familia porque un producto puede tener líneas en ud y en
  // kg (p. ej. fruta suelta vs. malla) y mezclarlas daría un precio sin sentido.
  const refKey = (productId: string, unit: UnitType) =>
    `${productId}::${unitFamily(unit)}`;

  const agg = new Map<string, { sum: number; count: number }>();
  for (const h of history) {
    const perBase = pricePerBaseUnit(h);
    if (perBase === null) continue;
    const key = refKey(h.productId, h.unit);
    const a = agg.get(key) ?? { sum: 0, count: 0 };
    a.sum += perBase;
    a.count += 1;
    agg.set(key, a);
  }

  let net = 0;
  let comparedLines = 0;
  let best: SavingsHighlight | null = null;

  for (const line of paid) {
    const perBase = pricePerBaseUnit(line);
    if (perBase === null) continue;

    const ref = agg.get(refKey(line.productId, line.unit));
    if (!ref || ref.count < MIN_HISTORY_PURCHASES) continue;

    const reference = ref.sum / ref.count;
    if (!(reference > 0)) continue;

    const delta = (reference - perBase) * quantityInBaseUnits(line);
    net += delta;
    comparedLines += 1;

    if (delta > 0 && (best === null || delta > best.amount)) {
      best = { label: line.label ?? "Un producto", amount: roundCents(delta) };
    }
  }

  return { net: roundCents(net), comparedLines, best };
}
