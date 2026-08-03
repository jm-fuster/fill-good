import type { UnitType } from "@/lib/supabase/types";
import { convertQuantity, type UnitContent } from "@/lib/units";

/**
 * Último precio conocido de un producto, tal como viaja hasta la fila de la
 * lista: el importe por unidad DE COMPRA (lo que costó una unidad en el ticket
 * más reciente), su unidad y el contenido del envase.
 *
 * Es la forma serializable de `LatestUnitPrice` (features/prices/queries.ts),
 * declarada aquí para no importar tipos de un módulo `server-only` desde el
 * cliente.
 */
export type ItemUnitPrice = {
  price: number;
  unit: UnitType;
  content: UnitContent;
  /**
   * Viaja pero NO se usa aquí, y está declarado justo para que se vea: el pack ya
   * está dentro de `price` (ver abajo). Lo aplica el coste de recetas, que cuenta
   * unidades sueltas; aplicarlo también aquí dividiría el precio de la caja para
   * multiplicarlo por un número de cajas.
   */
  packSize?: number | null;
};

/**
 * Coste estimado de una línea de la lista: precio × cantidad, llevando la
 * cantidad a la unidad del precio (con el contenido del envase ya se puede
 * costear "500 ml" contra un precio por brick). null cuando no hay precio, no
 * hay cantidad, o las unidades no se pueden convertir con honestidad.
 *
 * Vive en un módulo neutro —ni `server-only` ni "use client"— porque lo resuelve
 * el CLIENTE: en el modo compra la cantidad se corrige en el pasillo con el
 * stepper, y el total tiene que seguir al dedo, no esperar a que el servidor
 * devuelva la línea recalculada. Es la misma cuenta que hacía el servidor, en un
 * solo sitio, para que las dos no puedan divergir.
 *
 * El pack NO multiplica aquí a propósito: el precio es el de una unidad de
 * compra (un pack entero, tal como se pagó en el ticket), así que "2" × precio
 * ya es lo que va a costar. El coste de recetas (`computeRecipeCost`) SÍ divide
 * por el pack, y no es una contradicción: allí la cantidad es lo que se echa a la
 * olla (dos sobres) y aquí es lo que se mete en el carro (dos cajas).
 */
export function lineCostOf(
  unitPrice: ItemUnitPrice | null,
  quantity: number | null,
  unit: UnitType | null,
): number | null {
  if (!unitPrice || quantity === null || unit === null) return null;
  const inPriceUnit = convertQuantity(
    quantity,
    unit,
    unitPrice.unit,
    unitPrice.content,
  );
  if (inPriceUnit === null) return null;
  return unitPrice.price * inPriceUnit;
}
