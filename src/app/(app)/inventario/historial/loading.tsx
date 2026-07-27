import { LoadingStatus } from "@/components/layout/loading-status";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { Skeleton } from "@/components/ui/skeleton";

export default function HistorialLoading() {
  return (
    <PageContainer>
      <LoadingStatus />
      <PageHeader
        title="Historial de movimientos"
        description="Lo que se ha consumido, tirado y repuesto en los últimos 30 días."
        backHref="/inventario"
        backLabel="Inventario"
      />
      <div className="flex flex-col gap-2" aria-hidden>
        {[0, 1, 2, 3, 4, 5].map((row) => (
          <Skeleton key={row} className="h-16 w-full rounded-xl" />
        ))}
      </div>
    </PageContainer>
  );
}
