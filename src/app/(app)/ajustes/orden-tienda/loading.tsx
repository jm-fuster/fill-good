import { LoadingStatus } from "@/components/layout/loading-status";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { Skeleton } from "@/components/ui/skeleton";

export default function OrdenTiendaLoading() {
  return (
    <PageContainer>
      <LoadingStatus />
      <PageHeader
        title="Orden de la tienda"
        description="Ordena los pasillos como en tu supermercado. La lista agrupada y el modo compra te mostrarán los productos en este orden."
        backHref="/ajustes"
        backLabel="Ajustes"
      />
      <div className="flex flex-col gap-2" aria-hidden>
        {[0, 1, 2, 3, 4, 5, 6].map((row) => (
          <Skeleton key={row} className="h-14 w-full rounded-lg" />
        ))}
      </div>
    </PageContainer>
  );
}
