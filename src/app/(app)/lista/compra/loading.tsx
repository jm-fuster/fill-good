import { LoadingStatus } from "@/components/layout/loading-status";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * El modo compra es una toma a pantalla completa (fixed inset-0), sin
 * PageContainer/PageHeader: el skeleton replica su shell (cabecera + filas) para
 * no saltar al hidratar. Ver ShoppingMode: mismos rellenos (`pt-safe-3`, cuerpo
 * con `pt-3`) y los mismos botones, uno de 44 px en móvil y dos en escritorio.
 */
export default function ModoCompraLoading() {
  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-background">
      <LoadingStatus />
      <header className="border-b px-4 pb-3 pt-safe-3" aria-hidden>
        <div className="mx-auto flex w-full max-w-2xl items-center justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-1.5">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-3 w-40" />
          </div>
          <div className="flex items-center gap-1">
            <Skeleton className="hidden size-11 rounded-lg md:block" />
            <Skeleton className="size-11 rounded-lg" />
          </div>
        </div>
      </header>
      <div className="flex-1 overflow-y-auto px-4 pt-3" aria-hidden>
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-2">
          {[0, 1, 2, 3, 4, 5, 6, 7].map((row) => (
            <Skeleton key={row} className="h-12 w-full rounded-lg" />
          ))}
        </div>
      </div>
    </div>
  );
}
