import Link from "next/link";
import {
  ChevronLeft,
  ChevronRight,
  CirclePlus,
  ListChecks,
  PiggyBank,
  Receipt,
  Star,
  Store,
  Target,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { formatEuro, formatEuroSigned } from "@/lib/money";
import { Card, CardContent } from "@/components/ui/card";
import { StatTile } from "@/components/stat-tile";
import type { MonthlyWrapped } from "../wrapped";

/**
 * Resumen del mes (G4). Cada bloque desaparece si no hay dato que lo sostenga,
 * en vez de mostrar un cero: un resumen relleno de ceros se lee como un
 * formulario vacío y resta credibilidad a los números que sí son reales.
 *
 * El titular es la hucha porque es la promesa del producto ("Compra lo justo,
 * ahorra más"); el gasto total va debajo como contexto, no como protagonista.
 */
export function WrappedView({ data }: { data: MonthlyWrapped }) {
  const {
    monthLabel,
    prevMonth,
    nextMonth,
    hasData,
    isClosed,
    budget,
    spentTotal,
    spentDelta,
    receiptCount,
    savingsTotal,
    topProduct,
    bestChain,
    tripsMatched,
    tripsPerfect,
    topExtra,
  } = data;

  return (
    <div className="flex flex-col gap-4">
      <nav
        aria-label="Cambiar de mes"
        className="flex items-center justify-between gap-2"
      >
        <Link
          href={`/resumen?mes=${prevMonth}`}
          aria-label="Mes anterior"
          className="inline-flex min-h-11 items-center gap-1 rounded-lg border px-3 text-sm transition-colors hover:bg-muted"
        >
          <ChevronLeft className="size-4" aria-hidden />
          Anterior
        </Link>
        {nextMonth ? (
          <Link
            href={`/resumen?mes=${nextMonth}`}
            aria-label="Mes siguiente"
            className="inline-flex min-h-11 items-center gap-1 rounded-lg border px-3 text-sm transition-colors hover:bg-muted"
          >
            Siguiente
            <ChevronRight className="size-4" aria-hidden />
          </Link>
        ) : null}
      </nav>

      {!hasData ? (
        <Card>
          <CardContent className="py-6">
            <p className="text-sm text-muted-foreground">
              No hay compras registradas en {monthLabel.toLowerCase()}. Escanea
              un ticket y el mes que viene aquí tendrás tu resumen.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Titular: la hucha, que es la promesa del producto. */}
          <Card>
            <CardContent className="flex flex-col gap-1 py-6 text-center">
              <p className="flex items-center justify-center gap-1.5 text-sm text-muted-foreground">
                <PiggyBank className="size-4" aria-hidden />
                A la hucha en {monthLabel.toLowerCase()}
              </p>
              <p
                className={cn(
                  "text-4xl font-semibold tabular-nums",
                  savingsTotal >= 0 ? "text-success" : "text-warning",
                )}
              >
                {formatEuroSigned(savingsTotal)}
              </p>
              <p className="text-sm text-muted-foreground">
                {receiptCount === 1
                  ? "en 1 compra"
                  : `en ${receiptCount} compras`}
                , {formatEuro(spentTotal)} de gasto
              </p>
            </CardContent>
          </Card>

          <div className="grid grid-cols-2 gap-2">
            <StatTile
              icon={Receipt}
              label="Frente al mes anterior"
              value={formatEuroSigned(-spentDelta)}
              hint={
                spentDelta < 0
                  ? "Has gastado menos"
                  : spentDelta > 0
                    ? "Has gastado más"
                    : "Igual que el mes pasado"
              }
              accent={spentDelta <= 0 ? "success" : "warning"}
            />

            {/* Único "reto" del plan (G5): el objetivo de gasto que ya existía,
                aquí con marco de resultado. Sin tabla ni ciclo de vida propios.
                Pasarse usa `warning` y no `destructive` —a diferencia de la
                barra en vivo de /precios— porque esto es un recuento a toro
                pasado: informar, no alarmar por algo que ya no tiene arreglo. */}
            {budget != null ? (
              <StatTile
                icon={Target}
                label="Objetivo del mes"
                value={
                  isClosed
                    ? spentTotal <= budget
                      ? "Cumplido"
                      : "Superado"
                    : `${formatEuro(spentTotal)} de ${formatEuro(budget)}`
                }
                hint={
                  spentTotal <= budget
                    ? isClosed
                      ? `${formatEuro(budget - spentTotal)} por debajo`
                      : `Te quedan ${formatEuro(budget - spentTotal)}`
                    : `${formatEuro(spentTotal - budget)} por encima`
                }
                accent={spentTotal <= budget ? "success" : "warning"}
              />
            ) : null}

            {topProduct ? (
              <StatTile
                icon={Star}
                label="Producto estrella"
                value={topProduct.label}
                hint={`${formatEuro(topProduct.value)} en total`}
                accent="price"
              />
            ) : null}

            {bestChain ? (
              <StatTile
                icon={Store}
                label="Dónde más ahorras"
                value={bestChain.label}
                hint={`${formatEuro(bestChain.value)} a la hucha`}
                accent="success"
              />
            ) : null}

            {tripsMatched > 0 ? (
              <StatTile
                icon={ListChecks}
                label="Compras perfectas"
                value={`${tripsPerfect} de ${tripsMatched}`}
                hint={
                  tripsPerfect === tripsMatched
                    ? "Ni un producto fuera de lista"
                    : "Ceñidas a la lista"
                }
                accent={tripsPerfect === tripsMatched ? "success" : undefined}
              />
            ) : null}

            {topExtra ? (
              <StatTile
                icon={CirclePlus}
                label="Capricho recurrente"
                value={topExtra.label}
                hint={`Fuera de lista ${topExtra.value} veces`}
              />
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}
