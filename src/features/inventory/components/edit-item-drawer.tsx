"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ChefHat,
  Merge,
  Pencil,
  Star,
  Store,
  TrendingDown,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { CollapsibleFields } from "@/components/collapsible-fields";
import { ProductIcon } from "@/components/product-icon";
import { ProductIconPickerView } from "@/components/product-icon-picker";
import {
  ResponsiveModal,
  ResponsiveModalClose,
  ResponsiveModalContent,
  ResponsiveModalDescription,
  ResponsiveModalFooter,
  ResponsiveModalHeader,
  ResponsiveModalTitle,
} from "@/components/ui/responsive-modal";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  ProductCombobox,
  type ComboboxProduct,
} from "@/components/product-combobox";
import { cn } from "@/lib/utils";
import { chainLabel, chainOptions, orderChains } from "@/features/prices/chains";
import { relativeDaysLabel } from "@/lib/dates";
import {
  formatQuantity,
  LOCATION_ICONS,
  LOCATION_LABELS,
  LOCATION_ORDER,
  UNIT_OPTIONS,
} from "@/lib/units";
import type { LocationType, UnitType } from "@/lib/supabase/types";
import type { Category, InventoryEntry } from "../queries";
import {
  deleteInventoryAction,
  getMergeCandidatesAction,
  getSameProductRowsAction,
  mergeInventoryRowsAction,
  mergeProductsAction,
  togglePinAction,
  updateInventoryAction,
  type SameProductRow,
} from "../actions";
import {
  deleteAliasAction,
  getProductAliasesAction,
  type ProductAlias,
} from "@/features/receipts/actions";
import { ExpiryQuickPicker } from "./expiry-quick-picker";
import { PackagingFields } from "./packaging-fields";

const NO_CATEGORY = "__none__";
const NO_CHAIN = "__none__";

