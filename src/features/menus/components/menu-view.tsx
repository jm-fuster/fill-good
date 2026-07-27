"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  BookmarkPlus,
  Check,
  ChefHat,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Copy,
  Lightbulb,
  MoveRight,
  Pin,
  PinOff,
  Plus,
  RefreshCw,
  Sparkles,
  Trash2,
  type LucideIcon,
} from "lucide-react";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { getWeekDays, shiftWeek } from "@/lib/dates";
import { formatEuro } from "@/lib/money";
import { cn } from "@/lib/utils";
import { saveGeneratedRecipeAction } from "@/features/recipes/actions";
import { formatQuantity, UNIT_LABELS } from "@/lib/units";
import type { MenuEntry } from "../queries";
import type { SlotDef } from "../slots";
import type { MissingCandidate } from "../missing";
import type { CookedDeduction } from "../cooked";
import type { TonightCard } from "../tonight";
import {
  addMenuEntryAction,
  addRecipeToMenuAction,
  computeCookedDeductionsAction,
  computeMissingForMenuAction,
  computeTonightAction,
  confirmCookedDeductionsAction,
  confirmMissingToListAction,
  copyPreviousWeekAction,
  duplicateMenuEntryAction,
  generateMenuAction,
  moveMenuEntryAction,
  removeMenuEntryAction,
  rerollMenuEntryAction,
  toggleEntryCookedAction,
  toggleEntryPinnedAction,
  updateMenuEntryAction,
} from "../actions";

/** ISO local (YYYY-MM-DD) de hoy, para comparar con la fecha de la entrada. */
function todayISO(): string {
  return format(new Date(), "yyyy-MM-dd");
}

/** Estado de edición del drawer. `entryId === null` ⇒ añadir un plato nuevo. */
type Editing = {
  entryId: string | null;
  date: string;
  slot: string;
  label: string;
  current: string;
  recipeId: string | null;
  canSaveToRecipes: boolean;
  cookedAt: string | null;
  pinned: boolean;
};

