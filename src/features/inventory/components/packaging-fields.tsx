"use client";

import type { UnitType } from "@/lib/supabase/types";
import { ContentPerUnitFields } from "./content-per-unit-fields";
import { PackSizeField } from "./pack-size-field";

/**
 * Los dos datos del envase juntos: lo que trae cada unidad (500 ml por brick) y
 * cuántas unidades trae una compra (30 sobres por caja).
 *
 * Van agrupados porque son la misma decisión leída de dos formas, y sueltos cada
 * uno gastaba un párrafo en distinguirse del otro. Con el rótulo común encima se
 * leen como una pareja, así que basta un pie de una línea en cada uno; y quien no
 * compra en formatos se salta el bloque entero de un vistazo.
 *
 * Solo tiene sentido en unidad 'ud' —en kg o l la medida ya ES la cantidad—, y
 * de eso responde quien lo monta: los dos campos se guardan solo para filas
 * contables (ver `addInventoryAction` / `updateInventoryAction`).
 */
export function PackagingFields({
  idPrefix,
  contentSize = null,
  contentUnit = null,
  contentIsEstimate = false,
  packSize = null,
}: {
  /** Prefijo de los ids: los dos drawers pueden convivir en el árbol. */
  idPrefix: string;
  contentSize?: number | null;
  contentUnit?: UnitType | null;
  contentIsEstimate?: boolean;
  packSize?: number | null;
}) {
  const headingId = `${idPrefix}-packaging-heading`;

  return (
    <div
      role="group"
      aria-labelledby={headingId}
      className="flex flex-col gap-4 rounded-lg border p-3"
    >
      <p id={headingId} className="text-sm font-medium">
        Envase
      </p>
      <ContentPerUnitFields
        idPrefix={idPrefix}
        defaultSize={contentSize}
        defaultUnit={contentUnit}
        defaultIsEstimate={contentIsEstimate}
      />
      <PackSizeField idPrefix={idPrefix} defaultValue={packSize} />
    </div>
  );
}
