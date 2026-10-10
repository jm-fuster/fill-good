import { LoadingStatus } from "@/components/layout/loading-status";
import { PageContainer } from "@/components/layout/page-container";
import { Skeleton } from "@/components/ui/skeleton";

export default function PerfilLoading() {
  return (
    <PageContainer>
      <LoadingStatus />
      <div aria-hidden>
        {/* Réplica de la caja de PageHeader con avatar: el título es tu nombre
            y la línea de debajo tu hogar, y ninguno se sabe aún, así que van
            los dos en esqueleto con sus medidas (avatar `size-14`, título
            `text-2xl`, engranaje de 44px). */}
        <div className="mb-6 flex items-start justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <Skeleton className="size-14 shrink-0 rounded-full" />
            <div className="min-w-0">
              <Skeleton className="h-8 w-40" />
              <Skeleton className="mt-1 h-5 w-28" />
            </div>
          </div>
          <Skeleton className="size-11 shrink-0 rounded-lg" />
        </div>
        {/* Hucha (o gasto del mes), tarjetas de dos en dos y el grupo de
            enlaces a Resumen y Precios: lo que pinta `ProfileDashboard`. */}
        <div className="flex flex-col gap-4">
          <Skeleton className="h-36 w-full rounded-xl" />
          <div className="grid grid-cols-2 gap-2">
            {[0, 1].map((i) => (
              <Skeleton key={i} className="h-20 w-full rounded-xl" />
            ))}
          </div>
          <Skeleton className="h-32 w-full rounded-xl" />
        </div>
      </div>
    </PageContainer>
  );
}
