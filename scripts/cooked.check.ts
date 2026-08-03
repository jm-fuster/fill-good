/**
 * Comprobaciones del descuento al marcar un plato como cocinado. Lo ejecuta
 * `npm run check:cocinado` (ver `scripts/check-cooked.mjs`, que lo empaqueta con
 * esbuild porque esto es TypeScript y tira del alias `@/`).
 *
 * Prueba `src/features/menus/cooked.ts`: a qué unidad del inventario va cada
 * ingrediente, cuánto se propone restar y qué se contesta cuando no se puede
 * restar nada. Es el sitio del repo donde un error se paga en la despensa del
 * usuario —descontar de la fila equivocada, o más de lo que hay— y ni el
 * compilador ni el lint ven ninguna de las dos cosas: son cuentas.
 *
 * Lo que más se vigila aquí es la ELECCIÓN DE UNIDAD. La cantidad se muestra y se
 * edita en la unidad de la RECETA (160 g) y se resta en la del INVENTARIO (0,32 de
 * un bote de 500 g), así que hay dos números para la misma verdad. El invariante
 * que no se puede romper: lo propuesto, convertido a la unidad de la despensa,
 * nunca puede pasar de lo que hay guardado. Si se rompe, el inventario queda a
 * cero contando un consumo que no ocurrió.
 *
 * Lo que NO se prueba: el emparejado fuzzy en profundidad (es de `missing.ts`), el
 * reparto FIFO entre lotes ni la escritura (viven en la Server Action, contra la
 * base). Aquí solo la decisión pura.
 */
import {
  computeCookedDeductions,
  noDeductionsReason,
  resolveStockTarget,
  type CookedDeduction,
} from "@/features/menus/cooked";
import { normalizeName } from "@/lib/normalize";
import { convertQuantity, type UnitContent } from "@/lib/units";
import type { UnitType } from "@/lib/supabase/types";

let fallos = 0;
function check(nombre: string, condicion: boolean, extra?: unknown) {
  if (condicion) {
    console.log(`  ok    ${nombre}`);
  } else {
    fallos += 1;
    console.log(
      `  FALLO ${nombre}`,
      extra === undefined ? "" : JSON.stringify(extra),
    );
  }
}

function seccion(titulo: string) {
  console.log(`\n${titulo}`);
}

/** Producto del catálogo con lo que hay en casa y su contenido declarado. */
type Producto = {
  id: string;
  name: string;
  /** Unidad por defecto del catálogo (el cálculo no la usa, el tipo sí). */
  unit: UnitType;
  /** Existencias por unidad, tal como están guardadas. */
  stock: [UnitType, number][];
  content?: UnitContent;
};

type Ingrediente = {
  name: string;
  quantity: number | null;
  unit: UnitType | null;
  productId?: string | null;
};

function calcular(
  ingredientes: Ingrediente[],
  productos: Producto[],
): CookedDeduction[] {
  const stockByProductUnit = new Map<string, Map<UnitType, number>>();
  const contentByProduct = new Map<string, UnitContent>();
  for (const p of productos) {
    contentByProduct.set(p.id, p.content ?? null);
    if (p.stock.length === 0) continue;
    const byUnit = new Map<UnitType, number>();
    for (const [unit, qty] of p.stock) {
      byUnit.set(unit, (byUnit.get(unit) ?? 0) + qty);
    }
    stockByProductUnit.set(p.id, byUnit);
  }
  return computeCookedDeductions({
    ingredients: ingredientes.map((i) => ({
      name: i.name,
      productId: i.productId ?? null,
      unit: i.unit,
      quantity: i.quantity,
    })),
    catalog: productos.map((p) => ({
      id: p.id,
      name: p.name,
      normalizedName: normalizeName(p.name),
      defaultUnit: p.unit,
    })),
    stockByProductUnit,
    contentByProduct,
  });
}

/** El invariante: lo propuesto nunca puede pasar de lo que hay en la despensa. */
function cabeEnLaDespensa(d: CookedDeduction, content: UnitContent): boolean {
  if (!d.deductible || d.unit === null) return false;
  const stockUnit = d.conversion?.stockUnit ?? d.unit;
  const enDespensa = convertQuantity(d.suggestedQty, d.unit, stockUnit, content);
  const hay = d.conversion?.stockQty ?? d.availableQty;
  return enDespensa !== null && enDespensa <= hay + 1e-9;
}

const BOTE_500G: UnitContent = { size: 500, unit: "g", estimate: false };
const PERA_MEDIA: UnitContent = { size: 200, unit: "g", estimate: true };

seccion("Misma unidad (lo que ya funcionaba)");
{
  const [d] = calcular(
    [{ name: "Lentejas", quantity: 160, unit: "g", productId: "p1" }],
    [{ id: "p1", name: "Lentejas", unit: "g", stock: [["g", 400]] }],
  );
  check("se descuenta sin conversión", d.deductible && d.conversion === null, d);
  check("propone lo que pide la receta", d.suggestedQty === 160, d);
  check("y dice cuánto hay", d.availableQty === 400, d);
}

