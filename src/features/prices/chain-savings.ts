import { computeChainComparison } from "./chain-comparison";

/**
 * Aviso de ahorro por cadena (L15, fase 3): cruza dónde compras un producto
 * (cadena efectiva = manual o inferida) con la comparativa de precios de tus
 * tickets (M9) para avisar cuando otra cadena te sale más barata. Módulo neutro
 * (sin I/O), reutiliza la comparativa existente para no duplicar reglas.
 *
 * Solo avisa si el ahorro es sustancial (≥ MIN_SAVINGS_PCT): un aviso por un 2%
 * es ruido —y probablemente diferencias de formato/promo entre tickets— y erosiona
 * la confianza. Al apoyarse en `computeChainComparison`, hereda su regla
 * anti-muestra-de-1 (≥2 cadenas con ≥2 compras cada una), así que el consejo
 * siempre nace de compras reales y repetidas en varias tiendas.
 */

export const MIN_SAVINGS_PCT = 10;

export type ChainSavingsTip = {
  /** Cadena donde compras el producto hoy (manual o inferida). */
  currentChain: string;
  /** Cadena más barata según tus tickets. */
  cheaperChain: string;
  /** % que ahorrarías cambiando de la actual a la más barata (sobre lo que pagas hoy). */
  savingsPct: number;
};

export function computeChainSavings(
  points: { unitPrice: number; storeChain: string }[],
  currentChain: string,
  minPct: number = MIN_SAVINGS_PCT,
): ChainSavingsTip | null {
  const stats = computeChainComparison(points);
  if (!stats) return null;

  // computeChainComparison ordena de más barata a más cara.
  const cheapest = stats[0];
  const current = stats.find((s) => s.chain === currentChain);

  // Sin datos de precio en la cadena actual no hay nada que comparar; si la
  // actual ya es la más barata, tampoco hay consejo que dar.
  if (!current || !(current.avgPrice > 0)) return null;
  if (cheapest.chain === current.chain) return null;

  const savingsPct = Math.round(
    (1 - cheapest.avgPrice / current.avgPrice) * 100,
  );
  if (savingsPct < minPct) return null;

  return {
    currentChain: current.chain,
    cheaperChain: cheapest.chain,
    savingsPct,
  };
}
