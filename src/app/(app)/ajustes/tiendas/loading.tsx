import { LoadingStatus } from "@/components/layout/loading-status";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { Skeleton } from "@/components/ui/skeleton";

export default function TiendasLoading() {
  return (
    <PageContainer>
      <LoadingStatus />
      <PageHeader
        title="Tus supermercados"
        description="Dónde soléis comprar. Tus tiendas salen primero al elegir la tienda preferida de un producto, y ayudan a la IA a identificar la cadena de cada ticket."
        backHref="/ajustes"
        backLabel="Ajustes"
      />
      <div className="flex flex-col gap-2" aria-hidden>
        {[0, 1, 2, 3, 4, 5, 6, 7].map((row) => (
          <Skeleton key={row} className="h-14 w-full rounded-lg" />
        ))}
      </div>
    </PageContainer>
  );
}
