import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { PageHeader } from "@/components/layout/page-header";
import { ExpiryReview } from "@/features/inventory/components/expiry-review";
import { getInventoryItemsByIds } from "@/features/inventory/queries";

export const metadata: Metadata = { title: "Revisar caducidades" };

export default async function RevisionPage({
  searchParams,
}: {
  searchParams: Promise<{ items?: string }>;
}) {
  const { items } = await searchParams;
  const ids = (items ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (ids.length === 0) redirect("/inventario");

  const entries = await getInventoryItemsByIds(ids);
  if (entries.length === 0) redirect("/inventario");

  return (
    <>
      <PageHeader
        title="Revisar caducidades"
        description="Pon fecha a lo que acabas de comprar o márcalo para consumir pronto. Todo es opcional: puedes omitir."
      />
      <ExpiryReview entries={entries} />
    </>
  );
}
