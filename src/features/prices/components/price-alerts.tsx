import Link from "next/link";
import { ChevronRight, TrendingDown, TrendingUp } from "lucide-react";

import { cn } from "@/lib/utils";
import type { PriceAlert } from "../alerts";

function alertText(a: PriceAlert): string {
  if (a.kind === "up") {
    return `${a.productName} ha subido un ${a.pct}% desde tu última compra`;
  }
  return a.pct > 0
    ? `${a.productName} está un ${a.pct}% por debajo de tu precio habitual`
    : `${a.productName} está por debajo de tu precio habitual`;
}

export function PriceAlerts({ alerts }: { alerts: PriceAlert[] }) {
  if (alerts.length === 0) return null;

  return (
    <section aria-label="Avisos de precio" className="flex flex-col gap-2">
      <h2 className="text-sm font-medium text-muted-foreground">Avisos</h2>
      <ul className="flex flex-col gap-2">
        {alerts.map((a) => {
          const up = a.kind === "up";
          const Icon = up ? TrendingUp : TrendingDown;
          return (
            <li key={`${a.kind}-${a.productId}`}>
              <Link
                href={`/precios/${a.productId}`}
                className="flex min-h-14 items-center gap-3 rounded-xl border p-3 transition-colors hover:bg-muted"
              >
                <span
                  className={cn(
                    "flex size-9 shrink-0 items-center justify-center rounded-lg",
                    up
                      ? "bg-warning/15 text-warning"
                      : "bg-success/15 text-success",
                  )}
                >
                  <Icon className="size-4" aria-hidden />
                </span>
                <p className="min-w-0 flex-1 text-sm">{alertText(a)}</p>
                <ChevronRight
                  className="size-4 shrink-0 text-muted-foreground"
                  aria-hidden
                />
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