export function MenuView({
  weekStart,
  menuId,
  entries,
  weekCost,
  slots,
  canCopyPrevious,
  householdName,
  settingsSlot,
}: {
  weekStart: string;
  menuId: string | null;
  entries: MenuEntry[];
  weekCost: { total: number; complete: boolean } | null;
  slots: SlotDef[];
  canCopyPrevious: boolean;
  /** Solo para la cabecera de la hoja impresa (D5). */
  householdName: string | null;
  /**
   * Botón de «Ajustes del menú» (`MenuSettings`), que viaja junto al botón de
   * generar. Llega como slot desde el servidor para que esta vista no cargue
   * con las preferencias ni las reglas, que no usa para nada.
   */
  settingsSlot: React.ReactNode;
}) {
  const router = useRouter();
  const [generating, startGenerate] = useTransition();
  const [addingList, startAddList] = useTransition();
  const [editing, setEditing] = useState<Editing | null>(null);
  const [missing, setMissing] = useState<MissingCandidate[] | null>(null);
  const [cookedDeductions, setCookedDeductions] = useState<{
    recipeName: string;
    items: CookedDeduction[];
  } | null>(null);
  const [tonight, setTonight] = useState<TonightCard[] | null>(null);
  const [askingTonight, startTonight] = useTransition();

  const days = getWeekDays(weekStart);
  // Varios platos por hueco: agrupamos por `date|slot` (ya vienen por posición).
  const bySlot = new Map<string, MenuEntry[]>();
  for (const e of entries) {
    const key = `${e.date}|${e.slot}`;
    const list = bySlot.get(key);
    if (list) list.push(e);
    else bySlot.set(key, [e]);
  }
  const hasRecipes = entries.some((e) => e.recipeId);
  // Rango de la semana para la hoja impresa: "28 de julio – 3 de agosto".
  const weekRange = `${format(parseISO(days[0]!), "d 'de' MMMM", {
    locale: es,
  })} – ${format(parseISO(days[6]!), "d 'de' MMMM", { locale: es })}`;
  // Hay trabajo que la regeneración respetuosa conservaría (fijado o manual):
  // solo entonces tiene sentido ofrecer el "Rehacer todo" destructivo.
  const hasPreservable = entries.some((e) => e.pinned || e.source === "manual");
  const [confirmReplace, setConfirmReplace] = useState(false);
  const [copying, startCopy] = useTransition();

  function copyPrevious() {
    startCopy(async () => {
      const r = await copyPreviousWeekAction(weekStart);
      if (r.error) toast.error(r.error);
      else {
        toast.success("Semana copiada de la anterior");
        router.refresh();
      }
    });
  }

  function generate(mode: "fill" | "replace") {
    setConfirmReplace(false);
    startGenerate(async () => {
      const r = await generateMenuAction(weekStart, mode);
      if (r.error) toast.error(r.error);
      else {
        toast.success(mode === "replace" ? "Menú rehecho" : "Menú generado");
        router.refresh();
      }
    });
  }

  function askTonight() {
    startTonight(async () => {
      const r = await computeTonightAction();
      if (r.error) {
        toast.error(r.error);
        return;
      }
      setTonight(r.cards ?? []);
    });
  }

  function reviewMissing() {
    if (!menuId) return;
    startAddList(async () => {
      const r = await computeMissingForMenuAction(menuId);
      if (r.error) {
        toast.error(r.error);
        return;
      }
      const candidates = r.candidates ?? [];
      if (candidates.length === 0) {
        toast.info("Ya tienes todos los ingredientes");
        return;
      }
      setMissing(candidates);
    });
  }

  function openAdd(date: string, slot: SlotDef) {
    setEditing({
      entryId: null,
      date,
      slot: slot.key,
      label: `${slot.label} · ${format(parseISO(date), "EEEE", { locale: es })}`,
      current: "",
      recipeId: null,
      canSaveToRecipes: false,
      cookedAt: null,
      pinned: false,
    });
  }

  function openEdit(date: string, slot: SlotDef, entry: MenuEntry) {
    setEditing({
      entryId: entry.id,
      date,
      slot: slot.key,
      label: `${slot.label} · ${format(parseISO(date), "EEEE", { locale: es })}`,
      current: entry.recipeName ?? entry.freeText ?? "",
      recipeId: entry.recipeId,
      canSaveToRecipes: Boolean(entry.recipeId && entry.recipeIsSaved === false),
      cookedAt: entry.cookedAt,
      pinned: entry.pinned,
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {/*
        Cabecera SOLO en papel: en pantalla el título lo da PageHeader y la
        semana el selector, y los dos se ocultan al imprimir. Repite el lenguaje
        de la imagen para compartir (hogar en versalita verde, título, rango).
      */}
      <header className="hidden print:mb-5 print:block">
        {householdName ? (
          <p className="text-xs font-bold tracking-widest text-primary uppercase">
            {householdName}
          </p>
        ) : null}
        <h2 className="font-heading text-2xl font-bold tracking-tight">
          Menú de la semana
        </h2>
        <p className="text-sm text-muted-foreground first-letter:uppercase">
          {weekRange}
        </p>
      </header>

      <div className="flex items-center gap-1 print:hidden">
        <Button variant="ghost" size="icon" asChild aria-label="Semana anterior">
          <Link href={`/menus?week=${shiftWeek(weekStart, -1)}`}>
            <ChevronLeft aria-hidden />
          </Link>
        </Button>
        <p className="flex-1 text-center text-sm font-medium">
          Semana del{" "}
          {format(parseISO(weekStart), "d 'de' MMMM", { locale: es })}
        </p>
        <Button variant="ghost" size="icon" asChild aria-label="Semana siguiente">
          <Link href={`/menus?week=${shiftWeek(weekStart, 1)}`}>
            <ChevronRight aria-hidden />
          </Link>
        </Button>
      </div>

      {weekCost ? (
        <p className="-mt-2 text-center text-xs text-muted-foreground print:hidden">
          Coste estimado de la semana:{" "}
          <span className="font-medium text-chart-3">
            {weekCost.complete ? "≈ " : "≥ "}
            {formatEuro(weekCost.total)}
          </span>
          {weekCost.complete ? "" : " (parcial)"}
        </p>
      ) : null}

      {/*
        Un solo primario en pantalla: generar con IA. Los ajustes que condicionan
        a la IA van a su lado (icono) y compartir/imprimir en la cabecera de la
        página. «¿Qué hago hoy?» queda como enlace: sigue a un toque, pero deja
        de competir con el generador.
      */}
      <div className="flex flex-col gap-2 print:hidden">
        <div className="flex items-center gap-2">
          <Button
            onClick={() => generate("fill")}
            loading={generating}
            size="lg"
            className="flex-1"
          >
            <Sparkles aria-hidden />
            {generating
              ? "Generando menú…"
              : hasPreservable
                ? "Completar menú con IA"
                : "Generar menú con IA"}
          </Button>
          {settingsSlot}
        </div>
        {/*
          Solo existe en semanas vacías (`canCopyPrevious` lo exige), así que
          nunca compite con un menú ya puesto: ahí es la alternativa natural a
          generar con IA.
        */}
        {canCopyPrevious ? (
          <Button onClick={copyPrevious} loading={copying} variant="outline">
            <CalendarDays aria-hidden />
            {copying ? "Copiando…" : "Copiar la semana anterior"}
          </Button>
        ) : null}
        {hasPreservable ? (
          <p className="text-center text-xs text-muted-foreground">
            Completar respeta tus platos fijados y manuales.{" "}
            <button
              type="button"
              onClick={() => setConfirmReplace(true)}
              disabled={generating}
              className="font-medium text-foreground underline underline-offset-2 disabled:opacity-50"
            >
              Rehacer todo desde cero
            </button>
          </p>
        ) : null}
        <Button
          variant="link"
          onClick={askTonight}
          loading={askingTonight}
          className="self-center"
        >
          <Lightbulb aria-hidden />
          {askingTonight ? "Pensando…" : "¿Qué hago hoy?"}
        </Button>
      </div>

      <ResponsiveModal
        open={confirmReplace}
        onOpenChange={(o) => !o && setConfirmReplace(false)}
      >
        <ResponsiveModalContent>
          <ResponsiveModalHeader>
            <ResponsiveModalTitle>Rehacer todo el menú</ResponsiveModalTitle>
            <ResponsiveModalDescription>
              Se borrará toda la semana —incluidos tus platos fijados y los que
              has editado o añadido a mano— y se generará un menú nuevo. Esta
              acción no se puede deshacer.
            </ResponsiveModalDescription>
          </ResponsiveModalHeader>
          <ResponsiveModalFooter className="gap-2">
            <Button
              type="button"
              variant="destructive"
              size="lg"
              onClick={() => generate("replace")}
              loading={generating}
            >
              <Sparkles aria-hidden />
              {generating ? "Rehaciendo…" : "Rehacer todo"}
            </Button>
            <ResponsiveModalClose asChild>
              <Button type="button" variant="ghost">
                Cancelar
              </Button>
            </ResponsiveModalClose>
          </ResponsiveModalFooter>
        </ResponsiveModalContent>
      </ResponsiveModal>

      {/*
        Progresión responsive de la semana: móvil 1 columna (días apilados) →
        lg 2 → xl 3 tarjetas de día (con sus slots en fila). En 2xl hay sitio
        para el planificador clásico: 7 columnas, una por día, con los slots
        apilados en vertical (2xl:grid-cols-1 en el grid interior).

        Al imprimir se fuerza ese mismo planificador de 7 columnas —la hoja va en
        horizontal (`@page` en globals.css)— para que la semana entre en UNA hoja:
        sin targets táctiles ni bordes de botón, tipografía en puntos y columnas
        altas que reparten los huecos a lo alto del folio (queda sitio para
        apuntar a mano). Solo cambia el CSS; el DOM y la lógica son los mismos.
      */}
      <div className="flex flex-col gap-3 lg:grid lg:grid-cols-2 lg:items-start lg:gap-3 xl:grid-cols-3 2xl:grid-cols-7 2xl:gap-2 print:!grid print:!grid-cols-7 print:!gap-2">
        {days.map((date) => (
          <div
            key={date}
            // 120mm de alto por columna llenan la hoja (≈160mm de los 186mm
            // útiles de un A4 horizontal) dejando holgura para las impresoras
            // que imponen un margen mayor que el `@page` que pedimos.
            className="rounded-xl border p-3 print:flex print:min-h-[120mm] print:break-inside-avoid print:flex-col print:rounded-md print:p-2.5"
          >
            <p className="mb-2 text-sm font-semibold capitalize print:mb-2 print:text-[11pt]">
              {format(parseISO(date), "EEEE d", { locale: es })}
            </p>
            <div
              className={cn(
                "grid items-start gap-2 2xl:grid-cols-1 print:!grid-cols-1 print:flex-1 print:auto-rows-fr print:gap-2",
                slots.length === 3 ? "grid-cols-3" : "grid-cols-2",
              )}
            >
              {slots.map((slot) => {
                const slotEntries = bySlot.get(`${date}|${slot.key}`) ?? [];
                return (
                  <div
                    key={slot.key}
                    className="flex flex-col gap-1.5 print:gap-0.5"
                  >
                    <span className="text-xs font-medium text-muted-foreground print:text-[8pt] print:font-bold print:tracking-wider print:text-primary print:uppercase">
                      {slot.label}
                    </span>
                    {slotEntries.map((entry) => {
                      const text = entry.recipeName ?? entry.freeText ?? "";
                      return (
                        <button
                          key={entry.id}
                          type="button"
                          onClick={() => openEdit(date, slot, entry)}
                          className="flex min-h-11 items-start gap-1.5 rounded-lg border p-2 text-left text-sm transition-colors hover:bg-muted print:min-h-0 print:border-0 print:p-0 print:text-[10pt]"
                        >
                          {/* Cocinado y fijado son estado de la app, no del menú
                              que cuelgas en la nevera: no se imprimen. */}
                          {entry.cookedAt ? (
                            <Check
                              className="mt-0.5 size-3.5 shrink-0 text-success print:hidden"
                              aria-label="Cocinado"
                            />
                          ) : null}
                          {entry.pinned ? (
                            <Pin
                              className="mt-0.5 size-3.5 shrink-0 text-muted-foreground print:hidden"
                              aria-label="Fijado"
                            />
                          ) : null}
                          <span className="line-clamp-2 print:line-clamp-none">
                            {text}
                          </span>
                        </button>
                      );
                    })}
                    {/*
                      Hueco libre: solo un «+». Con el texto «Añadir plato» en
                      cada hueco había más botones que platos y la semana se
                      leía como interfaz, no como menú. El nombre completo vive
                      en el aria-label y el target sigue siendo de 44px.
                    */}
                    <button
                      type="button"
                      onClick={() => openAdd(date, slot)}
                      aria-label={`Añadir plato · ${slot.label} del ${format(
                        parseISO(date),
                        "EEEE d",
                        { locale: es },
                      )}`}
                      className="flex min-h-11 items-center justify-center rounded-lg border border-dashed text-muted-foreground transition-colors hover:bg-muted hover:text-foreground print:hidden"
                    >
                      <Plus className="size-4" aria-hidden />
                    </button>
                    {/* En papel el hueco vacío no puede quedar mudo (el «+» no
                        se imprime): una raya, como en la imagen de compartir. */}
                    {slotEntries.length === 0 ? (
                      <span
                        aria-hidden
                        className="hidden text-muted-foreground print:block print:text-[10pt]"
                      >
                        —
                      </span>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {hasRecipes ? (
        <Button
          variant="outline"
          size="lg"
          onClick={reviewMissing}
          loading={addingList}
          className="print:hidden"
        >
          {addingList ? "Calculando…" : "Añadir a la lista lo que falte"}
        </Button>
      ) : null}

      {/* Pie de la hoja, como en la imagen para compartir. */}
      <p className="hidden text-[7.5pt] text-muted-foreground print:mt-4 print:block">
        Fill Good · Compra lo justo, ahorra más
      </p>

      <MissingReviewDrawer
        menuId={menuId}
        candidates={missing}
        onClose={() => setMissing(null)}
      />

      <EditEntryDrawer
        editing={editing}
        weekStart={weekStart}
        slots={slots}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          router.refresh();
        }}
        onCookedChange={(cookedAt) => {
          // Refresca los datos sin cerrar el drawer y refleja el nuevo estado.
          setEditing((prev) => (prev ? { ...prev, cookedAt } : prev));
          router.refresh();
        }}
        onProposeDeductions={(recipeName, items) => {
          // El plato queda cocinado; se cierra la edición y se propone descontar.
          setEditing(null);
          setCookedDeductions({ recipeName, items });
          router.refresh();
        }}
      />

      <CookedDeductionsDrawer
        data={cookedDeductions}
        onClose={() => setCookedDeductions(null)}
        onDone={() => {
          setCookedDeductions(null);
          router.refresh();
        }}
      />

      <TonightDrawer
        cards={tonight}
        onClose={() => setTonight(null)}
        onAdded={() => {
          setTonight(null);
          router.refresh();
        }}
      />
    </div>
  );
}

/**
 * Celda de acción secundaria del drawer de un plato: icono arriba, etiqueta
 * corta debajo. Con etiqueta visible (no solo `aria-label`) para que se siga
 * entendiendo de un vistazo, ocupando un tercio del ancho.
 */
function EntryActionTile({
  icon: Icon,
  label,
  onClick,
  loading,
  disabled,
  pressed,
  destructive,
}: {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  loading?: boolean;
  disabled?: boolean;
  /** Acción de dos estados (fijar/desfijar): refleja el estado actual. */
  pressed?: boolean;
  destructive?: boolean;
}) {
  return (
    <Button
      type="button"
      variant={pressed ? "secondary" : destructive ? "destructive" : "outline"}
      onClick={onClick}
      loading={loading}
      disabled={disabled}
      aria-pressed={pressed}
      className="h-auto min-h-16 flex-col gap-1 px-1 py-2 text-[0.7rem] leading-tight whitespace-normal"
    >
      <Icon aria-hidden />
      {label}
    </Button>
  );
}

function EditEntryDrawer({
  editing,
  weekStart,
  slots,
  onClose,
  onSaved,
  onCookedChange,
  onProposeDeductions,
}: {
  editing: Editing | null;
  weekStart: string;
  slots: SlotDef[];
  onClose: () => void;
  onSaved: () => void;
  onCookedChange: (cookedAt: string | null) => void;
  onProposeDeductions: (recipeName: string, items: CookedDeduction[]) => void;
}) {
  const [value, setValue] = useState("");
  const [mode, setMode] = useState<"edit" | "move" | "duplicate">("edit");
  const [pending, startTransition] = useTransition();
  const [savingRecipe, startSaveRecipe] = useTransition();
  const [cooking, startCooking] = useTransition();
  const [picking, startPicking] = useTransition();
  const [pinningPending, startPinning] = useTransition();
  const [rerolling, startReroll] = useTransition();

  const isNew = editing?.entryId == null;
  const cooked = Boolean(editing?.cookedAt);
  const pinned = Boolean(editing?.pinned);
  // "Lo cocinamos" solo tiene sentido en entradas ya guardadas y de hoy/pasado.
  const canMarkCooked = Boolean(editing?.entryId && editing.date <= todayISO());
  const days = getWeekDays(weekStart);

  // Sincroniza el input al abrir con un plato distinto (o al pasar a "añadir").
  const [lastKey, setLastKey] = useState<string | null>(null);
  const key = editing
    ? (editing.entryId ?? `add:${editing.date}|${editing.slot}`)
    : null;
  if (key !== lastKey) {
    setLastKey(key);
    setValue(editing?.current ?? "");
    setMode("edit");
  }

  function save(text: string) {
    if (!editing) return;
    const trimmed = text.trim();
    if (!trimmed) return;
    startTransition(async () => {
      const r = editing.entryId
        ? await updateMenuEntryAction(editing.entryId, trimmed)
        : await addMenuEntryAction(
            weekStart,
            editing.date,
            editing.slot,
            trimmed,
          );
      if (r.error) toast.error(r.error);
      else onSaved();
    });
  }

  function remove() {
    if (!editing?.entryId) return;
    startTransition(async () => {
      const r = await removeMenuEntryAction(editing.entryId!);
      if (r.error) toast.error(r.error);
      else onSaved();
    });
  }

  function saveToRecipes() {
    if (!editing?.recipeId) return;
    startSaveRecipe(async () => {
      const r = await saveGeneratedRecipeAction(editing.recipeId!);
      if (r.error) toast.error(r.error);
      else {
        toast.success("Guardada en tu recetario");
        onSaved();
      }
    });
  }

  function toggleCooked() {
    if (!editing?.entryId) return;
    const next = !cooked;
    const entryId = editing.entryId;
    const recipeId = editing.recipeId;
    const recipeName = editing.current;
    const date = editing.date;
    startCooking(async () => {
      const r = await toggleEntryCookedAction(entryId, next);
      if (r.error) {
        toast.error(r.error);
        return;
      }
      // Al desmarcar (o si es texto libre) no se toca el inventario.
      if (!next || !recipeId) {
        toast.success(next ? "Marcado como cocinado" : "Ya no está cocinado");
        onCookedChange(next ? date : null);
        return;
      }
      // Receta cocinada: proponer descontar ingredientes (M2). El descuento es
      // opt-out por gesto; el plato queda cocinado pase lo que pase.
      toast.success("Marcado como cocinado");
      const d = await computeCookedDeductionsAction(recipeId);
      const items = d.deductions ?? [];
      if (items.some((it) => it.deductible)) {
        onProposeDeductions(recipeName, items);
      } else {
        onCookedChange(date);
      }
    });
  }

  /** Mueve o duplica el plato al hueco (date, slot) elegido en el picker. */
  function pick(date: string, slot: string) {
    if (!editing?.entryId) return;
    const entryId = editing.entryId;
    startPicking(async () => {
      const r =
        mode === "move"
          ? await moveMenuEntryAction(entryId, date, slot)
          : await duplicateMenuEntryAction(entryId, date, slot);
      if (r.error) toast.error(r.error);
      else {
        toast.success(mode === "move" ? "Plato movido" : "Plato duplicado");
        onSaved();
      }
    });
  }

  function togglePinned() {
    if (!editing?.entryId) return;
    const entryId = editing.entryId;
    const next = !pinned;
    startPinning(async () => {
      const r = await toggleEntryPinnedAction(entryId, next);
      if (r.error) toast.error(r.error);
      else {
        toast.success(next ? "Plato fijado" : "Plato desfijado");
        onSaved();
      }
    });
  }

  function reroll() {
    if (!editing?.entryId) return;
    const entryId = editing.entryId;
    startReroll(async () => {
      const r = await rerollMenuEntryAction(entryId);
      if (r.error) toast.error(r.error);
      else {
        toast.success("Nueva idea lista");
        onSaved();
      }
    });
  }

  const picker = mode !== "edit";

  return (
    <ResponsiveModal open={editing !== null} onOpenChange={(o) => !o && onClose()}>
      <ResponsiveModalContent>
        <ResponsiveModalHeader>
          <ResponsiveModalTitle className={picker ? undefined : "capitalize"}>
            {mode === "move"
              ? "Mover a…"
              : mode === "duplicate"
                ? "Duplicar en…"
                : editing?.label}
          </ResponsiveModalTitle>
          <ResponsiveModalDescription>
            {mode === "move"
              ? "Elige el día y el hueco de destino."
              : mode === "duplicate"
                ? "Elige dónde añadir una copia de este plato."
                : isNew
                  ? "Añade un plato a este hueco."
                  : "Edita o quita este plato."}
          </ResponsiveModalDescription>
        </ResponsiveModalHeader>

        {picker ? (
          <div className="flex flex-col gap-3 px-4">
            <div
              className={cn(
                "grid gap-2",
                slots.length === 3 ? "grid-cols-3" : "grid-cols-2",
              )}
            >
              {days.flatMap((date) =>
                slots.map((slot) => {
                  const isOrigin =
                    editing?.date === date && editing.slot === slot.key;
                  // Mover: no al propio hueco, ni a un futuro un plato cocinado.
                  const blocked =
                    mode === "move" &&
                    (isOrigin || (cooked && date > todayISO()));
                  const disabled = blocked || picking;
                  return (
                    <button
                      key={`${date}|${slot.key}`}
                      type="button"
                      disabled={disabled}
                      onClick={() => pick(date, slot.key)}
                      aria-current={isOrigin ? "true" : undefined}
                      className={cn(
                        "flex min-h-11 flex-col items-start gap-0.5 rounded-lg border p-2 text-left transition-colors",
                        disabled
                          ? "opacity-50"
                          : "hover:bg-muted hover:border-primary",
                        isOrigin && mode === "move" && "border-primary bg-muted",
                      )}
                    >
                      <span className="text-sm font-medium capitalize">
                        {format(parseISO(date), "EEE d", { locale: es })}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {isOrigin && mode === "move" ? "Aquí" : slot.label}
                      </span>
                    </button>
                  );
                }),
              )}
            </div>
            <ResponsiveModalFooter className="gap-2 px-0">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setMode("edit")}
                disabled={picking}
              >
                <ChevronLeft aria-hidden />
                Volver
              </Button>
            </ResponsiveModalFooter>
          </div>
        ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            save(value);
          }}
          className="flex flex-col gap-4 px-4"
        >
          <div className="flex flex-col gap-2">
            <Label htmlFor="menu-dish">Plato</Label>
            <Input
              id="menu-dish"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              autoComplete="off"
              placeholder="p. ej. Lentejas con verduras"
            />
          </div>
          {/*
            Acciones secundarias del plato en rejilla de iconos con etiqueta:
            apiladas como botones anchos eran hasta seis filas que enterraban el
            plato y el «Guardar». Cada celda mantiene los 44px de target.
          */}
          {!isNew ? (
            <div className="grid grid-cols-3 gap-2">
              <EntryActionTile
                icon={RefreshCw}
                label={rerolling ? "Pensando…" : "Otra idea"}
                onClick={reroll}
                loading={rerolling}
              />
              <EntryActionTile
                icon={pinned ? PinOff : Pin}
                label={pinned ? "Quitar fijado" : "Fijar"}
                onClick={togglePinned}
                loading={pinningPending}
                pressed={pinned}
              />
              <EntryActionTile
                icon={MoveRight}
                label="Mover a…"
                onClick={() => setMode("move")}
              />
              <EntryActionTile
                icon={Copy}
                label="Duplicar en…"
                onClick={() => setMode("duplicate")}
              />
              {editing?.canSaveToRecipes ? (
                <EntryActionTile
                  icon={BookmarkPlus}
                  label={savingRecipe ? "Guardando…" : "A mi recetario"}
                  onClick={saveToRecipes}
                  loading={savingRecipe}
                />
              ) : null}
              <EntryActionTile
                icon={Trash2}
                label="Quitar del menú"
                onClick={remove}
                disabled={pending}
                destructive
              />
            </div>
          ) : null}

          <ResponsiveModalFooter className="gap-2 px-0">
            <Button
              type="submit"
              size="lg"
              disabled={!value.trim()}
              loading={pending}
            >
              {pending
                ? "Guardando…"
                : isNew
                  ? "Añadir plato"
                  : "Guardar"}
            </Button>
            {canMarkCooked ? (
              <Button
                type="button"
                variant={cooked ? "secondary" : "outline"}
                onClick={toggleCooked}
                loading={cooking}
                aria-pressed={cooked}
              >
                {cooked ? <Check aria-hidden /> : <ChefHat aria-hidden />}
                {cooking
                  ? "Guardando…"
                  : cooked
                    ? "Cocinado · deshacer"
                    : "Lo cocinamos"}
              </Button>
            ) : null}
            <ResponsiveModalClose asChild>
              <Button type="button" variant="ghost">
                Cancelar
              </Button>
            </ResponsiveModalClose>
          </ResponsiveModalFooter>
        </form>
        )}
      </ResponsiveModalContent>
    </ResponsiveModal>
  );
}

/**
 * Revisión de "lo que falta" (D3): lista con checkboxes (todo marcado por
 * defecto). Cada fila muestra el ingrediente y el producto del catálogo al que
 * ha casado (o "texto libre" si no hay coincidencia). Al confirmar, el servidor
 * recalcula e inserta solo lo marcado.
 */
function MissingReviewDrawer({
  menuId,
  candidates,
  onClose,
}: {
  menuId: string | null;
  candidates: MissingCandidate[] | null;
  onClose: () => void;
}) {
  const [included, setIncluded] = useState<Set<string>>(new Set());
  const [pending, startTransition] = useTransition();

  // Al abrir con un conjunto nuevo de candidatos, marcar todos por defecto.
  const [lastKey, setLastKey] = useState<string | null>(null);
  const key = candidates ? candidates.map((c) => c.key).join(",") : null;
  if (key !== lastKey) {
    setLastKey(key);
    setIncluded(new Set(candidates?.map((c) => c.key) ?? []));
  }

  function toggle(k: string, on: boolean) {
    setIncluded((prev) => {
      const next = new Set(prev);
      if (on) next.add(k);
      else next.delete(k);
      return next;
    });
  }

  function confirm() {
    if (!menuId) return;
    startTransition(async () => {
      const r = await confirmMissingToListAction(menuId, [...included]);
      if (r.error) {
        toast.error(r.error);
        return;
      }
      const n = r.added ?? 0;
      toast.success(
        n === 1
          ? "1 ingrediente añadido a la lista"
          : `${n} ingredientes añadidos a la lista`,
      );
      onClose();
    });
  }

  const count = included.size;

  return (
    <ResponsiveModal
      open={candidates !== null}
      onOpenChange={(o) => !o && onClose()}
    >
      <ResponsiveModalContent>
        <ResponsiveModalHeader>
          <ResponsiveModalTitle>Añadir a la lista</ResponsiveModalTitle>
          <ResponsiveModalDescription>
            Revisa lo que falta para el menú. Desmarca lo que no quieras.
          </ResponsiveModalDescription>
        </ResponsiveModalHeader>

        <ul className="flex max-h-[55vh] flex-col gap-2 overflow-y-auto px-4">
          {(candidates ?? []).map((c) => {
            const cbId = `missing-${c.key}`;
            const checked = included.has(c.key);
            return (
              <li
                key={c.key}
                className="flex items-start gap-3 rounded-xl border p-3"
              >
                <Checkbox
                  id={cbId}
                  checked={checked}
                  onCheckedChange={(v) => toggle(c.key, v === true)}
                  className="mt-0.5 size-5"
                />
                <Label
                  htmlFor={cbId}
                  className="flex flex-1 cursor-pointer flex-col items-start gap-1 font-normal"
                >
                  <span className="text-sm font-medium">
                    {c.ingredientName}
                  </span>
                  {c.match ? (
                    <span className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                      <Badge variant="secondary">{c.match.productName}</Badge>
                      {c.match.kind === "fuzzy"
                        ? "coincidencia aproximada"
                        : null}
                    </span>
                  ) : (
                    <Badge variant="outline">Texto libre</Badge>
                  )}
                </Label>
              </li>
            );
          })}
        </ul>

        <ResponsiveModalFooter className="gap-2">
          <Button
            type="button"
            size="lg"
            onClick={confirm}
            disabled={count === 0}
            loading={pending}
          >
            <Check aria-hidden />
            {pending
              ? "Añadiendo…"
              : count === 1
                ? "Añadir 1 a la lista"
                : `Añadir ${count} a la lista`}
          </Button>
          <ResponsiveModalClose asChild>
            <Button type="button" variant="ghost">
              Cancelar
            </Button>
          </ResponsiveModalClose>
        </ResponsiveModalFooter>
      </ResponsiveModalContent>
    </ResponsiveModal>
  );
}

/**
 * "Lo cocinamos" descuenta ingredientes (M2). Lista los ingredientes con match y
 * stock (cantidad editable, prellenada con la de la receta) y, aparte, los que
 * no se pueden descontar (sin match, sin stock o unidad incompatible). Confirmar
 * ejecuta el descuento FIFO por caducidad. Es opt-out por gesto: el plato ya
 * quedó cocinado; "No descontar" cierra sin tocar el inventario.
 */
function CookedDeductionsDrawer({
  data,
  onClose,
  onDone,
}: {
  data: { recipeName: string; items: CookedDeduction[] } | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const [qty, setQty] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();

  // Al abrir con un conjunto nuevo, prellenar cantidades de los descontables.
  const [lastKey, setLastKey] = useState<string | null>(null);
  const key = data ? data.items.map((i) => i.key).join(",") : null;
  if (key !== lastKey) {
    setLastKey(key);
    const init: Record<string, string> = {};
    for (const it of data?.items ?? []) {
      if (it.deductible) init[it.key] = String(it.suggestedQty);
    }
    setQty(init);
  }

  const items = data?.items ?? [];
  const deductibles = items.filter((i) => i.deductible);
  const informational = items.filter((i) => !i.deductible);
  const count = deductibles.filter(
    (it) => (Number(qty[it.key]) || 0) > 0,
  ).length;

  function confirm() {
    if (!data) return;
    const payload = deductibles
      .map((it) => ({
        productId: it.productId!,
        unit: it.unit!,
        quantity: Number(qty[it.key]) || 0,
      }))
      .filter((p) => p.quantity > 0);
    startTransition(async () => {
      const r = await confirmCookedDeductionsAction(payload);
      if (r.error) {
        toast.error(r.error);
        return;
      }
      const n = r.deducted ?? 0;
      toast.success(
        n === 0
          ? "No se descontó nada"
          : n === 1
            ? "Descontado 1 ingrediente"
            : `Descontados ${n} ingredientes`,
      );
      onDone();
    });
  }

  return (
    <ResponsiveModal open={data !== null} onOpenChange={(o) => !o && onClose()}>
      <ResponsiveModalContent>
        <ResponsiveModalHeader>
          <ResponsiveModalTitle>Descontar del inventario</ResponsiveModalTitle>
          <ResponsiveModalDescription>
            Ajusta lo que has gastado de «{data?.recipeName}». Se descuenta del
            lote que caduca antes. Desmarcar «cocinado» no repone el stock.
          </ResponsiveModalDescription>
        </ResponsiveModalHeader>

        <div className="flex max-h-[55vh] flex-col gap-3 overflow-y-auto px-4">
          {deductibles.length > 0 ? (
            <ul className="flex flex-col gap-2">
              {deductibles.map((it) => (
                <li
                  key={it.key}
                  className="flex items-center justify-between gap-3 rounded-xl border p-3"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium break-words line-clamp-2">
                      {it.productName}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Tienes {formatQuantity(it.availableQty, it.unit!)}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <Input
                      type="number"
                      inputMode="decimal"
                      aria-label={`Cantidad a descontar de ${it.productName}`}
                      min={0}
                      max={it.availableQty}
                      step={it.unit === "ud" ? 1 : 0.01}
                      value={qty[it.key] ?? ""}
                      onChange={(e) =>
                        setQty((prev) => ({ ...prev, [it.key]: e.target.value }))
                      }
                      className="w-20 text-right"
                    />
                    <span className="w-7 text-sm text-muted-foreground">
                      {UNIT_LABELS[it.unit!]}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          ) : null}

          {informational.length > 0 ? (
            <div className="flex flex-col gap-1.5">
              <p className="text-xs font-medium text-muted-foreground">
                No se descuenta
              </p>
              <ul className="flex flex-col gap-1.5">
                {informational.map((it) => (
                  <li
                    key={it.key}
                    className="flex items-center justify-between gap-2 rounded-lg border border-dashed p-2 text-sm"
                  >
                    <span className="min-w-0 truncate">{it.ingredientName}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {it.reason}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>

        <ResponsiveModalFooter className="gap-2">
          <Button
            type="button"
            size="lg"
            onClick={confirm}
            disabled={count === 0}
            loading={pending}
          >
            <Check aria-hidden />
            {pending
              ? "Descontando…"
              : count <= 1
                ? "Descontar 1 ingrediente"
                : `Descontar ${count} ingredientes`}
          </Button>
          <ResponsiveModalClose asChild>
            <Button type="button" variant="ghost">
              No descontar
            </Button>
          </ResponsiveModalClose>
        </ResponsiveModalFooter>
      </ResponsiveModalContent>
    </ResponsiveModal>
  );
}

/**
 * "¿Qué hago hoy?" (M6): 2–3 recetas cocinables ahora, con su disponibilidad
 * ("Tienes todo" / "Falta 1: X") y el porqué (deriva del score: caducidad,
 * apetencia…). Acciones por tarjeta: ver receta o añadirla al hueco de hoy.
 */
function TonightDrawer({
  cards,
  onClose,
  onAdded,
}: {
  cards: TonightCard[] | null;
  onClose: () => void;
  onAdded: () => void;
}) {
  const [adding, startAdd] = useTransition();
  const [addingId, setAddingId] = useState<string | null>(null);

  function add(recipeId: string) {
    setAddingId(recipeId);
    startAdd(async () => {
      const r = await addRecipeToMenuAction(recipeId);
      if (r.error) toast.error(r.error);
      else {
        toast.success("Añadida al menú de hoy");
        onAdded();
      }
    });
  }

  return (
    <ResponsiveModal open={cards !== null} onOpenChange={(o) => !o && onClose()}>
      <ResponsiveModalContent>
        <ResponsiveModalHeader>
          <ResponsiveModalTitle>¿Qué hago hoy?</ResponsiveModalTitle>
          <ResponsiveModalDescription>
            Ideas cocinables ahora mismo con lo que tienes.
          </ResponsiveModalDescription>
        </ResponsiveModalHeader>

        {cards && cards.length > 0 ? (
          <ul className="flex max-h-[60vh] flex-col gap-2 overflow-y-auto px-4">
            {cards.map((c) => (
              <li
                key={c.recipeId}
                className="flex flex-col gap-2 rounded-xl border p-3"
              >
                <div className="flex flex-col gap-1">
                  <p className="font-medium">{c.name}</p>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge variant={c.missingCount === 0 ? "secondary" : "outline"}>
                      {c.missingCount === 0
                        ? "Tienes todo"
                        : `Falta 1: ${c.missingName}`}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {c.reason}
                    </span>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1" asChild>
                    <Link href={`/recetas/${c.recipeId}`}>
                      <ChefHat aria-hidden />
                      Ver receta
                    </Link>
                  </Button>
                  <Button
                    className="flex-1"
                    disabled={adding && addingId !== c.recipeId}
                    loading={adding && addingId === c.recipeId}
                    onClick={() => add(c.recipeId)}
                  >
                    <Plus aria-hidden />
                    {adding && addingId === c.recipeId
                      ? "Añadiendo…"
                      : "Añadir a hoy"}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <div className="px-4 pb-2">
            <p className="rounded-xl border border-dashed p-4 text-center text-sm text-muted-foreground">
              Ahora mismo no hay ninguna receta cocinable con lo que tienes.
              Añade recetas a tu recetario o compra lo que falte.
            </p>
          </div>
        )}

        <ResponsiveModalFooter>
          <ResponsiveModalClose asChild>
            <Button type="button" variant="ghost">
              Cerrar
            </Button>
          </ResponsiveModalClose>
        </ResponsiveModalFooter>
      </ResponsiveModalContent>
    </ResponsiveModal>
  );
}
