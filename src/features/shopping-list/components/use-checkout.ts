"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { checkoutAction } from "../actions";
import { safeAction } from "@/lib/action-error";

/**
 * Lógica de "Finalizar compra" compartida por la CheckoutBar de `/lista` y el
 * footer del modo compra (L7). Vuelca lo marcado al inventario y redirige a la
 * revisión de caducidades; si no hay ids, `exitTo` decide si navegar a otra
 * ruta (modo compra → `/lista`) o solo refrescar (quedarse en `/lista`).
 *
 * `origen=lista` distingue esta entrada a la revisión de la que llega tras
 * confirmar un ticket: solo aquí tiene sentido ofrecer escanearlo (quien viene
 * de un ticket ya lo ha hecho).
 */
export function useCheckout(exitTo?: string) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function checkout() {
    startTransition(async () => {
      const r = await safeAction(
        checkoutAction(),
        "No se pudo finalizar la compra.",
      );
      if (r?.error) {
        toast.error(r.error);
        return;
      }
      // Conflictos de unidad o líneas que no llegaron al inventario: la compra
      // se cierra igual, pero esto no puede pasar en silencio.
      if (r.warning) toast.warning(r.warning, { duration: 8000 });
      toast.success(
        `${r.added} producto${r.added === 1 ? "" : "s"} añadido${
          r.added === 1 ? "" : "s"
        } al inventario`,
      );
      const ids = r.inventoryItemIds ?? [];
      if (ids.length > 0) {
        router.push(
          `/inventario/revision?items=${ids.join(",")}&origen=lista`,
        );
      } else if (exitTo) {
        router.push(exitTo);
      } else {
        router.refresh();
      }
    });
  }

  return { checkout, pending };
}
