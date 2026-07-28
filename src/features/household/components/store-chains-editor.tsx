"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Sparkles, Store, X } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  CHAIN_NAME_MAX,
  CHAIN_OPTIONS,
  chainSlug,
  isCustomChain,
} from "@/features/prices/chains";

import { addCustomChainAction, updatePreferredChainsAction } from "../actions";

/**
 * Editor de los supermercados del hogar (L15 f4 + f5).
 *
 * Dos estados posibles y un solo control para ambos:
 * - Sin configurar (`configured` vacío): se muestran marcadas las cadenas
 *   DEDUCIDAS de los tickets, con su distintivo. La pantalla no obliga a nada.
 * - Configurado: manda lo marcado, y "deducirlas otra vez" borra la elección.
 *
 * Las ocho cadenas conocidas son casillas (dentro/fuera de la lista). Las
 * TIENDAS PROPIAS van en su propio bloque con un botón de quitar en vez de
 * casilla: existen porque el hogar las ha escrito, así que "desmarcada" y
 * "borrada" serían el mismo estado y una casilla solo despistaría.
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

  const [newName, setNewName] = useState("");
  const [addError, setAddError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

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

  /**
   * Guarda una selección nueva. Quedarse sin ninguna ES el estado automático, así
   * que al quitar la última volvemos a mostrar las deducidas y se explica por
   * qué: si no, la fila reaparecería sola y parecería que no se ha guardado.
   */
  function applySelection(next: Set<string>, doneMessage?: string) {
    if (next.size === 0 && detected.length > 0) {
      setSelected(new Set(detected));
      commit([]);
      toast.info("Sin ninguna marcada, volvemos a deducirlas de tus tickets");
      return;
    }
    setSelected(next);
    commit([...next]);
    if (doneMessage) toast.success(doneMessage);
  }

  function toggle(chain: string, checked: boolean) {
    const next = new Set(selected);
    if (checked) next.add(chain);
    else next.delete(chain);
    applySelection(next);
  }

  function resetToDetected() {
    setSelected(new Set(detected));
    commit([]);
    toast.success("Volvemos a deducirlas de tus tickets");
  }

  async function addCustom(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = newName.trim();
    if (!name) return;
    setAdding(true);
    setAddError(null);
    // La lista de delante viaja como base: en modo automático son las deducidas,
    // y añadir una tienda propia las convierte en elección del hogar.
    const result = await addCustomChainAction(name, [...selected]);
    setAdding(false);
    if (result.error) {
      setAddError(result.error);
      return;
    }
    // Optimista: la fila aparece ya. El valor que manda es el que canoniza el
    // servidor, y la resincronización corrige cualquier diferencia (espacios).
    setSelected(new Set([...selected, name]));
    setNewName("");
    toast.success(`${name} añadida a tus tiendas`);
  }

  function removeCustom(chain: string) {
    const next = new Set(selected);
    next.delete(chain);
    applySelection(next, `${chain} quitada de tus tiendas`);
  }

  const customChains = [...selected].filter(isCustomChain);

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-2">
        <h2 className="px-1 text-sm font-medium text-muted-foreground">
          Cadenas conocidas
        </h2>
        <ul className="divide-y rounded-xl bg-card ring-1 ring-foreground/10">
          {CHAIN_OPTIONS.map((chain) => {
            const id = `chain-${chainSlug(chain.value)}`;
            return (
              <li
                key={chain.value}
                className="flex min-h-14 items-center gap-3 px-4 py-3"
              >
                <Checkbox
                  id={id}
                  checked={selected.has(chain.value)}
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
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="px-1 text-sm font-medium text-muted-foreground">
          Tus tiendas
        </h2>
        {customChains.length > 0 ? (
          <ul className="divide-y rounded-xl bg-card ring-1 ring-foreground/10">
            {customChains.map((chain) => (
              <li
                key={chain}
                className="flex min-h-14 items-center gap-3 px-4 py-3"
              >
                <Store
                  className="size-5 shrink-0 text-muted-foreground"
                  aria-hidden
                />
                <span className="min-w-0 flex-1 text-sm font-medium break-words">
                  {chain}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Quitar ${chain}`}
                  onClick={() => removeCustom(chain)}
                >
                  <X aria-hidden />
                </Button>
              </li>
            ))}
          </ul>
        ) : null}

        <form onSubmit={addCustom} className="flex flex-col gap-2">
          <Label htmlFor="new-chain" className="px-1 text-sm font-normal">
            Añade la tuya si no está arriba (Gadis, Ahorramás, BonÀrea…)
          </Label>
          <div className="flex items-start gap-2">
            <Input
              id="new-chain"
              value={newName}
              onChange={(e) => {
                setNewName(e.target.value);
                setAddError(null);
              }}
              maxLength={CHAIN_NAME_MAX}
              autoComplete="off"
              placeholder="Nombre de la tienda"
              aria-invalid={addError !== null}
              aria-describedby={addError ? "new-chain-error" : undefined}
            />
            <Button type="submit" variant="outline" loading={adding}>
              <Plus aria-hidden />
              Añadir
            </Button>
          </div>
          {addError ? (
            <p
              id="new-chain-error"
              role="alert"
              className="px-1 text-sm text-destructive"
            >
              {addError}
            </p>
          ) : null}
        </form>
      </section>

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
              Las eliges tú. Si las quitas todas, volvemos a deducirlas de tus
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
