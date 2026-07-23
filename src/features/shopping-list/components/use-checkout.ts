"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { checkoutAction } from "../actions";

/**
 * Lógica de "Finalizar compra" compartida por la CheckoutBar de `/lista` y el
 * footer del modo compra (L7). Vuelca lo marcado al inventario y redirige a la
 * revisión de caducidades; si no hay ids, `exitTo` decide si navegar a otra
 * ruta (modo compra → `/lista`) o solo refrescar (quedarse en `/lista`).
 */
export function useCheckout(exitTo?: string) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function checkout() {
    startTransition(async () => {
      const r = await checkoutAction();
      if (r?.error) {
        toast.error(r.error);
        return;
      }
      toast.success(
        `${r.added} producto${r.added === 1 ? "" : "s"} añadido${
          r.added === 1 ? "" : "s"
        } al inventario`,
      );
      const ids = r.inventoryItemIds ?? [];
      if (ids.length > 0) {
        router.push(`/inventario/revision?items=${ids.join(",")}`);
      } else if (exitTo) {
        router.push(exitTo);
      } else {
        router.refresh();
      }
    });
  }

  return { checkout, pending };
}
