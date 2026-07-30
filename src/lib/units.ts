import type { LocationType, UnitType } from "@/lib/supabase/types";
import { formatEuro } from "@/lib/money";

export const UNIT_LABELS: Record<UnitType, string> = {
  ud: "ud",
  g: "g",
  kg: "kg",
  ml: "ml",
  l: "l",
};

export const UNIT_OPTIONS: { value: UnitType; label: string }[] = [
  { value: "ud", label: "Unidades" },
  { value: "g", label: "Gramos (g)" },
  { value: "kg", label: "Kilos (kg)" },
  { value: "ml", label: "Mililitros (ml)" },
  { value: "l", label: "Litros (l)" },
];

/**
 * Unidades de medida: las que puede tener el CONTENIDO de un envase. Sin 'ud',
 * porque "1 pack = 6 ud" no es contenido, es `pack_size` (conteo→conteo).
 */
export const MEASURE_UNIT_OPTIONS = UNIT_OPTIONS.filter((o) => o.value !== "ud");

/** Unidades que se cuentan de una en una (muestran stepper +/-). */
export function isCountable(unit: UnitType): boolean {
  return unit === "ud";
}

/**
 * Igual que {@link isCountable} pero admitiendo «sin unidad», que es como queda
 * un alta de texto libre sin producto de catálogo detrás: cuenta como contable
 * porque lo que se apunta ahí son piezas ("pan", "lechuga").
 */
export function isCountableOrUnset(unit: UnitType | null): boolean {
  return unit === null || unit === "ud";
}

/**
 * Cantidad con la que nace un artículo de la lista cuando el usuario no dice
 * ninguna. Los contables arrancan en 1 para que el stepper «− 1 +» esté a la
 * vista desde el principio: «sin cantidad» y «1» ya se comportaban igual al
 * finalizar la compra, así que era un estado invisible que solo servía para
 * esconder los controles.
 *
 * Los que se compran a granel (kg/g/l/ml) siguen naciendo sin cantidad: ahí sí
 * significa algo distinto de «1 kg» («tomates, ya veré cuántos cojo»).
 */
export function defaultListQuantity(unit: UnitType | null): number | null {
  return isCountableOrUnset(unit) ? 1 : null;
}

/**
 * Lo que suma o resta una pulsación del stepper ±. Los contables van de uno en
 * uno; a granel se usa el paso con el que de verdad se compra (¼ kg, ½ l,
 * 100 g/ml), porque nadie ajusta el inventario gramo a gramo. Sin este paso los
 * productos al peso se quedaban sin controles y había que teclear la cantidad en
 * el drawer para cada cambio.
 */
export function quantityStep(unit: UnitType | null): number {
  switch (unit) {
    case "kg":
      return 0.25;
    case "l":
      return 0.5;
    case "g":
    case "ml":
      return 100;
    default:
      return 1; // ud o sin unidad
  }
}

/** Redondea a 2 decimales: evita arrastres al acumular pasos fraccionarios. */
export function roundQuantity(qty: number): number {
  return Math.round(qty * 100) / 100;
}

/**
 * Cómo se nombra el paso en las etiquetas accesibles de los botones ±:
 * "una unidad" para contables, la cantidad con su unidad a granel ("0,25 kg").
 */
export function stepLabel(unit: UnitType | null): string {
  if (unit === null || isCountable(unit)) return "una unidad";
  return formatQuantity(quantityStep(unit), unit);
}

export type UnitFamily = "count" | "weight" | "volume";

/**
 * Familia física de una unidad. Solo se puede operar (convertir, comparar
 * precios) DENTRO de la misma familia: g↔kg y ml↔l son exactos, pero ud↔peso
 * jamás se convierte (no se adivina el peso de una unidad).
 */
export function unitFamily(unit: UnitType): UnitFamily {
  if (unit === "g" || unit === "kg") return "weight";
  if (unit === "ml" || unit === "l") return "volume";
  return "count";
}

/** Factor a la unidad base de su familia (g para peso, ml para volumen, ud). */
export function baseUnitFactor(unit: UnitType): number {
  return unit === "kg" || unit === "l" ? 1000 : 1;
}

/**
 * Contenido de cada unidad de un producto: 500 + 'ml' = brick de medio litro.
 * `null` = el producto no lo declara. Su unidad nunca es 'ud' (lo garantiza la
 * restricción `products_content_pair`).
 *
 * `estimate` distingue el dato del envase (500 ml exactos) del peso MEDIO de algo
 * fresco (una pera, «unos» 200 g). La bandera viaja pegada al contenido a
 * propósito: así ningún consumidor puede presentar una estimación como un hecho
 * sin haber decidido antes qué hace con ella.
 */
export type UnitContent = {
  size: number;
  unit: UnitType;
  estimate: boolean;
} | null;

/** Marca de aproximación de las etiquetas derivadas de un peso medio. */
export const APPROX = "≈";

