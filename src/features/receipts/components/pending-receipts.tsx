import Link from "next/link";
import { ChevronRight, ReceiptText } from "lucide-react";

import { isoDateInSpain, relativeDaysLabel } from "@/lib/dates";
import type { PendingReceipt } from "../queries";
import { DeleteReceiptButton } from "./delete-receipt-button";

/**
 * Sección «Pendientes de revisar» de /escanear: un ticket escaneado y abandonado
 * queda aquí, con enlace para reanudar la revisión y botón para descartarlo. Si
 * no hay pendientes, la página no renderiza esta sección.
 */
export function PendingReceipts({ receipts }: { receipts: PendingReceipt[] }) {
  if (receipts.length === 0) return null;

  return (
    <section className="mt-8">
      <h2 className="mb-3 text-sm font-medium">Pendientes de revisar</h2>
      <ul className="flex flex-col gap-2">
        {receipts.map((r) => (
          <li
            key={r.id}
            className="flex items-center gap-2 rounded-xl border bg-card p-3"
          >
            <Link
              href={`/escanear/${r.id}/revisar`}
              className="flex min-w-0 flex-1 items-center gap-3"
            >
              <span
                aria-hidden
                className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-foreground"
              >
                <ReceiptText className="size-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">
                  {r.storeName ?? "Ticket sin tienda"}
                </span>
                <span className="block text-sm text-muted-foreground">
                  {relativeDaysLabel(isoDateInSpain(r.createdAt))} ·{" "}
                  {r.itemCount} {r.itemCount === 1 ? "línea" : "líneas"}
                </span>
              </span>
              <ChevronRight
                className="size-5 shrink-0 text-muted-foreground"
                aria-hidden
              />
            </Link>
            <DeleteReceiptButton receiptId={r.id} iconOnly />
          </li>
        ))}
      </ul>
    </section>
  );
}