seccion("Misma familia: g↔kg y ml↔l (exacto, sin declarar nada)");
{
  const [d] = calcular(
    [{ name: "Lentejas", quantity: 160, unit: "g", productId: "p1" }],
    [{ id: "p1", name: "Lentejas", unit: "kg", stock: [["kg", 2]] }],
  );
  check("un kilo cubre una receta en gramos", d.deductible, d);
  check("lo disponible se ve en gramos", d.availableQty === 2000, d);
  check("pero se restará de los kg", d.conversion?.stockUnit === "kg", d);
  check("sin «≈»: es una conversión exacta", d.conversion?.approx === false, d);
  check("cabe en la despensa", cabeEnLaDespensa(d, null), d);
}
{
  const [d] = calcular(
    [{ name: "Aceite", quantity: 20, unit: "ml", productId: "p1" }],
    [{ id: "p1", name: "Aceite", unit: "l", stock: [["l", 1]] }],
  );
  check("un litro cubre una receta en ml", d.deductible, d);
  check("lo disponible se ve en ml", d.availableQty === 1000, d);
}

seccion("Puente ud↔medida con el contenido declarado");
{
  const productos: Producto[] = [
    {
      id: "p1",
      name: "Lentejas",
      unit: "ud",
      stock: [["ud", 1]],
      content: BOTE_500G,
    },
  ];
  const [d] = calcular(
    [{ name: "Lentejas", quantity: 160, unit: "g", productId: "p1" }],
    productos,
  );
  check("un paquete de 500 g cubre 160 g", d.deductible, d);
  check("lo disponible se ve en gramos", d.availableQty === 500, d);
  check("se restará de las ud", d.conversion?.stockUnit === "ud", d);
  check("y dice que en casa es 1 ud", d.conversion?.stockQty === 1, d);
  check("sin «≈»: el envase es un dato exacto", d.conversion?.approx === false);
  check("cabe en la despensa", cabeEnLaDespensa(d, BOTE_500G), d);
}
{
  const [d] = calcular(
    [{ name: "Peras", quantity: 300, unit: "g", productId: "p1" }],
    [
      {
        id: "p1",
        name: "Peras",
        unit: "ud",
        stock: [["ud", 3]],
        content: PERA_MEDIA,
      },
    ],
  );
  check("un peso MEDIO también sirve de puente", d.deductible, d);
  check("y se marca como aproximado", d.conversion?.approx === true, d);
  check("cabe en la despensa", cabeEnLaDespensa(d, PERA_MEDIA), d);
}
{
  // Al revés: la receta cuenta piezas y la despensa está al peso.
  const content: UnitContent = { size: 250, unit: "g", estimate: false };
  const [d] = calcular(
    [{ name: "Cebollas", quantity: 1, unit: "ud", productId: "p1" }],
    [{ id: "p1", name: "Cebollas", unit: "g", stock: [["g", 500]] }].map(
      (p) => ({ ...p, content }) as Producto,
    ),
  );
  check("500 g son 2 cebollas de 250 g", d.deductible && d.availableQty === 2, d);
  check("se restará de los gramos", d.conversion?.stockUnit === "g", d);
  check("cabe en la despensa", cabeEnLaDespensa(d, content), d);
}

seccion("Sin conversión honesta: no se toca nada");
{
  const [d] = calcular(
    [{ name: "Lentejas", quantity: 160, unit: "g", productId: "p1" }],
    [{ id: "p1", name: "Lentejas", unit: "ud", stock: [["ud", 1]] }],
  );
  check("un paquete que no dice cuánto lleva no se abre", !d.deductible, d);
  check("y el motivo es la unidad", d.reasonKind === "unit_mismatch", d);
  check("con texto para la fila", d.reason === "Lo tienes en ud", d);
}

seccion("Elección de unidad cuando hay varias");
{
  const [d] = calcular(
    [{ name: "Lentejas", quantity: 160, unit: "g", productId: "p1" }],
    [
      {
        id: "p1",
        name: "Lentejas",
        unit: "g",
        stock: [
          ["ud", 1],
          ["g", 300],
        ],
        content: BOTE_500G,
      },
    ],
  );
  check(
    "lo exacto (g) manda sobre el puente (ud), aunque el puente tenga más",
    d.conversion === null,
    d,
  );
  check("y lo disponible es el de esa unidad", d.availableQty === 300, d);
}
{
  const [d] = calcular(
    [{ name: "Lentejas", quantity: 160, unit: "g", productId: "p1" }],
    [
      {
        id: "p1",
        name: "Lentejas",
        unit: "g",
        stock: [
          ["g", 100],
          ["kg", 5],
        ],
      },
    ],
  );
  check(
    "entre dos exactas gana la que cubre la receta (5 kg, no 100 g)",
    d.conversion?.stockUnit === "kg" && d.availableQty === 5000,
    d,
  );
  check("así no se queda corta sin necesidad", d.suggestedQty === 160, d);
}

