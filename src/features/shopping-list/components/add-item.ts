"use client";

import { toast } from "sonner";

import { formatQuantity } from "@/lib/units";
import type { UnitType } from "@/lib/supabase/types";
import {
  addListItemAction,
  addProductToListAction,
  type ActionState,
} from "../actions";

/** Alta que el usuario dispara desde el input o un chip. */
export type AddInput =
  | {
      kind: "free";
      name: string;
      quantity: number | null;
      unit: UnitType | null;
    }
  | {
      kind: "product";
      productId: string;
      name: string;
      quantity: number | null;
      unit: UnitType | null;
    };

/** Ejecuta el alta contra el servidor (texto libre o producto del catálogo). */
export function runAddAction(input: AddInput): Promise<ActionState> {
  if (input.kind === "free") {
    const fd = new FormData();
    fd.set("name", input.name);
    if (input.quantity != null) fd.set("quantity", String(input.quantity));
    if (input.unit) fd.set("unit", input.unit);
    return addListItemAction({}, fd);
  }
  return addProductToListAction(input.productId, input.quantity, input.unit);
}

/** Toasts informativos comunes tras un alta (aviso de inventario y fusión L3). */
export function showAddResultToast(result: ActionState) {
  if (result.warning) toast.warning(result.warning);
  if (result.merged) {
    const m = result.merged;
    const qtyText =
      m.quantity != null
        ? ` → ${formatQuantity(m.quantity, m.unit ?? "ud")}`
        : "";
    toast.info(`${m.name} ya estaba en la lista${qtyText}`);
  }
}
