"use client";

import { useMemo, useRef, useState } from "react";
import { Check, Plus, Search, ShoppingCart, Sparkles, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ResponsiveModalFooter } from "@/components/ui/responsive-modal";
import { ProductIcon } from "@/components/product-icon";
import { cn } from "@/lib/utils";
import { normalizeName } from "@/lib/normalize";
import { parseQuantityFromText } from "@/lib/parse-quantity";
import {
  effectivePackSize,
  formatPurchaseQuantity,
} from "@/lib/units";
import type { UnitType } from "@/lib/supabase/types";
import type { CatalogProduct, Suggestion } from "../queries";
import type { AddListItemsInput } from "../schemas";
import { addListItemsAction, type BulkAddState } from "../actions";
import { suggestionReasonShort } from "../suggestion-reason";

/** Producto nuevo escrito en el buscador, pendiente de crearse al confirmar. */
type NewItem = { name: string; quantity: number | null; unit: UnitType | null };

/** Un bloque de fichas: un pasillo del catálogo, o las sugerencias arriba. */
type PickerGroup = {
  key: string;
  title: string;
  /** Emoji o slug de la cabecera; null en el bloque de sugerencias. */
  icon: string | null;
  /** Orden del pasillo en el hogar; las sugerencias van delante de todos. */
  sort: number;
  products: CatalogProduct[];
};

/** Bloques que no son un pasillo: las sugerencias, arriba, y los resultados. */
const SUGGESTIONS_GROUP = "__sugerencias__";
const RESULTS_GROUP = "__resultados__";

/**
 * L17 — Selector de altas de la lista: el inventario entero a mano, se marca
 * todo lo que haga falta y entra de una vez.
 *
 * Sustituye al formulario de una-en-una que había arriba en `/lista` (y al que
 * abría el FAB del modo compra). Lo que aquel hacía bien —teclear y listo— sigue
 * aquí en el buscador: al pulsar Enter, si el nombre existe en el catálogo lo
 * marca, y si no, lo deja preparado para crearse. Lo que no hacía —montar la
 * compra de la semana sin teclear quince veces— es lo que añade la rejilla.
 *
 * Nada se escribe hasta «Añadir»: hasta entonces todo es selección, y por eso el
 * alta es una sola Server Action (`addListItemsAction`) y no una por ficha.
 */