/**
 * Unidad en la que se comparan precios entre formatos, que es como lo etiqueta
 * el supermercado: €/kg para peso y €/l para volumen. null para contables.
 */
export function canonicalMeasure(unit: UnitType): UnitType | null {
  const family = unitFamily(unit);
  if (family === "weight") return "kg";
  if (family === "volume") return "l";
  return null;
}

/**
 * Convierte una cantidad de una unidad a otra. Dentro de la misma familia es
 * exacto (g↔kg, ml↔l); entre 'ud' y una medida SOLO convierte si el producto
 * declara el contenido de cada unidad. Devuelve null cuando no hay forma honesta
 * de convertir, y quien llama decide qué hacer con esa negativa.
 *
 * Esto NO rompe la política de E3/E9 ("no convertir unidades en silencio"): esa
 * regla existe para que la app no ADIVINE cuánto pesa una unidad. Aquí el factor
 * lo ha escrito el usuario en la ficha del producto.
 */
export function convertQuantity(
  qty: number,
  from: UnitType,
  to: UnitType,
  content: UnitContent = null,
): number | null {
  if (unitFamily(from) === unitFamily(to)) {
    return (qty * baseUnitFactor(from)) / baseUnitFactor(to);
  }
  if (!content) return null;
  // El contenido solo hace de puente entre 'ud' y su propia familia: un brick de
  // 500 ml no dice nada sobre cuántos gramos pesa.
  const bridge = unitFamily(content.unit);
  if (from === "ud" && unitFamily(to) === bridge) {
    return (qty * content.size * baseUnitFactor(content.unit)) / baseUnitFactor(to);
  }
  if (to === "ud" && unitFamily(from) === bridge) {
    const inContentUnit =
      (qty * baseUnitFactor(from)) / baseUnitFactor(content.unit);
    return inContentUnit / content.size;
  }
  return null;
}

/**
 * Precio comparable entre formatos: pasa un precio por unidad de compra a €/kg
 * o €/l. Es lo que permite ver que el brick de 500 ml a 1,29 € (2,58 €/l) sale
 * más caro que el de litro a 1,89 €, algo que "1,29 €/ud" esconde.
 *
 * null cuando no hay nada que aportar: sin contenido declarado, o cuando el
 * precio ya viene en la unidad canónica (un €/kg ya es comparable).
 */
export function pricePerMeasure(
  unitPrice: number,
  priceUnit: UnitType,
  content: UnitContent,
): { price: number; unit: UnitType } | null {
  const target =
    priceUnit === "ud"
      ? content
        ? canonicalMeasure(content.unit)
        : null
      : canonicalMeasure(priceUnit);
  if (!target || target === priceUnit) return null;
  const perUnit = convertQuantity(1, priceUnit, target, content);
  if (perUnit === null || perUnit <= 0) return null;
  return { price: unitPrice / perUnit, unit: target };
}

/**
 * Etiqueta del precio comparable: "2,58 €/l", o "≈ 2,15 €/kg" cuando sale de un
 * peso medio. null si no aporta nada (ver {@link pricePerMeasure}).
 *
 * Solo afecta a cómo se MUESTRA: el histórico de precios sigue guardando el
 * importe y el €/kg del ticket, sin que un peso estimado los toque nunca.
 */
export function pricePerMeasureLabel(
  unitPrice: number,
  priceUnit: UnitType,
  content: UnitContent,
): string | null {
  const perMeasure = pricePerMeasure(unitPrice, priceUnit, content);
  if (!perMeasure) return null;
  // El «≈» solo aplica si la conversión ha USADO el contenido estimado: un precio
  // que ya venía por gramo se pasa a €/kg con exactitud.
  const approx = priceUnit === "ud" && content?.estimate;
  const label = `${formatEuro(perMeasure.price)}/${UNIT_LABELS[perMeasure.unit]}`;
  return approx ? `${APPROX} ${label}` : label;
}

export const LOCATION_LABELS: Record<LocationType, string> = {
  pantry: "Despensa",
  fridge: "Nevera",
  freezer: "Congelador",
  other: "Otros",
};

export const LOCATION_ICONS: Record<LocationType, string> = {
  pantry: "🧺",
  fridge: "🧊",
  freezer: "❄️",
  other: "📦",
};

export const LOCATION_OPTIONS: { value: LocationType; label: string }[] = [
  { value: "pantry", label: "Despensa" },
  { value: "fridge", label: "Nevera" },
  { value: "freezer", label: "Congelador" },
  { value: "other", label: "Otros" },
];

/** Orden en que se muestran las ubicaciones en el inventario. */
export const LOCATION_ORDER: LocationType[] = [
  "fridge",
  "freezer",
  "pantry",
  "other",
];

/** Formatea solo el número, con coma decimal y sin ceros de cola: 1.5 → "1,5". */
export function formatQuantityValue(qty: number): string {
  const n = Number(qty);
  return Number.isInteger(n)
    ? String(n)
    : n.toFixed(2).replace(/0+$/, "").replace(/\.$/, "").replace(".", ",");
}

