import Link from "next/link";
import {
  LineChart,
  ListChecks,
  PiggyBank,
  Receipt,
  ScanLine,
  Sparkles,
  Sprout,
  Trash2,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { formatEuro } from "@/lib/money";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/layout/empty-state";
import { StatTile } from "@/components/stat-tile";
import { BudgetBar } from "@/features/prices/components/budget-bar";
import { SavingsBlock } from "@/features/prices/components/savings-block";
import {
  SettingsGroup,
  SettingsLinkRow,
} from "@/features/settings/components/settings-list";
import type { ProfileOverview } from "../queries";

/**
 * Marcador del mes en curso en /perfil: hucha, racha, compras perfectas y
 * objetivo, más las salidas a las dos pantallas que profundizan (el resumen del
 * mes cerrado y el análisis de precios).
 *
 * Todo lo que se pinta aquí sale de componentes que ya usan /precios y
 * /resumen; esta pantalla los ordena, no los reimplementa.
 */
export function ProfileDashboard({ data }: { data: ProfileOverview }) {
  const {
    spending,
    waste,
    trips,
    hasData,
    hasSavings,
    prevMonth,
    prevMonthLabel,
    wrappedIsNew,
  } = data;

  // Sin una sola compra no hay marcador que enseñar. Es la primera impresión de
  // la pestaña para quien acaba de entrar, así que en vez de una rejilla de
  // ceros se explica qué aparecerá aquí y se ofrece el único paso que lo activa.
  if (!hasData) {
    return (
      <EmptyState
        icon={PiggyBank}
        title="Tu hucha empieza aquí"
        description="Escanea un ticket y esta pantalla te dirá cuánto ahorras cada mes, cuántas compras se ciñen a la lista y cuánto llevas sin tirar comida."
        action={
          <Button asChild>
            <Link href="/escanear">
              <ScanLine aria-hidden />
              Escanear un ticket
            </Link>
          </Button>
        }
      />
    );
  }

  const {
    total,
    receiptCount,
    discardedTotal,
    discountTotal,
    savingsByPrice,
    savingsTotal,
    budget,
  } = spending;

  const streak = waste?.streak ?? null;
  // Misma regla que en /precios: la racha solo acompaña al mes limpio. Con algo
  // ya tirado, sacar aquí "tu récord fueron 8 semanas" suena a restregarlo.
  const showStreak =
    discardedTotal === 0 && streak !== null && streak.currentWeeks >= 1;

  const compras = receiptCount === 1 ? "1 compra" : `${receiptCount} compras`;
  const perfectTrips = trips.tripsPerfect === trips.tripsMatched;

  const tiles = [
    showStreak ? (
      <StatTile
        key="racha"
        icon={Sprout}
        label="Sin tirar comida"
        value={
          streak.currentWeeks === 1
            ? "1 semana"
            : `${streak.currentWeeks} semanas`
        }
        hint={
          streak.isBest ? "Tu mejor racha" : `Tu récord son ${streak.bestWeeks}`
        }
        accent="success"
      />
    ) : discardedTotal > 0 ? (
      <StatTile
        key="tirado"
        icon={Trash2}
        label="Comida tirada"
        value={formatEuro(discardedTotal)}
        hint={
          waste?.monthlyAverage != null
            ? discardedTotal < waste.monthlyAverage
              ? `Menos que tus ${formatEuro(waste.monthlyAverage)} habituales`
              : `Tu media mensual son ${formatEuro(waste.monthlyAverage)}`
            : undefined
        }
        accent="warning"
      />
    ) : null,

    trips.tripsMatched > 0 ? (
      <StatTile
        key="compras-perfectas"
        icon={ListChecks}
        label="Compras perfectas"
        value={`${trips.tripsPerfect} de ${trips.tripsMatched}`}
        hint={
          perfectTrips ? "Ni un producto fuera de lista" : "Ceñidas a la lista"
        }
        accent={perfectTrips ? "success" : undefined}
      />
    ) : null,

    // Con hucha, el gasto es contexto y va de tarjeta; sin ella ya es el
    // titular de arriba y repetirlo aquí sobraría.
    hasSavings ? (
      <StatTile
        key="gasto"
        icon={Receipt}
        label="Gasto del mes"
        value={formatEuro(total)}
        hint={`en ${compras}`}
      />
    ) : null,
  ].filter((tile) => tile !== null);

  return (
    <div className="flex flex-col gap-4">
      {hasSavings ? (
        <SavingsBlock
          variant="hero"
          savingsTotal={savingsTotal}
          discountTotal={discountTotal}
          savingsByPrice={savingsByPrice}
        />
      ) : (
        // Ya hay compras, pero todavía no hay con qué calcular la hucha (ni
        // descuentos en el ticket ni histórico de precios). Un "+0,00 €" en
        // grande se leería como que la app no funciona, así que el titular pasa
        // a ser el gasto y se dice cuándo aparecerá la hucha.
        <div className="flex flex-col items-center gap-0.5 rounded-xl border p-5 text-center">
          <p className="text-sm text-muted-foreground">Gasto de este mes</p>
          <p className="text-4xl font-semibold tabular-nums">
            {formatEuro(total)}
          </p>
          <p className="text-sm text-muted-foreground text-pretty">
            La hucha aparecerá en cuanto tus tickets traigan descuentos o haya
            histórico de precios con el que comparar.
          </p>
        </div>
      )}

      {/* Las tarjetas se juntan en una lista antes de pintarlas: cuántas hay
          depende del mes, y una sola a media anchura en una rejilla de dos
          columnas se ve como un hueco sin rellenar. */}
      {tiles.length > 0 ? (
        <div
          className={cn(
            "grid gap-2",
            tiles.length === 1 ? "grid-cols-1" : "grid-cols-2",
          )}
        >
          {tiles}
        </div>
      ) : null}

      {budget != null ? <BudgetBar total={total} budget={budget} /> : null}

      <SettingsGroup>
        <SettingsLinkRow
          href={`/resumen?mes=${prevMonth}`}
          icon={Sparkles}
          label={`Resumen de ${prevMonthLabel}`}
          hint="Cómo se cerró el mes pasado"
          value={wrappedIsNew ? <Badge>Nuevo</Badge> : undefined}
        />
        <SettingsLinkRow
          href="/precios"
          icon={LineChart}
          label="Precios y alertas"
          hint="Evolución de lo que compras y dónde sale más barato"
        />
      </SettingsGroup>
    </div>
  );
}
