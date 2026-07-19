/**
 * Normaliza el nombre de un producto para comparaciones e unicidad
 * insensibles a mayúsculas y acentos. Debe coincidir con lo que espera la
 * restricción unique(household_id, normalized_name) de la BBDD.
 */
export function normalizeName(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\s+/g, " ");
}