export function EditItemDrawer({
  entry,
  categories,
  householdChains = [],
  open,
  onOpenChange,
  pinned = false,
}: {
  entry: InventoryEntry;
  categories: Category[];
  /** Tiendas habituales del hogar (L15 f4): salen primero en el selector. */
  householdChains?: string[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** El producto está en "Mis habituales" del usuario actual (E5). */
  pinned?: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Borrado con red de seguridad: confirmación en dos toques en el propio botón
  // (sin modal sobre modal). El primer toque arma la confirmación 5 s; el segundo
  // ejecuta. Al cerrar el drawer o pasado el tiempo, vuelve al estado inicial.
  const [confirmDelete, setConfirmDelete] = useState(false);
  const confirmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Pin "Mis habituales": optimista, resincronizado con el prop del servidor.
  const [isPinned, setIsPinned] = useState(pinned);
  const [serverPinned, setServerPinned] = useState(pinned);
  const [pinPending, startPin] = useTransition();
  if (serverPinned !== pinned) {
    setServerPinned(pinned);
    setIsPinned(pinned);
  }

  function togglePin(next: boolean) {
    setIsPinned(next);
    startPin(async () => {
      const res = await togglePinAction(entry.productId);
      if (res.error) {
        toast.error(res.error);
        setIsPinned(!next);
        return;
      }
      if (typeof res.pinned === "boolean") setIsPinned(res.pinned);
      toast.success(
        res.pinned
          ? `${entry.productName} en Mis habituales`
          : `${entry.productName} quitado de Mis habituales`,
      );
      router.refresh();
    });
  }

  // Aliases aprendidos (E8): se recargan bajo demanda al abrir el drawer (cada
  // tarjeta tiene su propio drawer, así que productId no cambia en una instancia).
  const [aliases, setAliases] = useState<ProductAlias[]>([]);
  const [removingAlias, startRemove] = useTransition();
  useEffect(() => {
    if (!open) return;
    let active = true;
    getProductAliasesAction(entry.productId).then((rows) => {
      if (active) setAliases(rows);
    });
    return () => {
      active = false;
    };
  }, [open, entry.productId]);

  useEffect(
    () => () => {
      if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current);
    },
    [],
  );

  function requestDelete() {
    if (!confirmDelete) {
      setConfirmDelete(true);
      if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current);
      confirmTimerRef.current = setTimeout(() => setConfirmDelete(false), 5000);
      return;
    }
    if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current);
    setConfirmDelete(false);
    handleDelete();
  }

  /**
   * Nombres agrupados por la tienda donde se vieron por última vez (L17). Que un
   * producto tenga un nombre por cadena es lo normal; que una MISMA cadena tenga
   * dos suele ser una etiqueta antigua que quedó viva, y agrupar es lo que hace
   * ese caso visible de un vistazo. Los de origen desconocido (aprendidos antes
   * de guardar la cadena, o creados al fusionar productos) van al final.
   */
  const aliasGroups = useMemo(() => {
    const byChain = new Map<string | null, ProductAlias[]>();
    for (const a of aliases) {
      const list = byChain.get(a.storeChain);
      if (list) list.push(a);
      else byChain.set(a.storeChain, [a]);
    }
    const groups: { chain: string | null; aliases: ProductAlias[] }[] =
      orderChains(
        [...byChain.keys()].filter((k): k is string => k !== null),
      ).map((chain) => ({ chain, aliases: byChain.get(chain) ?? [] }));
    const unknown = byChain.get(null);
    if (unknown) groups.push({ chain: null, aliases: unknown });
    return groups;
  }, [aliases]);

  // Dos nombres en la MISMA cadena es el caso que pide una revisión. Al quedar
  // la lista plegada, el aviso sube a la cabecera de la sección: si no, el único
  // sitio donde se veía deja de estar a la vista.
  const hasSuspiciousAliases = aliasGroups.some(
    (g) => g.chain !== null && g.aliases.length > 1,
  );

  function removeAlias(id: string) {
    const prev = aliases;
    setAliases((a) => a.filter((x) => x.id !== id));
    startRemove(async () => {
      const res = await deleteAliasAction(id);
      if (res.error) {
        toast.error(res.error);
        setAliases(prev);
      }
    });
  }

  // Fusionar con otro producto (E9): candidatos cargados al abrir el drawer.
  const [mergeCandidates, setMergeCandidates] = useState<ComboboxProduct[]>([]);
  const [mergeTarget, setMergeTarget] = useState<string | null>(null);
  const [merging, startMerge] = useTransition();
  useEffect(() => {
    if (!open) return;
    let active = true;
    getMergeCandidatesAction(entry.productId).then((rows) => {
      if (active) {
        setMergeCandidates(rows);
        setMergeTarget(null);
      }
    });
    return () => {
      active = false;
    };
  }, [open, entry.productId]);

  function confirmMerge() {
    if (!mergeTarget) return;
    startMerge(async () => {
      const res = await mergeProductsAction(entry.productId, mergeTarget);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success("Productos fusionados");
      onOpenChange(false);
      router.refresh();
    });
  }

  // Mantenimiento del catálogo (nombres de ticket + fusión). Lo anunciamos en el
  // pie del plegable solo si de verdad hay algo dentro: en un hogar recién
  // creado no hay nombres aprendidos ni otro producto con el que fusionar, y el
  // bloque entero no se monta.
  const hasCatalogMaintenance =
    aliases.length > 0 || mergeCandidates.length > 0;

  // El MISMO producto en otra ubicación (nevera + despensa). Se lee al abrir la
  // ficha, como los aliases: la tarjeta solo conoce su propia fila, y el aviso
  // tiene que salir en la que el usuario abrió, sea cual sea de las dos.
  const [sameRows, setSameRows] = useState<SameProductRow[]>([]);
  const [joining, startJoin] = useTransition();
  useEffect(() => {
    if (!open) return;
    let active = true;
    getSameProductRowsAction(entry.productId, entry.id).then((rows) => {
      if (active) setSameRows(rows);
    });
    return () => {
      active = false;
    };
  }, [open, entry.productId, entry.id]);

  // «Despensa (1 ud)» o «Despensa (1 ud), Congelador (2 ud) y Otros (3 ud)»:
  // con la cantidad a la vista se decide sin salir de la ficha si toca juntarlo
  // o si la otra fila es un residuo a cero que da igual.
  const sameRowsLabel = (() => {
    const parts = sameRows.map(
      (r) =>
        `${LOCATION_LABELS[r.location]} (${formatQuantity(r.quantity, r.unit)})`,
    );
    if (parts.length < 2) return parts.join("");
    return `${parts.slice(0, -1).join(", ")} y ${parts[parts.length - 1]}`;
  })();

  function joinLocations() {
    startJoin(async () => {
      const res = await mergeInventoryRowsAction(entry.id);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success(
        `${entry.productName}: todo junto en ${LOCATION_LABELS[entry.location]}`,
      );
      onOpenChange(false);
      router.refresh();
    });
  }

  // "Consumir pronto" y "Ubicación": controlados, resincronizados cuando el
  // servidor cambia (mismo patrón de ajuste en render que el stepper).
  const [useSoon, setUseSoon] = useState(entry.useSoon);
  const [serverUseSoon, setServerUseSoon] = useState(entry.useSoon);
  if (serverUseSoon !== entry.useSoon) {
    setServerUseSoon(entry.useSoon);
    setUseSoon(entry.useSoon);
  }

  const [location, setLocation] = useState<LocationType>(entry.location);
  const [serverLocation, setServerLocation] = useState(entry.location);
  if (serverLocation !== entry.location) {
    setServerLocation(entry.location);
    setLocation(entry.location);
  }

  const [categoryId, setCategoryId] = useState(entry.categoryId ?? "");
  const [serverCategoryId, setServerCategoryId] = useState(entry.categoryId);
  if (serverCategoryId !== entry.categoryId) {
    setServerCategoryId(entry.categoryId);
    setCategoryId(entry.categoryId ?? "");
  }

  // Icono manual (L16): null = automático (se adivina del nombre/categoría).
  const [icon, setIcon] = useState<string | null>(entry.productIcon);
  const [serverIcon, setServerIcon] = useState(entry.productIcon);
  if (serverIcon !== entry.productIcon) {
    setServerIcon(entry.productIcon);
    setIcon(entry.productIcon);
  }
  // Icono de la categoría seleccionada (para la vista previa del automático).
  const selectedCategoryIcon =
    categories.find((c) => c.id === categoryId)?.icon ?? entry.categoryIcon;

  // El selector de icono es una VISTA de este mismo panel, no un modal encima:
  // dos overlays abiertos se pelean por el «atrás» y al elegir un icono se
  // cerraba también la ficha (ver product-icon-picker.tsx). El formulario se
  // oculta con CSS en vez de desmontarse: sus campos son no controlados
  // (nombre, cantidad, avisos…) y desmontarlo borraría lo escrito sin guardar.
  const [view, setView] = useState<"form" | "icon">("form");
  const iconTriggerRef = useRef<HTMLButtonElement>(null);
  const restoreIconFocus = useRef(false);

  // Al volver del selector, el foco regresa al botón del icono (que estaba
  // oculto cuando se pidió el cambio de vista, así que hay que esperar al
  // repintado). Solo tras un viaje de ida y vuelta: al abrir el panel el foco
  // lo coloca el propio modal.
  useEffect(() => {
    if (view === "form" && restoreIconFocus.current) {
      restoreIconFocus.current = false;
      iconTriggerRef.current?.focus();
    }
  }, [view]);

  function backToForm() {
    restoreIconFocus.current = true;
    setView("form");
  }

  // Reinicia el panel al cerrarlo: confirmación de borrado y vista activa
  // (patrón de ajuste de estado en render, como el pin de arriba). El
  // temporizador se limpia al desmontar, en el efecto de más arriba.
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (!open) {
      // Un temporizador pendiente que se dispare tras cerrar solo vuelve a poner
      // `false` (inocuo); `requestDelete` limpia el temporizador viejo al re-armar.
      setConfirmDelete(false);
      setView("form");
    }
  }

  // Tiendas del hogar primero (L15 f4): de todas las cadenas, las que este hogar
  // no pisa nunca son ruido. Solo se agrupa si la separación aporta algo: sin
  // tiendas habituales (o con todas marcadas) la lista plana se lee mejor.
  // `chainOptions` añade además las tiendas propias del hogar (f5), que por
  // definición son suyas y caen siempre en el primer grupo.
  const allChains = chainOptions(householdChains);
  const habitualChains = allChains.filter((c) =>
    householdChains.includes(c.value),
  );
  const otherChains = allChains.filter(
    (c) => !householdChains.includes(c.value),
  );
  const groupChains = habitualChains.length > 0 && otherChains.length > 0;
  const chainItem = (c: { value: string; label: string }) => (
    <SelectItem key={c.value} value={c.value}>
      {c.label}
    </SelectItem>
  );

  // Tienda preferida (L15): controlada y resincronizada con el servidor.
  const [preferredChain, setPreferredChain] = useState(
    entry.preferredChain ?? "",
  );
  const [serverChain, setServerChain] = useState(entry.preferredChain);
  if (serverChain !== entry.preferredChain) {
    setServerChain(entry.preferredChain);
    setPreferredChain(entry.preferredChain ?? "");
  }

  // Unidad de la fila. Editable para poder recolocar lo que entró de un ticket
  // con la unidad equivocada: una calabaza llega como «0,72 kg» y sin poder
  // pasarla a «1 ud» se queda sin stepper de ±1 para siempre.
  const [unit, setUnit] = useState<UnitType>(entry.unit);
  const [serverUnit, setServerUnit] = useState(entry.unit);
  if (serverUnit !== entry.unit) {
    setServerUnit(entry.unit);
    setUnit(entry.unit);
  }

  const [expiryDate, setExpiryDate] = useState<string | null>(
    entry.expiryDate,
  );
  const [serverExpiryDate, setServerExpiryDate] = useState(entry.expiryDate);
  if (serverExpiryDate !== entry.expiryDate) {
    setServerExpiryDate(entry.expiryDate);
    setExpiryDate(entry.expiryDate);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setError(null);
    setPending(true);
    try {
      const result = await updateInventoryAction({}, formData);
      if (result.error) {
        setError(result.error);
        return;
      }
      toast.success("Cambios guardados");
      onOpenChange(false);
      router.refresh();
    } catch {
      setError("No se pudieron guardar los cambios. Comprueba tu conexión.");
    } finally {
      setPending(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    const result = await deleteInventoryAction(entry.id);
    setDeleting(false);
    if (result?.error) {
      toast.error(result.error);
      return;
    }
    toast.success("Eliminado del inventario");
    onOpenChange(false);
    router.refresh();
  }

  return (
    <ResponsiveModal open={open} onOpenChange={onOpenChange}>
      <ResponsiveModalContent>
        <ResponsiveModalHeader>
          <ResponsiveModalTitle>
            {view === "icon" ? "Elegir icono" : entry.productName}
          </ResponsiveModalTitle>
          <ResponsiveModalDescription>
            {view === "icon"
              ? "Busca por nombre o elige de la lista. El automático se ajusta al nombre del producto."
              : `${formatQuantity(entry.quantity, entry.unit)} en existencias`}
          </ResponsiveModalDescription>
        </ResponsiveModalHeader>

        {view === "icon" ? (
          <ProductIconPickerView
            value={icon}
            name={entry.productName}
            categoryIcon={selectedCategoryIcon}
            onSelect={(slug) => {
              setIcon(slug);
              backToForm();
            }}
            onBack={backToForm}
          />
        ) : null}

        <form
          onSubmit={handleSubmit}
          className={cn(
            "flex flex-col gap-4 px-4",
            view !== "form" && "hidden",
          )}
        >
          <input type="hidden" name="inventoryId" value={entry.id} />
          <input type="hidden" name="productId" value={entry.productId} />
          <input type="hidden" name="useSoon" value={String(useSoon)} />

          <input type="hidden" name="categoryId" value={categoryId} />
          <input type="hidden" name="preferredChain" value={preferredChain} />
          <input type="hidden" name="icon" value={icon ?? ""} />

          <div className="flex flex-col gap-2">
            <Label htmlFor="edit-name">Producto</Label>
            <div className="flex items-end gap-2">
              <button
                ref={iconTriggerRef}
                type="button"
                onClick={() => setView("icon")}
                aria-label="Cambiar icono del producto"
                className="relative flex size-11 shrink-0 items-center justify-center rounded-lg border bg-muted transition-colors hover:bg-muted/70 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                <ProductIcon
                  slug={icon}
                  name={entry.productName}
                  categoryIcon={selectedCategoryIcon}
                  size={26}
                />
                <span className="absolute -right-1 -bottom-1 flex size-4 items-center justify-center rounded-full border bg-background text-muted-foreground">
                  <Pencil className="size-2.5" aria-hidden />
                </span>
              </button>
              <Input
                id="edit-name"
                name="name"
                required
                maxLength={120}
                autoComplete="off"
                defaultValue={entry.productName}
                className="flex-1"
              />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="edit-category">Categoría</Label>
            <Select
              value={categoryId === "" ? NO_CATEGORY : categoryId}
              onValueChange={(v) =>
                setCategoryId(v === NO_CATEGORY ? "" : v)
              }
            >
              <SelectTrigger id="edit-category" className="w-full">
                <SelectValue placeholder="Sin categoría" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_CATEGORY}>Sin categoría</SelectItem>
                {categories.map((c) => (
                  <SelectItem key={c.id} value={c.id} textValue={c.name}>
                    <span className="flex items-center gap-2">
                      <ProductIcon categoryIcon={c.icon} size={18} />
                      {c.name}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-2">
              <Label htmlFor="edit-quantity">Cantidad</Label>
              <Input
                id="edit-quantity"
                name="quantity"
                type="number"
                inputMode="decimal"
                min={0}
                step="any"
                defaultValue={entry.quantity}
                required
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="edit-unit">Unidad</Label>
              <Select
                value={unit}
                onValueChange={(v) => setUnit(v as UnitType)}
                name="unit"
              >
                <SelectTrigger id="edit-unit" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {UNIT_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Ubicación A LA VISTA y en un toque. Era el único campo del plegable
              que se cambia a menudo: lo que compras fresco acaba en el
              congelador, y lo que entra de un ticket cae todo en un sitio y
              luego se reparte. Ahí abajo costaba dos toques y saber que estaba.
              Radios nativos y no un Select: con cuatro opciones caben todas sin
              desplegar nada, y el teclado, el nombre del grupo y el valor en el
              FormData salen gratis. El orden es el de las secciones del listado
              (LOCATION_ORDER), no el del selector: se elige mirando dónde está
              la cosa en la lista. */}
          <fieldset>
            <legend className="mb-2 text-sm leading-none font-medium">
              Ubicación
            </legend>
            <div className="grid grid-cols-2 gap-2">
              {LOCATION_ORDER.map((loc) => {
                const checked = location === loc;
                return (
                  <label
                    key={loc}
                    className={cn(
                      "flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg border px-3 text-sm font-medium transition-colors select-none has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring",
                      checked
                        ? "border-transparent bg-primary text-primary-foreground"
                        : "hover:bg-muted",
                    )}
                  >
                    <input
                      type="radio"
                      name="location"
                      value={loc}
                      checked={checked}
                      onChange={() => setLocation(loc)}
                      className="sr-only"
                    />
                    <span aria-hidden>{LOCATION_ICONS[loc]}</span>
                    {LOCATION_LABELS[loc]}
                  </label>
                );
              })}
            </div>
          </fieldset>

          {/* Mismo producto en varias ubicaciones. Va A LA VISTA, no en los
              ajustes plegados: quien abre la ficha con dos «Plátano» delante
              viene justo a resolver esto, y el único sitio donde ponía «unir»
              era el combobox de duplicados del catálogo, que nunca puede
              ofrecer la fila de al lado (es el mismo producto, y se excluye). */}
          {sameRows.length > 0 ? (
            <div className="flex flex-col gap-2 rounded-xl border bg-muted/50 p-3">
              <span className="flex items-center gap-1.5 text-sm font-medium">
                <Merge className="size-4 text-muted-foreground" aria-hidden />
                Este producto está en más de un sitio
              </span>
              {/* «Hay otra línea» y no «también lo tienes»: la otra fila puede
                  estar a 0 (el residuo que dejan las compras), y ahí «tienes»
                  sería mentira. Juntarlo la borra igual. */}
              <p className="text-sm text-muted-foreground">
                {sameRows.length === 1 ? "Hay otra línea en " : "Hay más líneas en "}
                {sameRowsLabel}. Es el mismo producto repartido, no productos
                distintos: por eso no sale en «Fusionar con otro producto».
              </p>
              <Button
                type="button"
                variant="outline"
                onClick={joinLocations}
                loading={joining}
              >
                Juntarlo todo en {LOCATION_LABELS[entry.location].toLowerCase()}
              </Button>
            </div>
          ) : null}

          {/* A la vista solo lo que se edita a diario (nombre, icono, categoría,
              unidades y ubicación); el resto son ajustes que se ponen una vez y
              casi nunca se vuelven a tocar. Tenerlos todos desplegados dejaba
              las acciones del panel fuera de pantalla en móvil.
              Una sola puerta y no dos: los nombres de ticket y la fusión estaban
              en su propio plegable justo debajo, y desde fuera dos cabeceras
              seguidas no dicen qué hay en cada una. Van al fondo de esta, tras
              un separador, que es lo que de verdad los distingue: se tocan una
              vez en la vida.
              El «todo opcional» va aquí una vez y no campo a campo: repetirlo en
              cada etiqueta era ruido en una sección que ya es opcional por serlo. */}
          <CollapsibleFields
            title="Ajustes adicionales"
            hint={
              hasCatalogMaintenance
                ? "Todo opcional: caducidad, tienda, envase, avisos y nombres en tickets"
                : "Todo opcional: caducidad, tienda, envase y avisos"
            }
            badge={
              hasSuspiciousAliases ? (
                <span className="rounded-full bg-warning/15 px-2 py-0.5 text-xs font-medium text-warning">
                  Revisa los nombres
                </span>
              ) : null
            }
          >
            <ExpiryQuickPicker
              id="edit-expiry"
              name="expiryDate"
              value={expiryDate}
              onChange={setExpiryDate}
            />

            <div className="flex flex-col gap-2">
              <Label htmlFor="edit-chain" className="flex items-center gap-1.5">
                <Store className="size-4 text-muted-foreground" aria-hidden />
                Tienda preferida
              </Label>
              <Select
                value={preferredChain === "" ? NO_CHAIN : preferredChain}
                onValueChange={(v) =>
                  setPreferredChain(v === NO_CHAIN ? "" : v)
                }
              >
                <SelectTrigger id="edit-chain" className="w-full">
                  <SelectValue placeholder="Cualquier tienda" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_CHAIN}>Cualquier tienda</SelectItem>
                  {groupChains ? (
                    <>
                      <SelectGroup>
                        <SelectLabel>Tus tiendas</SelectLabel>
                        {habitualChains.map(chainItem)}
                      </SelectGroup>
                      <SelectGroup>
                        <SelectLabel>Otras</SelectLabel>
                        {otherChains.map(chainItem)}
                      </SelectGroup>
                    </>
                  ) : (
                    allChains.map(chainItem)
                  )}
                </SelectContent>
              </Select>
              {entry.savings ? (
                // Fase 3: otra cadena sale más barata según tus tickets. Informativo
                // (acento cálido de precios); el aviso también aparece en la lista.
                <div className="flex items-start gap-1.5 rounded-lg bg-chart-3/10 p-2 text-sm text-chart-3">
                  <TrendingDown className="mt-0.5 size-4 shrink-0" aria-hidden />
                  <span>
                    En{" "}
                    <span className="font-medium">
                      {chainLabel(entry.savings.cheaperChain)}
                    </span>{" "}
                    ahorras ~{entry.savings.savingsPct}% frente a{" "}
                    {chainLabel(entry.savings.currentChain)}, según tus tickets.
                  </span>
                </div>
              ) : preferredChain === "" && entry.inferredChain ? (
                // Fase 2: pista inferida del histórico de tickets. Un toque la fija
                // como preferencia manual (pasa a mandar sobre la inferencia).
                <button
                  type="button"
                  onClick={() =>
                    setPreferredChain(entry.inferredChain as string)
                  }
                  className="flex items-start gap-1.5 rounded-lg bg-muted/60 p-2 text-left text-sm text-muted-foreground transition-colors hover:bg-muted"
                >
                  <Store className="mt-0.5 size-4 shrink-0" aria-hidden />
                  <span>
                    Según tus tickets, sueles comprarlo en{" "}
                    <span className="font-medium text-foreground">
                      {chainLabel(entry.inferredChain)}
                    </span>
                    . Tócalo para fijarlo.
                  </span>
                </button>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Dónde sueles comprarlo. Sirve para filtrar por tienda en el
                  modo compra.
                </p>
              )}
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="edit-min">Avísame cuando queden menos de</Label>
              <Input
                id="edit-min"
                name="minQuantity"
                type="number"
                inputMode="decimal"
                min={0}
                step="any"
                defaultValue={entry.minQuantity ?? ""}
              />
            </div>

            {unit === "ud" ? (
              <PackagingFields
                idPrefix="edit"
                contentSize={entry.contentSize}
                contentUnit={entry.contentUnit}
                contentIsEstimate={entry.contentIsEstimate}
                packSize={entry.packSize}
              />
            ) : null}

            {/* Los dos interruptores llevan `items-start`: `Label` trae
                `items-center` de base para alinear icono y texto en una fila, y
                al pasarlo a columna eso centra las dos líneas en horizontal (el
                título quedaba flotando 69 px dentro de su propia descripción).
                Y los dos llevan icono, que es lo que los hace leerse como
                pareja: el gorro cuando entra antes en los menús, la estrella
                cuando se ancla arriba. Se tiñen de `warning` al activarse, como
                el distintivo que sale luego en la tarjeta. */}
            <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
              <Label
                htmlFor="edit-use-soon"
                className="flex flex-col items-start gap-0.5"
              >
                <span className="flex items-center gap-1.5">
                  <ChefHat
                    aria-hidden
                    className={cn("size-4", useSoon && "text-warning")}
                  />
                  Consumir pronto
                </span>
                <span className="text-sm font-normal text-muted-foreground">
                  Priorízalo en los menús aunque no caduque
                </span>
              </Label>
              <Switch
                id="edit-use-soon"
                checked={useSoon}
                onCheckedChange={setUseSoon}
              />
            </div>

            <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
              <Label
                htmlFor="edit-pin"
                className="flex flex-col items-start gap-0.5"
              >
                <span className="flex items-center gap-1.5">
                  <Star
                    aria-hidden
                    className={cn(
                      "size-4",
                      isPinned && "fill-current text-warning",
                    )}
                  />
                  Mis habituales
                </span>
                <span className="text-sm font-normal text-muted-foreground">
                  Ánclalo arriba en tu inventario
                </span>
              </Label>
              <Switch
                id="edit-pin"
                checked={isPinned}
                onCheckedChange={togglePin}
                disabled={pinPending}
              />
            </div>

            {/* Mantenimiento del catálogo, al fondo y tras un separador: es lo
                último que se toca (fusionar, además, no se puede deshacer) y lo
                único de aquí que no es un ajuste de ESTA fila, sino del producto
                en todo el hogar. El aviso de nombres repetidos vive en el badge
                de la cabecera, que es el único sitio que se ve plegado. */}
            {hasCatalogMaintenance ? (
              <div className="flex flex-col gap-4 border-t pt-4">
                {aliases.length > 0 ? (
                  <div className="flex flex-col gap-2">
                    <span className="text-sm font-medium">
                      Nombres en tickets
                    </span>
                    <p className="text-sm text-muted-foreground">
                      Cómo aparece en tus tickets, por tienda. Un nombre distinto
                      en cada tienda es normal; dos en la misma suelen ser una
                      etiqueta antigua. Bórralo si se asoció por error: no afecta
                      a tu historial de precios.
                    </p>
                    <ul className="flex flex-col gap-3">
                      {aliasGroups.map((group) => (
                        <li
                          key={group.chain ?? "__sin_tienda__"}
                          className="flex flex-col gap-1.5"
                        >
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="text-xs font-medium text-muted-foreground">
                              {group.chain
                                ? chainLabel(group.chain)
                                : "Sin tienda identificada"}
                            </span>
                            {/* Solo es sospechoso dentro de una MISMA cadena: el
                                grupo sin identificar mezcla tiendas y no prueba
                                nada. */}
                            {group.chain && group.aliases.length > 1 ? (
                              <span className="rounded-full bg-warning/15 px-2 py-0.5 text-xs font-medium text-warning">
                                {group.aliases.length} nombres
                              </span>
                            ) : null}
                          </div>
                          <ul className="flex flex-col gap-1.5">
                            {group.aliases.map((a) => (
                              <li
                                key={a.id}
                                className="flex items-center justify-between gap-2 rounded-lg border py-1 pr-1 pl-3"
                              >
                                <span className="min-w-0 flex-1 truncate text-sm">
                                  {a.alias}
                                  {a.lastSeenAt ? (
                                    <span className="ml-1.5 text-xs text-muted-foreground">
                                      {relativeDaysLabel(
                                        a.lastSeenAt.slice(0, 10),
                                      )}
                                    </span>
                                  ) : null}
                                </span>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  aria-label={`Borrar el nombre «${a.alias}»`}
                                  onClick={() => removeAlias(a.id)}
                                  disabled={removingAlias}
                                >
                                  <X aria-hidden />
                                </Button>
                              </li>
                            ))}
                          </ul>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                {mergeCandidates.length > 0 ? (
                  <div className="flex flex-col gap-2">
                    <span className="text-sm font-medium">
                      Fusionar con otro producto
                    </span>
                    <p className="text-sm text-muted-foreground">
                      Une este producto con otro: el historial de precios de
                      ambos se juntará en el que elijas. Esta acción no se puede
                      deshacer.
                    </p>
                    <ProductCombobox
                      products={mergeCandidates}
                      value={mergeTarget}
                      onChange={setMergeTarget}
                      ariaLabel="Producto con el que fusionar"
                      placeholder="Buscar producto…"
                      triggerLabel="Elegir producto…"
                    />
                    {mergeTarget ? (
                      <Button
                        type="button"
                        variant="destructive"
                        onClick={confirmMerge}
                        disabled={merging}
                      >
                        {merging
                          ? "Fusionando…"
                          : `Fusionar «${entry.productName}» en «${
                              mergeCandidates.find((p) => p.id === mergeTarget)
                                ?.name ?? "…"
                            }»`}
                      </Button>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ) : null}
          </CollapsibleFields>

          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}

          {/* Acciones fijas al fondo: guardar, «lo tiré» y eliminar se ven sin
              scroll incluso con los ajustes desplegados. */}
          <ResponsiveModalFooter sticky className="gap-2">
            <Button type="submit" size="lg" loading={pending}>
              {pending ? "Guardando…" : "Guardar cambios"}
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={requestDelete}
              loading={deleting}
              aria-live="polite"
            >
              <Trash2 aria-hidden />
              {confirmDelete ? "¿Seguro? Eliminar" : "Eliminar del inventario"}
            </Button>
            <ResponsiveModalClose asChild>
              <Button type="button" variant="ghost">
                Cancelar
              </Button>
            </ResponsiveModalClose>
          </ResponsiveModalFooter>
        </form>
      </ResponsiveModalContent>
    </ResponsiveModal>
  );
}
