import type { UnitType } from "@/lib/supabase/types";

export type ParsedItem = {
  /** Nombre del producto, sin el fragmento de cantidad. */
  name: string;
  /** Cantidad detectada, o null si no había un patrón claro. */
  quantity: number | null;
  /** Unidad detectada (del enum), o null. */
  unit: UnitType | null;
};

/** Alias de unidad → unidad canónica del enum (ud, g, kg, ml, l). */
const UNIT_ALIASES: Record<string, UnitType> = {
  ud: "ud",
  uds: "ud",
  u: "ud",
  g: "g",
  gr: "g",
  grs: "g",
  gramo: "g",
  gramos: "g",
  kg: "kg",
  kgs: "kg",
  kilo: "kg",
  kilos: "kg",
  ml: "ml",
  l: "l",
  lt: "l",
  litro: "l",
  litros: "l",
};

/**
 * Nombres que NO deben partirse aunque tengan la forma "número + palabra"
 * (falsos positivos de marcas/productos). Comparados en minúsculas.
 */
const FALSE_POSITIVES = new Set(["up"]);

function toNumber(raw: string): number | null {
  const n = Number(raw.replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Resuelve un token de unidad; devuelve undefined si no es una unidad válida. */
function resolveUnit(token: string | undefined): UnitType | null | undefined {
  if (token === undefined || token === "") return null; // sin unidad explícita
  const canonical = UNIT_ALIASES[token.toLowerCase()];
  return canonical ?? undefined; // undefined = letras que no son unidad
}

function clean(name: string): string {
  return name.trim().replace(/\s+/g, " ");
}

/**
 * L8 — Extrae cantidad y unidad de un texto libre de forma determinista (sin
 * IA). Reconoce el número al inicio o al final, con unidad opcional pegada o
 * separada: "2 leche", "300g arroz", "aceite 1,5 l". Coma decimal soportada.
 * Si no hay un patrón claro (o el nombre es un falso positivo como "7 up"),
 * devuelve todo el texto como nombre sin cantidad.
 */
export function parseQuantityFromText(input: string): ParsedItem {
  const text = clean(input);
  const fallback: ParsedItem = { name: text, quantity: null, unit: null };
  if (text.length === 0) return fallback;

  // Número al inicio: "2 leche", "300g arroz", "1,5 l aceite".
  const leading = /^(\d+(?:[.,]\d+)?)\s*([a-zA-Z]+)?\s+(.+)$/.exec(text);
  if (leading) {
    const qty = toNumber(leading[1]);
    const unit = resolveUnit(leading[2]);
    const name = clean(leading[3]);
    if (qty !== null && unit !== undefined && !FALSE_POSITIVES.has(name.toLowerCase())) {
      return { name, quantity: qty, unit };
    }
  }

  // Número al final: "aceite 1,5 l", "arroz 300 g", "leche 2".
  const trailing = /^(.+?)\s+(\d+(?:[.,]\d+)?)\s*([a-zA-Z]+)?$/.exec(text);
  if (trailing) {
    const name = clean(trailing[1]);
    const qty = toNumber(trailing[2]);
    const unit = resolveUnit(trailing[3]);
    if (qty !== null && unit !== undefined && !FALSE_POSITIVES.has(name.toLowerCase())) {
      return { name, quantity: qty, unit };
    }
  }

  return fallback;
}
