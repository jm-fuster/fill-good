import { LoadingStatus } from "@/components/layout/loading-status";
import { PageHeader } from "@/components/layout/page-header";
import { Skeleton } from "@/components/ui/skeleton";

export default function AjustesLoading() {
  return (
    <>
      <LoadingStatus />
      <PageHeader title="Ajustes" description="Tu hogar y tus preferencias." />
      <div className="flex flex-col gap-4" aria-hidden>
        {[0, 1, 2].map((card) => (
          <Skeleton key={card} className="h-20 w-full rounded-xl" />
        ))}
      </div>
    </>
  );
}
