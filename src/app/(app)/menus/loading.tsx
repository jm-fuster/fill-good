import { LoadingStatus } from "@/components/layout/loading-status";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { Skeleton } from "@/components/ui/skeleton";

export default function MenusLoading() {
  return (
    <PageContainer>
      <LoadingStatus />
      {/*
        Los dos iconos del header (recetario y «⋯») miden 44px y hacen la fila
        del título 12px más alta que el título solo: sin reservarles el sitio,
        cada carga de /menus empujaba la semana 12px hacia abajo al resolverse.
        Medido montando las dos cabeceras en /offline, igual en móvil y en
        escritorio. El del «⋯» solo existe si la semana tiene platos, pero se
        reserva igual: es la altura más probable y no se sabe aún.
      */}
      <PageHeader
        title="Menús"
        action={
          <div className="flex items-center gap-2" aria-hidden>
            <Skeleton className="size-11 rounded-lg" />
            <Skeleton className="size-11 rounded-lg" />
          </div>
        }
      />
      <div className="flex flex-col gap-4" aria-hidden>
        <div className="flex items-center gap-1">
          <Skeleton className="size-11 shrink-0 rounded-lg" />
          <Skeleton className="mx-auto h-4 w-40" />
          <Skeleton className="size-11 shrink-0 rounded-lg" />
          <Skeleton className="size-11 shrink-0 rounded-lg" />
        </div>
        {/* Héroe: generar con IA + ajustes, tal como los pinta MenuView. */}
        <div className="flex items-center gap-2">
          <Skeleton className="h-12 flex-1 rounded-lg" />
          <Skeleton className="size-12 shrink-0 rounded-lg" />
        </div>
        <div className="flex flex-col gap-3">
          {[0, 1, 2, 3, 4, 5, 6].map((day) => (
            <Skeleton key={day} className="h-24 w-full rounded-xl" />
          ))}
        </div>
      </div>
    </PageContainer>
  );
}
