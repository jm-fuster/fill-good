import { LoadingStatus } from "@/components/layout/loading-status";
import { PageHeader } from "@/components/layout/page-header";
import { Skeleton } from "@/components/ui/skeleton";

export default function InventarioLoading() {
  return (
    <>
      <LoadingStatus />
      <PageHeader
        title="Inventario"
        description="Tu despensa, nevera y congelador."
      />
      <div className="flex flex-col gap-6" aria-hidden>
        {[0, 1].map((group) => (
          <div key={group}>
            <Skeleton className="mb-2 h-4 w-32" />
            <div className="flex flex-col gap-2">
              {[0, 1, 2].map((row) => (
                <Skeleton key={row} className="h-16 w-full rounded-xl" />
              ))}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