/** Formatea una cantidad con su unidad: 1500 g → "1500 g", 1.5 → "1,5 kg". */
export function formatQuantity(qty: number, unit: UnitType): string {
  return `${formatQuantityValue(qty)} ${UNIT_LABELS[unit]}`;
}

/**
 * Etiqueta del contenido total de una línea, o null cuando no aporta nada: sin
 * contenido declarado, sin cantidad, o medida a granel (ahí la cantidad ya ES la
 * medida, y repetirla sería ruido). Una sola regla para inventario y lista.
 */
export function contentTotalLabel(
  quantity: number | null,
  unit: UnitType | null,
  content: UnitContent,
): string | null {
  if (!content || quantity === null || quantity <= 0) return null;
  // null = alta de texto libre sin producto detrás: lo que se apunta ahí son
  // piezas, así que cuenta como contable.
  if (unit !== null && unit !== "ud") return null;
  const total = formatContentTotal(quantity, content.size, content.unit);
  return content.estimate ? `${APPROX} ${total}` : total;
}

/**
 * Multiplicador de pack que de verdad se aplica (`products.pack_size`, F4), o
 * null. Un pack de 1 no multiplica nada, y en un producto al peso no significa
 * nada: son las dos condiciones que ya usa el checkout al pasar la lista al
 * inventario, y viven aquí para que ninguna pantalla prometa un total que luego
 * no se cumpla. `unit` null (texto libre sin producto) cuenta como piezas.
 */
export function effectivePackSize(
  unit: UnitType | null,
  packSize: number | null | undefined,
): number | null {
  if (packSize == null || packSize <= 1) return null;
  return unit === null || unit === "ud" ? packSize : null;
}

/**
 * Cantidad de una línea de lista nombrada como se cuenta al comprar: "2 ud", o
 * "2 packs" cuando el producto viene en pack. Ahí la cantidad NO son unidades, y
 * escribir "2 ud" de algo que repone 20 es dar un número falso.
 */
export function formatPurchaseQuantity(
  qty: number,
  unit: UnitType | null,
  packSize: number | null,
): string {
  if (!effectivePackSize(unit, packSize)) {
    return formatQuantity(qty, unit ?? "ud");
  }
  return `${formatQuantityValue(qty)} ${qty === 1 ? "pack" : "packs"}`;
}

/**
 * Equivalencia de una línea de la LISTA, donde la cantidad cuenta COMPRAS y no
 * unidades: con `pack_size` 10, un «1» son 10 ud en casa; y con contenido
 * declarado, 3 bricks de medio litro son 1,5 l. Existe para que el
 * multiplicador se vea en el pasillo: hasta ahora solo se aplicaba al finalizar
 * la compra, así que apuntar 10 huevos y llevarse 100 era un error silencioso.
 *
 * El «=» abre la etiqueta a propósito: sin él, un «10 ud» al lado de un stepper
 * que marca 1 se lee como la cantidad de la línea. Lo sustituye «≈» en cuanto el
 * contenido es un peso medio; el recuento del pack sí es exacto, pero declarar
 * menos confianza de la que hay no engaña a nadie, y al revés sí.
 *
 * null cuando no aporta nada: sin pack ni contenido, sin cantidad, o a granel
 * (ahí la cantidad ya ES la medida, y el pack solo vale para conteo).
 */
export function listTotalLabel(
  quantity: number | null,
  unit: UnitType | null,
  content: UnitContent,
  packSize: number | null,
): string | null {
  if (quantity === null || quantity <= 0) return null;
  // null = alta de texto libre sin producto detrás: lo que se apunta ahí son
  // piezas, así que cuenta como contable.
  if (unit !== null && unit !== "ud") return null;
  const pack = effectivePackSize(unit, packSize);
  const units = pack ? quantity * pack : quantity;
  const parts: string[] = [];
  if (pack) parts.push(formatQuantity(roundQuantity(units), "ud"));
  if (content) parts.push(formatContentTotal(units, content.size, content.unit));
  if (parts.length === 0) return null;
  return `${content?.estimate ? APPROX : "="} ${parts.join(" · ")}`;
}

/**
 * Contenido total de un stock contable: 3 ud de 500 ml → "1,5 l". Sube a la
 * unidad grande de la familia al pasar de 1000 porque "1500 ml" se lee peor que
 * "1,5 l" (y es lo que uno diría en voz alta).
 */
export function formatContentTotal(
  count: number,
  contentSize: number,
  contentUnit: UnitType,
): string {
  const total = count * contentSize;
  if (contentUnit === "g" && total >= 1000) {
    return formatQuantity(roundQuantity(total / 1000), "kg");
  }
  if (contentUnit === "ml" && total >= 1000) {
    return formatQuantity(roundQuantity(total / 1000), "l");
  }
  return formatQuantity(roundQuantity(total), contentUnit);
}
