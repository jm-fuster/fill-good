"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, Store } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { CHAIN_OPTIONS } from "@/features/prices/chains";

import { updatePreferredChainsAction } from "../actions";

/**
 * Editor de los supermercados habituales del hogar (L15 f4).
 *
 * Dos estados posibles y un solo control para ambos:
 * - Sin configurar (`configured` vacío): se muestran marcadas las cadenas
 *   DEDUCIDAS de los tickets, con su distintivo. La pantalla no obliga a nada.
 * - Configurado: manda lo marcado, y "deducir otra vez" borra la configuración.
 *
 * Guarda al tocar (sin botón de guardar, como el editor de orden de la tienda):
 * es un ajuste de una sola dimensión y reversible de un toque.
 */
export function StoreChainsEditor({
  configured,
  detected,
}: {
  /** Cadenas elegidas a mano. Vacío = sin configurar (manda lo deducido). */
  configured: string[];
  /** Cadenas vistas en los tickets recientes del hogar. */
  detected: string[];
}) {
  const router = useRouter();
  const isAuto = configured.length === 0;
  const detectedSet = new Set(detected);

  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(isAuto ? detected : configured),
  );
  // Resincronización con el servidor (mismo patrón que el resto de formularios
  // controlados del repo): si la fuente cambia, el estado local se rinde.
  const serverKey = `${configured.join(",")}|${detected.join(",")}`;
  const [seenKey, setSeenKey] = useState(serverKey);
  if (seenKey !== serverKey) {
    setSeenKey(serverKey);
    setSelected(new Set(isAuto ? detected : configured));
  }

  // Cola de escrituras: cada toque manda la lista COMPLETA, así que dos toques
  // seguidos que se cruzaran dejarían ganar al primero. Serializándolas, el
  // último toque es siempre el último guardado.
  const queueRef = useRef<Promise<unknown>>(Promise.resolve());
  function commit(next: string[]) {
    queueRef.current = queueRef.current
      .catch(() => {})
      .then(() => updatePreferredChainsAction(next))
      .then((result) => {
        if (result?.error) {
          toast.error(result.error);
          router.refresh();
        }
      })
      .catch(() => {
        toast.error("No se pudieron guardar tus tiendas. Comprueba tu conexión.");
        router.refresh();
      });
  }

  function toggle(chain: string, checked: boolean) {
    const next = new Set(selected);
    if (checked) next.add(chain);
    else next.delete(chain);

    // Quedarse sin ninguna ES el estado automático, así que en cuanto se
    // desmarca la última volvemos a mostrar las deducidas: si desaparecieran
    // todas las marcas parecería que se ha perdido el ajuste.
    if (next.size === 0) {
      setSelected(new Set(detected));
      commit([]);
      if (detected.length > 0) {
        toast.info("Sin ninguna marcada, volvemos a deducirlas de tus tickets");
      }
      return;
    }

    setSelected(next);
    commit([...next]);
  }

  function resetToDetected() {
    setSelected(new Set(detected));
    commit([]);
    toast.success("Volvemos a deducirlas de tus tickets");
  }

  return (
    <div className="flex flex-col gap-4">
      <ul className="divide-y rounded-xl bg-card ring-1 ring-foreground/10">
        {CHAIN_OPTIONS.map((chain) => {
          const id = `chain-${chain.value}`;
          const checked = selected.has(chain.value);
          return (
            <li
              key={chain.value}
              className="flex min-h-14 items-center gap-3 px-4 py-3"
            >
              <Checkbox
                id={id}
                checked={checked}
                onCheckedChange={(v) => toggle(chain.value, v === true)}
                className="size-5"
              />
              <Label
                htmlFor={id}
                className="flex flex-1 cursor-pointer flex-wrap items-center gap-2 text-sm font-medium"
              >
                {chain.label}
                {isAuto && detectedSet.has(chain.value) ? (
                  <Badge variant="secondary" className="gap-1 font-normal">
                    <Sparkles className="size-3" aria-hidden />
                    En tus tickets
                  </Badge>
                ) : null}
              </Label>
            </li>
          );
        })}
      </ul>

      <div className="flex flex-col gap-3 rounded-xl border border-dashed p-4">
        <p className="flex items-start gap-2 text-sm text-muted-foreground text-pretty">
          <Store className="mt-0.5 size-4 shrink-0" aria-hidden />
          {isAuto ? (
            detected.length > 0 ? (
              <span>
                Ahora mismo se deducen de tus tickets. Si marcas o desmarcas
                algo, pasas a decidirlo tú.
              </span>
            ) : (
              <span>
                Aún no hay tickets escaneados de los que deducirlas. Marca tus
                tiendas o escanea una compra y lo haremos por ti.
              </span>
            )
          ) : (
            <span>
              Las eliges tú. Si las desmarcas todas, volvemos a deducirlas de tus
              tickets.
            </span>
          )}
        </p>
        {!isAuto && detected.length > 0 ? (
          <Button
            type="button"
            variant="outline"
            className="self-start"
            onClick={resetToDetected}
          >
            <Sparkles aria-hidden />
            Deducirlas de mis tickets
          </Button>
        ) : null}
      </div>
    </div>
  );
}