seccion("Nunca más de lo que hay");
{
  const [d] = calcular(
    [{ name: "Lentejas", quantity: 300, unit: "g", productId: "p1" }],
    [{ id: "p1", name: "Lentejas", unit: "g", stock: [["g", 200]] }],
  );
  check("la propuesta se acota al stock", d.suggestedQty === 200, d);
}
{
  const [d] = calcular(
    [{ name: "Tomate frito", quantity: 900, unit: "g", productId: "p1" }],
    [
      {
        id: "p1",
        name: "Tomate frito",
        unit: "ud",
        stock: [["ud", 1]],
        content: BOTE_500G,
      },
    ],
  );
  check("con puente también se acota", d.suggestedQty === 500, d);
  check(
    "y sigue cabiendo en el bote (no pide 1,8 ud)",
    cabeEnLaDespensa(d, BOTE_500G),
    d,
  );
}

seccion("La escritura resuelve la MISMA unidad que se prometió");
{
  // Si estas dos se separan, se resta de una fila distinta de la mostrada.
  const stockByUnit = new Map<UnitType, number>([
    ["ud", 2],
    ["g", 50],
  ]);
  const target = resolveStockTarget("g", stockByUnit, BOTE_500G);
  const [d] = calcular(
    [{ name: "Lentejas", quantity: 160, unit: "g", productId: "p1" }],
    [
      {
        id: "p1",
        name: "Lentejas",
        unit: "g",
        stock: [
          ["ud", 2],
          ["g", 50],
        ],
        content: BOTE_500G,
      },
    ],
  );
  const mostrada = d.conversion?.stockUnit ?? d.unit;
  check("coinciden", target?.stockUnit === mostrada, {
    resolver: target?.stockUnit,
    mostrada,
  });
}

seccion("Las otras salidas informativas");
{
  const [d] = calcular(
    [{ name: "Cúrcuma", quantity: 5, unit: "g" }],
    [{ id: "p1", name: "Lentejas", unit: "g", stock: [["g", 400]] }],
  );
  check("lo que no está en el catálogo", d.reasonKind === "no_match", d);
}
{
  const [d] = calcular(
    [{ name: "Lentejas", quantity: 160, unit: "g", productId: "p1" }],
    [{ id: "p1", name: "Lentejas", unit: "g", stock: [] }],
  );
  check("lo que no queda", d.reasonKind === "no_stock", d);
}
{
  const [d] = calcular(
    [{ name: "Sal", quantity: null, unit: null, productId: "p1" }],
    [{ id: "p1", name: "Sal", unit: "g", stock: [["g", 500]] }],
  );
  check("lo que la receta no cuantifica", d.reasonKind === "no_quantity", d);
}
{
  const ds = calcular(
    [
      { name: "Lentejas", quantity: 100, unit: "g", productId: "p1" },
      { name: "Lentejas", quantity: 60, unit: "g", productId: "p1" },
    ],
    [{ id: "p1", name: "Lentejas", unit: "g", stock: [["g", 400]] }],
  );
  check("el mismo producto dos veces sale una", ds.length === 1, ds);
}
{
  const [d] = calcular(
    [{ name: "Tomate frito", quantity: 60, unit: "g" }],
    [
      {
        id: "p1",
        name: "Tomate frito Orlando",
        unit: "g",
        stock: [["g", 400]],
      },
    ],
  );
  check("el nombre parecido sigue casando (fuzzy)", d.deductible, d);
}

seccion("Por qué no se ha descontado nada");
{
  const items = calcular(
    [{ name: "Lentejas", quantity: 160, unit: "g", productId: "p1" }],
    [{ id: "p1", name: "Lentejas", unit: "ud", stock: [["ud", 1]] }],
  );
  const msg = noDeductionsReason(items) ?? "";
  check("la unidad manda y el mensaje enseña el arreglo", /contiene/.test(msg), {
    msg,
  });
}
{
  const items = calcular(
    [{ name: "Cúrcuma", quantity: 5, unit: "g" }],
    [{ id: "p1", name: "Lentejas", unit: "g", stock: [["g", 400]] }],
  );
  check(
    "sin catálogo lo dice",
    /no están en tu inventario/.test(noDeductionsReason(items) ?? ""),
    { msg: noDeductionsReason(items) },
  );
}
{
  const items = calcular(
    [
      { name: "Lentejas", quantity: 160, unit: "g", productId: "p1" },
      { name: "Cúrcuma", quantity: 5, unit: "g" },
    ],
    [{ id: "p1", name: "Lentejas", unit: "g", stock: [["g", 400]] }],
  );
  check(
    "si algo SÍ se descuenta, no se explica nada (habla el modal)",
    noDeductionsReason(items) === null,
  );
}
check("sin ingredientes no se inventa un motivo", noDeductionsReason([]) === null);

console.log(
  fallos === 0
    ? "\nDescuento al cocinar: todo correcto.\n"
    : `\nDescuento al cocinar: ${fallos} fallo(s).\n`,
);
process.exit(fallos === 0 ? 0 : 1);
