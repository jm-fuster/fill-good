import { LoadingStatus } from "@/components/layout/loading-status";
import { PageContainer } from "@/components/layout/page-container";
import { Skeleton } from "@/components/ui/skeleton";

export default function PrecioDetalleLoading() {
  return (
    <PageContainer>
      <LoadingStatus />
      <div aria-hidden>
        {/* Réplica de la caja de PageHeader, no un parecido: la vuelta ocupa
            44px de target táctil (`min-h-11`) aunque su texto mida 4, y con un
            hueco de 20px el detalle bajaba de golpe al resolverse. El título y
            la descripción sí son aproximados —el nombre del producto y las
            líneas que ocupe no se saben aún—. */}
        <div className="mb-6">
          <div className="mb-2 flex min-h-11 items-center">
            <Skeleton className="h-4 w-20" />
          </div>
          <Skeleton className="h-8 w-48" />
          <Skeleton className="mt-1 h-5 w-56" />
        </div>
        <div className="flex flex-col gap-6">
          <div className="grid grid-cols-3 gap-2">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-16 w-full rounded-xl" />
            ))}
          </div>
          <Skeleton className="aspect-[4/3] w-full rounded-xl" />
          <div className="flex flex-col gap-2">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-9 w-full" />
            ))}
          </div>
        </div>
      </div>
    </PageContainer>
  );
}
