import { LoadingStatus } from "@/components/layout/loading-status";
import { PageHeader } from "@/components/layout/page-header";
import { Skeleton } from "@/components/ui/skeleton";

export default function RevisionLoading() {
  return (
    <>
      <LoadingStatus />
      <PageHeader
        title="Revisar caducidades"
        description="Pon fecha a lo que acabas de comprar o márcalo para consumir pronto. Todo es opcional: puedes omitir."
      />
      <div className="flex flex-col gap-2" aria-hidden>
        {[0, 1, 2].map((row) => (
          <Skeleton key={row} className="h-40 w-full rounded-xl" />
        ))}
      </div>
    </>
  );
}
