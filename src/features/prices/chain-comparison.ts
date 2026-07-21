import { CHAIN_LABELS } from "./chains";

/**
 * Comparativa "dónde te sale más barato" (M9): precio medio por cadena a partir
 * de tus propios tickets. Regla anti-muestra-de-1 ESTRICTA: solo se devuelve algo
 * si hay ≥2 cadenas con ≥2 compras cada una para ese producto; si no, null (un
 * consejo con una sola compra de muestra es peor que ninguno). Módulo neutro
 * (sin I/O) para poder reutilizarlo y testearlo.
 */

export const MIN_CHAINS = 2;
export const MIN_PURCHASES_PER_CHAIN = 2;

export type ChainStat = {
  chain: string;
  label: string;
  avgPrice: number;
  count: number;
  /** % sobre la cadena más barata (0 en la más barata). */
  deltaPct: number;
  cheapest: boolean;
};

export function computeChainComparison(
  points: { unitPrice: number; storeChain: string }[],
): ChainStat[] | null {
  const agg = new Map<string, { sum: number; count: number }>();
  for (const p of points) {
    if (!(p.unitPrice > 0)) continue;
    const key = p.storeChain || "otro";
    const a = agg.get(key) ?? { sum: 0, count: 0 };
    a.sum += p.unitPrice;
    a.count += 1;
    agg.set(key, a);
  }

  const eligible = [...agg.entries()]
    .filter(([, a]) => a.count >= MIN_PURCHASES_PER_CHAIN)
    .map(([chain, a]) => ({ chain, avgPrice: a.sum / a.count, count: a.count }));

  if (eligible.length < MIN_CHAINS) return null;

  const cheapest = Math.min(...eligible.map((e) => e.avgPrice));
  return eligible
    .map((e) => ({
      chain: e.chain,
      label: CHAIN_LABELS[e.chain] ?? e.chain,
      avgPrice: e.avgPrice,
      count: e.count,
      deltaPct: cheapest > 0 ? Math.round((e.avgPrice / cheapest - 1) * 100) : 0,
      cheapest: e.avgPrice === cheapest,
    }))
    .sort((a, b) => a.avgPrice - b.avgPrice);
}