export function AddItemsPicker({
  catalog,
  suggestions,
  onListProductIds,
  onDone,
}: {
  catalog: CatalogProduct[];
  suggestions: Suggestion[];
  /**
   * Ids de producto que ya están en la lista, para marcarlos. Llega como array y
   * no como Set porque cruza la frontera servidor→cliente.
   */
  onListProductIds: string[];
  /**
   * Cerrar el selector: el alta ya está guardada. Las filas nuevas llegan a la
   * lista por Realtime, así que quien abre esto no tiene que recargar nada —
   * solo, si quiere, pedir una relectura para que traigan pasillo y precio.
   */
  onDone: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [newItems, setNewItems] = useState<NewItem[]>([]);
  const [pending, setPending] = useState(false);

  const onList = useMemo(() => new Set(onListProductIds), [onListProductIds]);

  // Cantidad y motivo de lo que se sugiere: marcar «Leche» en el bloque de
  // sugerencias añade LA CANTIDAD SUGERIDA (la que cubre el déficit hasta el
  // mínimo), igual que hacía su fila en `/lista`, no una unidad por defecto.
  const suggested = useMemo(() => {
    const map = new Map<string, Suggestion>();
    for (const s of suggestions) map.set(s.productId, s);
    return map;
  }, [suggestions]);

  // L8: «2 leche» filtra por «leche» y, si hay que crearlo, se crea con cantidad 2.
  const parsed = useMemo(() => parseQuantityFromText(query), [query]);
  const filter = normalizeName(parsed.name);
  const searching = filter.length > 0;

  const groups = useMemo<PickerGroup[]>(() => {
    if (searching) {
      // Filtrando no hay pasillos: un único bloque con lo que casa, que es lo que
      // se está mirando. Sin tope: recortar en silencio en un buscador se lee
      // como «no lo tienes» y llevaría a crear un duplicado.
      return [
        {
          key: RESULTS_GROUP,
          title: "Resultados",
          icon: null,
          sort: 0,
          products: catalog.filter((p) => p.normalizedName.includes(filter)),
        },
      ];
    }

    const byCategory = new Map<string, PickerGroup>();
    for (const product of catalog) {
      // Lo sugerido va en su bloque de arriba y no se repite en su pasillo.
      if (suggested.has(product.id)) continue;
      const title = product.categoryName ?? "Otros";
      const group = byCategory.get(title);
      if (group) {
        group.products.push(product);
        continue;
      }
      byCategory.set(title, {
        key: title,
        title,
        icon: product.categoryIcon,
        sort: product.categorySort,
        products: [product],
      });
    }

    const aisles = [...byCategory.values()].sort(
      (a, b) => a.sort - b.sort || a.title.localeCompare(b.title, "es"),
    );

    // Lo que puede faltar, primero: es lo más probable que se marque, y en una
    // casa con catálogo grande estaría a varias pantallas de scroll.
    const suggestedProducts = suggestions
      .map((s) => catalog.find((p) => p.id === s.productId))
      .filter((p): p is CatalogProduct => Boolean(p));

    return suggestedProducts.length > 0
      ? [
          {
            key: SUGGESTIONS_GROUP,
            title: "Te puede faltar",
            icon: null,
            sort: -1,
            products: suggestedProducts,
          },
          ...aisles,
        ]
      : aisles;
  }, [catalog, searching, filter, suggestions, suggested]);

  // Nombre escrito que no existe en el catálogo: se puede crear desde aquí.
  const exactMatch = useMemo(
    () => catalog.find((p) => p.normalizedName === filter),
    [catalog, filter],
  );
  const alreadyQueued = newItems.some(
    (item) => normalizeName(item.name) === filter,
  );
  const canCreate = searching && !exactMatch && !alreadyQueued;

  // Qué cantidad se ha entendido del texto. Se dice porque el número escrito
  // desaparece del nombre al crearlo («2 yogures» → «yogures» × 2), y sin verlo
  // no hay forma de saber si se ha leído como cantidad o como parte del nombre.
  const createPreview =
    canCreate && parsed.quantity !== null
      ? formatPurchaseQuantity(parsed.quantity, parsed.unit, null)
      : null;

  function toggleProduct(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  /** Deja el foco en el buscador para poder encadenar sin cerrar el teclado. */
  function refocus() {
    inputRef.current?.focus();
  }

  function createFromQuery() {
    const name = parsed.name.trim();
    if (name.length === 0) return;
    setNewItems((prev) => [
      ...prev,
      { name, quantity: parsed.quantity, unit: parsed.unit },
    ]);
    setQuery("");
    refocus();
  }

  /**
   * Enter en el buscador: si lo que has escrito ya existe, lo marca; si no, lo
   * prepara para crearse. Nunca desmarca —repetir Enter sobre lo mismo no puede
   * deshacer lo que acabas de pedir— y nunca guarda: eso lo hace «Añadir».
   */
  function handleSearchSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!searching) return;
    if (exactMatch) {
      setSelected((prev) => new Set(prev).add(exactMatch.id));
      setQuery("");
      refocus();
      return;
    }
    if (canCreate) createFromQuery();
  }

  const total = selected.size + newItems.length;

  async function submit() {
    if (total === 0 || pending) return;
    const entries: AddListItemsInput = [
      ...newItems.map((item) => ({
        kind: "free" as const,
        name: item.name,
        quantity: item.quantity,
        unit: item.unit,
      })),
      ...[...selected].map((id) => ({
        kind: "product" as const,
        productId: id,
        quantity: suggested.get(id)?.suggestedQuantity ?? null,
      })),
    ];

    setPending(true);
    try {
      const result = await addListItemsAction(entries);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(resultLabel(result));
      onDone();
    } catch {
      toast.error(
        "No se pudo añadir. Comprueba tu conexión e inténtalo de nuevo.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col px-4">
      {/* Buscador pegado arriba: al recorrer un catálogo largo sigue a la vista,
          que es lo que permite cambiar de idea y filtrar sin volver al principio. */}
      <form
        onSubmit={handleSearchSubmit}
        className="sticky top-0 z-10 -mx-4 flex flex-col gap-1.5 border-b bg-popover px-4 pb-3"
      >
        <Label htmlFor="picker-search">Buscar o crear producto</Label>
        <div className="relative">
          <Search
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            ref={inputRef}
            id="picker-search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Leche, 2 yogures, tomates 1 kg…"
            autoComplete="off"
            maxLength={120}
            className="pr-9 pl-9"
          />
          {query ? (
            <button
              type="button"
              onClick={() => {
                setQuery("");
                refocus();
              }}
              aria-label="Borrar búsqueda"
              className="absolute top-1/2 right-1 flex size-9 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:text-foreground"
            >
              <X aria-hidden className="size-4" />
            </button>
          ) : null}
        </div>
      </form>

      <div className="flex flex-col gap-5 py-4">
        {/* Productos nuevos en cola. Van arriba porque son los que el usuario no
            puede volver a encontrar en la rejilla: no existen todavía. */}
        {newItems.length > 0 ? (
          <section className="flex flex-col gap-2">
            <h3 className="text-sm font-medium text-muted-foreground">
              Nuevos ({newItems.length})
            </h3>
            <div className="flex flex-wrap gap-2">
              {newItems.map((item, index) => (
                <span
                  key={`${item.name}-${index}`}
                  className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-primary bg-primary px-3 py-2 text-sm font-medium text-primary-foreground"
                >
                  <Plus className="size-4 shrink-0" aria-hidden />
                  {item.name}
                  {item.quantity !== null ? (
                    <span className="tabular-nums opacity-80">
                      {formatPurchaseQuantity(item.quantity, item.unit, null)}
                    </span>
                  ) : null}
                  <button
                    type="button"
                    aria-label={`Quitar ${item.name}`}
                    onClick={() =>
                      setNewItems((prev) => prev.filter((_, i) => i !== index))
                    }
                    className="-mr-1 flex size-6 items-center justify-center rounded-md hover:bg-primary-foreground/20"
                  >
                    <X className="size-4" aria-hidden />
                  </button>
                </span>
              ))}
            </div>
          </section>
        ) : null}

        {canCreate ? (
          <div className="flex flex-col gap-1.5">
            <Button
              type="button"
              variant="outline"
              className="justify-start"
              onClick={createFromQuery}
            >
              <Plus aria-hidden />
              Crear «{parsed.name}»
            </Button>
            {createPreview ? (
              <p className="px-1 text-xs text-muted-foreground">
                Se añadirá {createPreview}
              </p>
            ) : null}
          </div>
        ) : searching && alreadyQueued ? (
          // Sin esto, volver a escribir un nombre ya en cola dejaba el Enter sin
          // efecto y sin explicación (la ficha está arriba, fuera de la vista).
          <p className="text-sm text-muted-foreground">
            «{parsed.name}» ya está entre los nuevos.
          </p>
        ) : null}

        {groups.map((group) => (
          <section key={group.key} className="flex flex-col gap-2">
            <h3 className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
              {group.key === SUGGESTIONS_GROUP ? (
                <Sparkles className="size-4 text-chart-3" aria-hidden />
              ) : group.icon ? (
                <ProductIcon categoryIcon={group.icon} size={16} />
              ) : null}
              {group.title}
            </h3>
            <div className="flex flex-wrap gap-2">
              {group.products.map((product) => (
                <ProductChip
                  key={product.id}
                  product={product}
                  selected={selected.has(product.id)}
                  onList={onList.has(product.id)}
                  suggestion={suggested.get(product.id)}
                  onToggle={() => toggleProduct(product.id)}
                />
              ))}
            </div>
          </section>
        ))}

        {groups.every((g) => g.products.length === 0) ? (
          <p className="py-2 text-sm text-muted-foreground">
            {searching
              ? "No tienes nada con ese nombre. Créalo con el botón de arriba."
              : "Tu catálogo está vacío: escribe arriba lo que necesites y créalo."}
          </p>
        ) : null}
      </div>

      {/* `sticky` da fondo y borde de borde a borde asumiendo un contenedor con
          `px-4`, que es justo el de esta vista: el botón queda siempre a la vista
          mientras se recorre el catálogo. */}
      <ResponsiveModalFooter sticky>
        <Button
          size="lg"
          disabled={total === 0}
          loading={pending}
          onClick={submit}
        >
          <ShoppingCart aria-hidden />
          {pending
            ? "Añadiendo…"
            : total === 0
              ? "Añadir a la lista"
              : `Añadir ${total} a la lista`}
        </Button>
      </ResponsiveModalFooter>
    </div>
  );
}

/**
 * Ficha de producto del selector. Sin marcar muestra su icono; marcada, el icono
 * cede el sitio al check en la MISMA caja (los iconos de producto van a color, y
 * sobre el verde de «marcado» perderían su lectura además de mover la fila).
 */
function ProductChip({
  product,
  selected,
  onList,
  suggestion,
  onToggle,
}: {
  product: CatalogProduct;
  selected: boolean;
  /** Ya está en la lista: marcarlo suma cantidad, no duplica (L3). */
  onList: boolean;
  /** Sugerencia asociada, si el producto viene del bloque de arriba. */
  suggestion?: Suggestion;
  onToggle: () => void;
}) {
  const pack = effectivePackSize(product.defaultUnit, product.packSize);
  // Qué se añade al marcarla: la cantidad sugerida cuando es más de una compra
  // («2 packs»), o el tamaño del envase, que es lo que multiplica lo que llevas.
  const suggestedQuantity = suggestion?.suggestedQuantity ?? null;
  const suffix =
    suggestedQuantity !== null && suggestedQuantity > 1
      ? formatPurchaseQuantity(
          suggestedQuantity,
          suggestion?.unit ?? product.defaultUnit,
          suggestion?.packSize ?? null,
        )
      : pack
        ? `pack ${pack}`
        : null;

  // Lo que oirá un lector de pantalla: el rótulo visible se queda en el nombre,
  // así que el motivo y el «ya está en la lista» tienen que viajar aquí.
  const label = [
    product.name,
    suffix,
    suggestion ? suggestionReasonShort(suggestion) : null,
    onList ? "ya está en la lista" : null,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <button
      type="button"
      aria-pressed={selected}
      aria-label={label}
      onClick={onToggle}
      className={cn(
        "inline-flex min-h-11 items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition-colors",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        selected
          ? "border-primary bg-primary text-primary-foreground"
          : onList
            ? "border-dashed border-primary/40 bg-background hover:bg-muted"
            : "border-border bg-background hover:bg-muted",
      )}
    >
      {selected ? (
        <Check className="size-4 shrink-0" aria-hidden />
      ) : (
        <ProductIcon
          slug={product.icon}
          name={product.name}
          categoryIcon={product.categoryIcon}
          size={16}
        />
      )}
      {product.name}
      {suffix ? (
        <span
          className={cn(
            "text-xs font-normal tabular-nums",
            selected ? "opacity-80" : "text-muted-foreground",
          )}
        >
          {suffix}
        </span>
      ) : null}
      {/* Ya en la lista: marcarlo suma a lo que hay, no crea una fila repetida. */}
      {onList && !selected ? (
        <ShoppingCart className="size-3.5 shrink-0 text-primary" aria-hidden />
      ) : null}
    </button>
  );
}

/** Qué contar en el aviso: filas nuevas y sumas a lo que ya estaba (L3). */
function resultLabel({ added = 0, merged = 0 }: BulkAddState): string {
  const parts: string[] = [];
  if (added > 0) {
    parts.push(
      added === 1
        ? "1 producto añadido a la lista"
        : `${added} productos añadidos a la lista`,
    );
  }
  if (merged > 0) {
    parts.push(
      added > 0
        ? `${merged} ya estaba${merged === 1 ? "" : "n"} (cantidad sumada)`
        : merged === 1
          ? "Ya estaba en la lista: cantidad sumada"
          : `${merged} ya estaban en la lista: cantidades sumadas`,
    );
  }
  return parts.join(" · ") || "Lista actualizada";
}
