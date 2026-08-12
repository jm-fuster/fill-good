"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { RotateCcw } from "lucide-react";
import { toast } from "sonner";

import { safeAction } from "@/lib/action-error";

import { Button } from "@/components/ui/button";
import { ChainChip } from "@/components/chain-chip";
import { chainLabel, orderChains } from "@/features/prices/chains";
import {
  categoriesInChainOrder,
  hasOwnAisleOrder,
  type ChainAisleOrders,
} from "../aisle-order";
import type { StoreCategory } from "../queries";
import { resetChainOrderAction } from "../actions";
import { StoreOrderEditor } from "./store-order-editor";

/**
 * Orden de pasillos con dos caras, según quién lo monte:
 *
 * - En Ajustes con `stores`: conmutador "General + una tienda por chip". El orden
 *   de cada tienda NACE copiando el general, así que entrar en una tienda nueva no
 *   enseña una lista revuelta: enseña la de siempre para corregir dos pasillos.
 * - En el modo compra sin `stores`: edita directamente el orden de `chain` (la
 *   tienda del viaje), sin conmutador — allí la tienda ya está elegida arriba.
 *
 * El conmutador solo aparece con DOS tiendas o más: con una, "su" orden y el
 * general serían lo mismo y la elección sería una pregunta sin respuesta útil.
 */
export function AisleOrderPanel({
  categories,
  orders,
  stores = [],
  chain = null,
}: {
  /** Categorías en el orden GENERAL del hogar. */
  categories: StoreCategory[];
  orders: ChainAisleOrders;
  /** Tiendas del hogar entre las que alternar; vacío = sin conmutador. */
  stores?: string[];
  /** Objetivo cuando no hay conmutador: tienda, o null para el orden general. */
  chain?: string | null;
}) {
  const router = useRouter();
  const labelId = useId();
  const [target, setTarget] = useState<string | null>(chain);
  const [resetting, setResetting] = useState(false);

  // El objetivo fijo puede cambiar mientras el panel sigue montado (en el modo
  // compra, al cambiar de tienda con el sheet cerrado): si cambia, el estado
  // local se rinde, como el resto de formularios controlados del repo.
  const [seenChain, setSeenChain] = useState(chain);
  if (seenChain !== chain) {
    setSeenChain(chain);
    setTarget(chain);
  }

  const showSwitcher = stores.length >= 2;
  const ownOrder = target ? orders[target] : undefined;
  const ordered = categoriesInChainOrder(categories, ownOrder);
  const hasOwn = hasOwnAisleOrder(orders, target);

  async function resetToGeneral() {
    if (!target) return;
    setResetting(true);
    const result = await safeAction(
      resetChainOrderAction(target),
      "No se pudo restablecer el orden.",
    );
    setResetting(false);
    if (result.error) {
      toast.error(result.error);
      router.refresh();
      return;
    }
    toast.success(`${chainLabel(target)} vuelve a tu orden general`);
  }

  return (
    <div className="flex flex-col gap-4">
      {showSwitcher ? (
        <div className="flex flex-col gap-2">
          <p id={labelId} className="px-1 text-sm font-medium">
            Orden que editas
          </p>
          <div
            className="flex gap-2 overflow-x-auto pb-1"
            role="group"
            aria-labelledby={labelId}
          >
            <ChainChip
              label="General"
              active={target === null}
              onClick={() => setTarget(null)}
            />
            {orderChains(stores).map((store) => (
              <ChainChip
                key={store}
                label={chainLabel(store)}
                active={target === store}
                onClick={() => setTarget(store)}
              />
            ))}
          </div>
        </div>
      ) : null}

      <p className="px-1 text-sm text-muted-foreground text-pretty">
        {target === null ? (
          <>
            Es tu orden general: manda en la lista agrupada y en las tiendas que
            no tengan uno propio.
          </>
        ) : hasOwn ? (
          <>{chainLabel(target)} tiene su propio orden de pasillos.</>
        ) : (
          <>
            {chainLabel(target)} va con tu orden general. En cuanto muevas un
            pasillo, pasará a tener el suyo.
          </>
        )}
      </p>

      {/* `key`: cambiar de objetivo es empezar a editar otra cosa, así que el
          editor se remonta en vez de arrastrar el orden del anterior. */}
      <StoreOrderEditor
        key={target ?? "general"}
        categories={ordered}
        chain={target}
      />

      {target !== null && hasOwn ? (
        <Button
          type="button"
          variant="outline"
          className="self-start"
          loading={resetting}
          onClick={resetToGeneral}
        >
          <RotateCcw aria-hidden />
          Volver al orden general
        </Button>
      ) : null}
    </div>
  );
}
