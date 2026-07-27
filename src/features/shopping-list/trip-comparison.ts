/**
 * Compra perfecta (G2): cruza lo que iba en la lista con lo que acabó en el
 * ticket. Módulo neutro (sin I/O) como `chain-comparison.ts` o `savings.ts`,
 * para poder reutilizarlo y testearlo.
 *
 * Solo se miran los EXTRAS (lo que entró sin estar en la lista), nunca los
 * "olvidos" (lo que estaba en la lista y no aparece en el ticket). No es una
 * omisión: un olvido aparente casi siempre significa que la IA no supo emparejar
 * esa línea del ticket, no que el usuario se dejara el producto. Acusar a
 * alguien de olvidarse el pan cuando en realidad falló el OCR destruye la
 * confianza en la pantalla entera, y esa confianza es justo lo que sostiene
 * toda la gamificación.
 *
 * Los extras son la señal robusta: son líneas del ticket que SÍ se emparejaron
 * con un producto y que, con certeza, no estaban en la lista.
 */

export type ReceiptProduct = {
  productId: string;
  /** Nombre tal y como lo ve el usuario en la revisión del ticket. */
  label: string;
};

export type TripComparison = {
  /** Productos comprados que no estaban en la lista, en el orden del ticket. */
  extras: string[];
  /** Cuántos productos del ticket sí estaban en la lista. */
  onList: number;
  /**
   * No entró nada fuera de la lista. Exige `onList > 0`: sin ninguna
   * coincidencia, un "cero extras" sería un tecnicismo vacío (probablemente el
   * ticket no se corresponde con esa compra) y felicitar por él sería mentir.
   */
  perfect: boolean;
};

export function compareTripToReceipt(
  tripProductIds: string[],
  bought: ReceiptProduct[],
): TripComparison {
  const onTrip = new Set(tripProductIds);

  const extras: string[] = [];
  const seen = new Set<string>();
  let onList = 0;

  for (const item of bought) {
    // Un mismo producto puede ocupar varias líneas del ticket (dos bricks de
    // leche escaneados por separado); cuenta una sola vez.
    if (seen.has(item.productId)) continue;
    seen.add(item.productId);

    if (onTrip.has(item.productId)) onList += 1;
    else extras.push(item.label);
  }

  return { extras, onList, perfect: extras.length === 0 && onList > 0 };
}
