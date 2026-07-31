"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Check, Minus, Plus, ShoppingCart } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ProductIcon } from "@/components/product-icon";
import { cn } from "@/lib/utils";
import { useSwipeAction } from "@/hooks/use-swipe-action";
import { expiryLabel, getExpiryStatus } from "@/lib/dates";
import {
  contentTotalLabel,
  formatQuantity,
  formatQuantityValue,
  quantityStep,
  roundQuantity,
  stepLabel,
} from "@/lib/units";
import {
  addProductToListAction,
  removeProductFromListAction,
  restoreListItemAction,
} from "@/features/shopping-list/actions";
import type { Category, InventoryEntry } from "../queries";
import { getInventoryStatus } from "../status";
import { setInventoryQuantityAction } from "../actions";
import { EditItemDrawer } from "./edit-item-drawer";

export function InventoryItemCard({
  entry,
  categories,
  householdChains = [],
  onList = false,
  pinned = false,
}: {
  entry: InventoryEntry;
  categories: Category[];
  /** Tiendas habituales del hogar: ordenan el selector de tienda preferida. */
  householdChains?: string[];
  /** El producto ya está en la lista de la compra activa. */
  onList?: boolean;
  /** El producto está en "Mis habituales" del usuario actual (E5). */
  pinned?: boolean;
}) {
  const [qty, setQty] = useState(entry.quantity);
  const [serverQty, setServerQty] = useState(entry.quantity);
  const [editing, setEditing] = useState(false);
  // «Está en la lista» lo sabe el servidor (`onList`), pero el botón lo cambia
  // sin recargar la página: este override manda hasta que llega un valor nuevo.
  // null = lo que diga el servidor.
  const [listOverride, setListOverride] = useState<boolean | null>(null);
  const [serverOnList, setServerOnList] = useState(onList);
  const [, startTransition] = useTransition();
  const [listBusy, startListWork] = useTransition();
  // Ref para que clics rápidos consecutivos acumulen (evita el closure obsoleto).
  const qtyRef = useRef(entry.quantity);

  // Sincroniza el estado local cuando el servidor devuelve un valor nuevo
  // (patrón de ajuste de estado en render, no en efecto).
  if (serverQty !== entry.quantity) {
    setServerQty(entry.quantity);
    setQty(entry.quantity);
  }

  // Igual con la lista: cuando el servidor trae un valor nuevo manda él y el
  // override local se retira (si no, quitar aquí y volver a apuntarlo desde
  // `/lista` dejaría la tarjeta diciendo lo contrario de lo que hay).
  if (serverOnList !== onList) {
    setServerOnList(onList);
    setListOverride(null);
  }

  // El ref (para acumular clics rápidos) se sincroniza en un efecto, no en
  // render.
  useEffect(() => {
    qtyRef.current = entry.quantity;
  }, [entry.quantity]);

  function changeBy(delta: number) {
    const next = Math.max(0, roundQuantity(qtyRef.current + delta));
    qtyRef.current = next;
    setQty(next);
    startTransition(async () => {
      const result = await setInventoryQuantityAction(entry.id, next);
      if (result?.error) {
        toast.error(result.error);
        qtyRef.current = entry.quantity;
        setQty(entry.quantity);
      }
    });
  }

  // El botón y el interruptor se desactivan mientras la escritura viaja, pero el
  // gesto no tiene estado desactivado: sin esta guarda, deslizar y tocar dos
  // veces seguidas apuntaba el producto DOS veces, y el alta se fusiona con lo
  // que ya hay (L3), así que acababas con «2» en la lista sin haberlo pedido.
  function addToList() {
    if (listBusy) return;
    startListWork(async () => {
      const result = await addProductToListAction(entry.productId);
      if (result?.error) {
        toast.error(result.error);
      } else {
        setListOverride(true);
        toast.success(`${entry.productName} en la lista de la compra`);
      }
    });
  }

  function removeFromList() {
    if (listBusy) return;
    startListWork(async () => {
      const result = await removeProductFromListAction(entry.productId);
      if (result?.error) {
        // Lo más probable: ya está marcado en la compra. La tarjeta se queda
        // como está, porque «En la lista» sigue siendo verdad.
        toast.error(result.error);
        return;
      }
      setListOverride(false);
      const snapshot = result.deleted;
      toast(`${entry.productName} fuera de la lista`, {
        duration: 5000,
        // Deshacer restaura la fila tal cual (cantidad, posición y quién la
        // apuntó); volver a pulsar el botón añadiría una unidad y punto.
        action: snapshot
          ? {
              label: "Deshacer",
              onClick: () => {
                setListOverride(true);
                restoreListItemAction(snapshot).then((res) => {
                  if (res?.error) {
                    toast.error(res.error);
                    setListOverride(false);
                  }
                });
              },
            }
          : undefined,
      });
    });
  }

  const expiry = getExpiryStatus(entry.expiryDate);
  // Estado desde el helper compartido (misma clasificación que chips/página),
  // con la cantidad EN VIVO del stepper.
  const status = getInventoryStatus({
    quantity: qty,
    expiryDate: entry.expiryDate,
    useSoon: entry.useSoon,
    minQuantity: entry.minQuantity,
  });
  // El stepper existe para TODA unidad: a granel el paso es el de compra
  // (¼ kg, ½ l, 100 g/ml) en vez de 1, que en gramos no significaba nada.
  const step = quantityStep(entry.unit);
  const stepName = stepLabel(entry.unit);
  // Contenido total cuando el producto declara lo que trae cada unidad: "3 ud"
  // es lo que cuentas, "1,5 l" es lo que de verdad tienes en casa.
  const contentTotal = contentTotalLabel(
    qty,
    entry.unit,
    entry.contentSize !== null && entry.contentUnit !== null
      ? {
          size: entry.contentSize,
          unit: entry.contentUnit,
          estimate: entry.contentIsEstimate,
        }
      : null,
  );
  const emptied = status.out;
  const inList = listOverride ?? onList;
  // El `aria-label` del botón SUSTITUYE a su contenido, así que todo lo que
  // dicen los badges (y el carrito) hay que repetirlo aquí o no existe para un
  // lector de pantalla: hasta ahora se oía «Editar leche, botón» y ni una
  // palabra de que estaba caducada. La cantidad no entra —el stepper ya la
  // anuncia en su propia región `aria-live`— y «en la lista» solo cuando queda
  // algo, porque en agotado lo dice el botón del pie con su propio texto.
  const stateLabel = [
    emptied ? "agotado" : null,
    expiry ? expiryLabel(expiry.days).toLowerCase() : null,
    status.low ? "quedan pocas" : null,
    entry.useSoon ? "consumir pronto" : null,
    inList && !emptied ? "en la lista de la compra" : null,
  ]
    .filter(Boolean)
    .join(", ");

  // Deslizar la tarjeta a la DERECHA la apunta en la lista (o la quita), y lo
  // hace AL SOLTAR: sin botón que tocar después. Espejado respecto a `/lista`,
  // donde se arrastra a la izquierda para quitar: lo que se entrena comprando es
  // el reflejo, y el mismo movimiento no puede añadir aquí y borrar allí. El
  // atajo sirve sobre todo para lo que AÚN no se ha agotado —apuntar el café
  // cuando ves que queda poco—, y se usa en ráfaga bajando por la despensa, así
  // que un toque de confirmación por producto era la mitad del trabajo; lo peor
  // que puede pasar es apuntar algo de más, y eso se deshace con el mismo gesto.
  // Con ratón no existe: en escritorio esto se hace con el interruptor de la
  // ficha.
  const { armed, swipeProps, actionProps } = useSwipeAction(
    inList ? removeFromList : addToList,
    { direction: "right", instant: true },
  );

  return (
    <>
      <div
        className="relative overflow-hidden rounded-xl"
        // Safari no recorta al border-radius del padre cuando un hijo usa
        // transform (bleed de las esquinas del fondo al deslizar); esta máscara
        // fuerza el clip correcto sin afectar a otros navegadores.
        style={{ WebkitMaskImage: "-webkit-radial-gradient(white, black)" }}
      >
        {/* Lo de detrás no es un fondo decorativo: es lo que va a pasar cuando
            sueltes. No se puede tocar (`inert`, lo pone el hook) ni lo anuncia un
            lector de pantalla, porque la acción está en el gesto y, con teclado o
            ratón, en el interruptor de la ficha. Rojo cuando quita, para que
            «rojo = fuera de la lista» signifique lo mismo aquí que en `/lista`.
            El icono es SIEMPRE el carrito, nunca una papelera: esto no borra el
            producto del inventario, solo lo saca de la lista de la compra, y una
            papelera en la tarjeta de un producto se lee como «bórralo». */}
        <button
          {...actionProps}
          className={cn(
            // Mismo formato que el botón de `/lista` (fila, texto e icono del
            // mismo tamaño): son el mismo gesto en dos pantallas.
            "absolute inset-y-0 left-0 flex items-center justify-center gap-1.5 text-sm font-medium",
            inList
              ? "bg-destructive text-destructive-foreground"
              : "bg-success text-success-foreground",
          )}
        >
          {/* Apagado mientras el gesto se queda corto y en tamaño completo en
              cuanto pasa el umbral: es lo que dice «suelta ya», a la vez que el
              tic en el dedo, para quien SÍ está mirando la pantalla. */}
          <span
            className={cn(
              "flex items-center gap-1.5 transition duration-150 motion-reduce:transition-none",
              armed ? "scale-105 opacity-100" : "scale-95 opacity-60",
            )}
          >
            <ShoppingCart className="size-4" aria-hidden />
            {inList ? "Quitar" : "A la lista"}
          </span>
        </button>
        {/* `h-full` es obligatorio, no cosmético: el ítem de la rejilla es ahora
            el envoltorio del gesto, y se estira a la altura de la fila (ver
            `InventorySection`). Sin esto, la tarjeta se queda en su alto de
            contenido y el botón —que sí ocupa el envoltorio entero— se ve por
            debajo: 24 px de verde asomando en toda tarjeta de una línea que
            comparta fila con una de dos. Además devuelve las tarjetas a la misma
            altura por fila, que es como se veían antes del gesto. */}
        <div className="h-full rounded-xl border bg-card" {...swipeProps}>
          <div className="flex items-center gap-3 p-3">
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="flex min-w-0 flex-1 items-start gap-3 text-left"
              aria-label={
                stateLabel
                  ? `Editar ${entry.productName}, ${stateLabel}`
                  : `Editar ${entry.productName}`
              }
            >
              {/* Icono del producto: grande, dentro de la tarjeta, arriba a la
                  izquierda (sin caja). Decorativo. */}
              <ProductIcon
                slug={entry.productIcon}
                name={entry.productName}
                categoryIcon={entry.categoryIcon}
                size={32}
                className={cn("shrink-0", emptied && "opacity-50")}
              />
              <span className="min-w-0 flex-1">
                <span
                  className={cn(
                    "block font-medium break-words line-clamp-2",
                    emptied && "text-muted-foreground",
                  )}
                >
                  {entry.productName}
                </span>
                <span className="mt-0.5 flex flex-wrap items-center gap-1.5">
                  {/* Agotado NO va en la escala de caducidad. El tinte de esta
                      fila significa frescura —rojo caducado, ámbar caduca
                      pronto, verde le quedan días—, y «agotado» no es una fecha:
                      es que hay cero. Con el mismo ámbar que «caduca pronto» y
                      «consumir pronto», una tarjeta vacía se leía como comida a
                      punto de echarse a perder. Neutro (`outline`, que es lo que
                      el styleguide fija para sin stock) lo saca de la escala: se
                      distingue de los tres tintes por FORMA —borde y sin
                      relleno—, no por matiz, y acompaña al icono y al nombre,
                      que ya se apagan al vaciarse. Que hay que comprarlo lo dice
                      el botón del pie, que además se puede tocar. */}
                  {emptied ? (
                    <Badge variant="outline">Agotado</Badge>
                  ) : (
                    <span className="text-sm text-muted-foreground">
                      {formatQuantity(qty, entry.unit)}
                      {contentTotal ? ` · ${contentTotal}` : null}
                    </span>
                  )}
                  {expiry ? (
                    <Badge
                      className={cn(
                        "border-transparent",
                        expiry.status === "expired" &&
                          "bg-destructive/15 text-destructive",
                        expiry.status === "soon" && "bg-warning/15 text-warning",
                        expiry.status === "ok" && "bg-success/15 text-success",
                      )}
                    >
                      {expiryLabel(expiry.days)}
                    </Badge>
                  ) : null}
                  {status.low ? (
                    <Badge className="border-transparent bg-warning/15 text-warning">
                      Quedan pocas
                    </Badge>
                  ) : null}
                  {entry.useSoon ? (
                    <Badge className="border-transparent bg-warning/15 text-warning">
                      Consumir pronto
                    </Badge>
                  ) : null}
                  {/* «Ya lo llevas apuntado», a la vista sin abrir la ficha.
                      Antes solo se sabía en agotado (el botón del pie) o abriendo
                      la ficha, así que recorriendo el inventario para hacer la
                      compra no había manera de ver qué habías apuntado ya: o lo
                      apuntabas dos veces (y L3 lo fusiona, o sea que acababas
                      con «2») o te ibas a `/lista` a comprobarlo.
                      Un carrito suelto, no un badge más, por dos motivos: esta
                      fila habla del estado del producto y esto no es un estado
                      suyo, y `primary` es casi el mismo verde que `success`, así
                      que un pill verde con carrito se confundiría con el «caduca
                      en 5 días». Un glifo junto a un pill no se confunde con él.
                      El carrito y el verde son los mismos que dicen «en la
                      lista» en el interruptor de la ficha y en el selector de
                      `/lista`. En agotado no se pinta: el botón del pie ya lo
                      dice con palabras a dos centímetros. Lo oye un lector de
                      pantalla por `stateLabel` (el `aria-label` del botón tapa
                      lo de dentro, un `sr-only` aquí no se leería). */}
                  {inList && !emptied ? (
                    <ShoppingCart
                      aria-hidden
                      className="size-3.5 shrink-0 text-primary"
                    />
                  ) : null}
                </span>
              </span>
            </button>

            <div className="flex shrink-0 items-center gap-1">
              <Button
                variant="outline"
                size="icon"
                aria-label={`Quitar ${stepName} de ${entry.productName}`}
                onClick={() => changeBy(-step)}
                disabled={qty <= 0}
              >
                <Minus aria-hidden />
              </Button>
              <span
                className="min-w-8 text-center text-sm font-semibold tabular-nums"
                aria-live="polite"
              >
                {/* La key remonta solo el número: pequeño "pop" al cambiar sin
                    reemplazar la región aria-live. */}
                <span
                  key={qty}
                  className="inline-block animate-in zoom-in-50 duration-150"
                >
                  {formatQuantityValue(qty)}
                </span>
              </span>
              <Button
                variant="outline"
                size="icon"
                aria-label={`Añadir ${stepName} de ${entry.productName}`}
                onClick={() => changeBy(step)}
              >
                <Plus aria-hidden />
              </Button>
            </div>
          </div>

          {emptied ? (
            <div className="border-t p-2">
              {/* UN botón de dos estados: lo que apunta el producto es lo que lo
                  quita. «En la lista» era antes un rótulo muerto, así que un toque
                  por error solo se deshacía yéndose a `/lista` a buscarlo.
                  El rótulo dice lo que hay Y lo que hace el toque —igual que
                  «Cocinado · deshacer» del menú— en vez de un `aria-label` que
                  contradiga el texto visible (WCAG 2.5.3). */}
              <Button
                variant={inList ? "secondary" : "outline"}
                className="w-full"
                onClick={inList ? removeFromList : addToList}
                loading={listBusy}
                aria-pressed={inList}
              >
                {inList ? <Check aria-hidden /> : <ShoppingCart aria-hidden />}
                {inList ? "En la lista · quitar" : "Añadir a la lista"}
              </Button>
            </div>
          ) : null}
        </div>
      </div>

      <EditItemDrawer
        entry={{ ...entry, quantity: qty }}
        categories={categories}
        householdChains={householdChains}
        open={editing}
        onOpenChange={setEditing}
        pinned={pinned}
        onList={inList}
        onToggleList={(next) => (next ? addToList() : removeFromList())}
        listBusy={listBusy}
      />
    </>
  );
}
