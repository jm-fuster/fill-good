/**
 * Redondeo a céntimos. Necesario al acumular importes derivados (precios por
 * unidad base × cantidad): sin él arrastran cola binaria y el total mostrado no
 * cuadra con la suma de sus partes.
 */
export function roundCents(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Formato de importes en euros, en convención española (coma decimal, símbolo
 * detrás). Siempre con dos decimales: en dinero, "3,2 €" se lee como un error de
 * redondeo.
 */
export function formatEuro(n: number): string {
  return `${n.toFixed(2).replace(".", ",")} €`;
}

/**
 * Igual, pero con signo explícito para saldos que pueden ir en ambas direcciones
 * (la hucha del hogar). Se usa el guion normal y no el menos tipográfico (−)
 * porque los lectores de pantalla lo verbalizan de forma fiable.
 */
export function formatEuroSigned(n: number): string {
  const sign = n > 0 ? "+" : n < 0 ? "-" : "";
  return `${sign}${formatEuro(Math.abs(n))}`;
}
