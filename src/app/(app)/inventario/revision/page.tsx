import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { ExpiryReview } from "@/features/inventory/components/expiry-review";
import { getInventoryItemsByIds } from "@/features/inventory/queries";
import { ScanTicketNudge } from "@/features/receipts/components/scan-ticket-nudge";
import { getTripPendingTicket } from "@/features/shopping-list/queries";

export const metadata: Metadata = { title: "Revisar caducidades" };

export default async function RevisionPage({
  searchParams,
}: {
  searchParams: Promise<{ items?: string; origen?: string }>;
}) {
  const { items, origen } = await searchParams;
  const ids = (items ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (ids.length === 0) redirect("/inventario");

  // El aviso del ticket solo se busca al venir de finalizar la compra en la
  // lista: quien llega desde un ticket confirmado ya lo ha escaneado.
  const [entries, pendingTicket] = await Promise.all([
    getInventoryItemsByIds(ids),
    origen === "lista" ? getTripPendingTicket() : null,
  ]);
  if (entries.length === 0) redirect("/inventario");

  return (
    <PageContainer>
      <PageHeader
        title="Revisar caducidades"
        description="Pon fecha a lo que acabas de comprar o márcalo para consumir pronto. Todo es opcional: puedes omitir."
      />
      {/* Compacto aquí: la tarea de esta pantalla es poner fechas, y el bloque
          grande del aviso competía con ella. No puede ir debajo del formulario
          porque su barra de acciones es `fixed` en móvil y lo taparía.
          Irse a escanear ya no pierde trabajo: al confirmar el ticket, sus
          líneas vuelven a ofrecer esta misma revisión de caducidades.
          El espaciado lo pone la página: `PageContainer` no lleva gap. */}
      {pendingTicket ? (
        <div className="mb-4">
          <ScanTicketNudge trip={pendingTicket} compact />
        </div>
      ) : null}
      <ExpiryReview entries={entries} />
    </PageContainer>
  );
}
