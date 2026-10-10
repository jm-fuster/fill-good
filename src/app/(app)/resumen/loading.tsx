import { LoadingStatus } from "@/components/layout/loading-status";
import { PageContainer } from "@/components/layout/page-container";
import { Skeleton } from "@/components/ui/skeleton";

export default function ResumenLoading() {
  return (
    <PageContainer>
      <LoadingStatus />
      <div aria-hidden>
        {/* Réplica de la caja de PageHeader con vuelta a Perfil (44px de target
            táctil aunque el texto mida 4); la descripción es el mes, que aún no
            se sabe. */}
        <div className="mb-6">
          <div className="mb-2 flex min-h-11 items-center">
            <Skeleton className="h-4 w-16" />
          </div>
          <Skeleton className="h-8 w-52" />
          <Skeleton className="mt-1 h-5 w-32" />
        </div>
        {/* Lo que pinta `WrappedView`: navegación entre meses, la tarjeta
            grande del titular y la rejilla de cifras de dos en dos. */}
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between gap-2">
            <Skeleton className="h-11 w-28 rounded-lg" />
            <Skeleton className="h-11 w-28 rounded-lg" />
          </div>
          <Skeleton className="h-40 w-full rounded-xl" />
          <div className="grid grid-cols-2 gap-2">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-20 w-full rounded-xl" />
            ))}
          </div>
        </div>
      </div>
    </PageContainer>
  );
}
