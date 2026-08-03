"use client";

import { useOptimistic, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AiConsentModal } from "@/features/ai-consent/components/ai-consent-modal";
import {
  BookmarkPlus,
  CalendarOff,
  Check,
  ChefHat,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  CircleCheck,
  Copy,
  Lightbulb,
  MoveRight,
  Pin,
  PinOff,
  Plus,
  RefreshCw,
  ShoppingCart,
  Sparkles,
  Trash2,
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
import { getWeekDays, shiftWeek, todayLocalISO } from "@/lib/dates";
import { vibrateTick } from "@/lib/haptics";
import { formatEuro } from "@/lib/money";
import { normalizeName } from "@/lib/normalize";
import { cn } from "@/lib/utils";
import { saveGeneratedRecipeAction } from "@/features/recipes/actions";
import type { SavedRecipe } from "@/features/recipes/queries";
import { addListItemsAction } from "@/features/shopping-list/actions";
import type { RestockCandidate } from "@/features/shopping-list/queries";
import type { MenuEntry, PendingCheckinEntry } from "../queries";
import type { SlotDef } from "../slots";
import type { WeekBudgetWarning } from "../week-budget";
import type { MissingCandidate } from "../missing";
import { noDeductionsReason, type CookedDeduction } from "../cooked";
import type { TonightCard } from "../tonight";
import { CookedCheckinModal } from "./cooked-checkin-modal";
import {
  CookedDeductionsFields,
  deductionCount,
  deductionPayload,
  initialDeductionQty,
} from "./cooked-deductions-fields";
import {
  CookedRestockFields,
  initialRestockSelection,
  restockPayload,
  restockToastMessage,
} from "./cooked-restock-fields";
import { AiGenerateButton } from "./ai-generate-button";
import { EntryActionTile } from "./entry-action-tile";
import { SlotPickerGrid } from "./slot-picker-grid";
import {
  addMenuEntryAction,
  addRecipeToMenuAction,
  addRecipeToSlotAction,
  computeCookedDeductionsAction,
  computeMissingForMenuAction,
  computeTonightAction,
  confirmCookedDeductionsAction,
  confirmMissingToListAction,
  copyPreviousWeekAction,
  duplicateMenuEntryAction,
  generateMenuAction,
  generateSlotEntryAction,
  moveMenuEntryAction,
  removeMenuEntryAction,
  rerollMenuEntryAction,
  toggleEntryCookedAction,
  toggleEntryPinnedAction,
  toggleEntrySkippedAction,
  updateMenuEntryAction,
} from "../actions";

/**
 * Marca (o desmarca) "cocinado" y, al marcar una entrada con receta, propone
 * descontar sus ingredientes del inventario (M2). Compartido por la acción
 * rápida de la celda (R1) y el botón del drawer de edición: los dos hacen
 * exactamente lo mismo y solo difieren en qué ocurre al terminar, así que la
 * secuencia (toggle → toast → proponer descuento) vive aquí una sola vez.
 *
 * `onResolved` recibe el nuevo `cooked_at` (la fecha de la entrada, o null al
 * desmarcar) cuando no hay nada que descontar; si lo hay, se llama en su lugar
 * a `onProposeDeductions`. El plato queda cocinado pase lo que pase con el
 * descuento: es opt-out por gesto.
 */
async function runToggleCooked({
  entryId,
  cooked,
  recipeId,
  recipeName,
  date,
  onResolved,
  onProposeDeductions,
}: {
  entryId: string;
  cooked: boolean;
  recipeId: string | null;
  recipeName: string;
  date: string;
  onResolved: (cookedAt: string | null) => void;
  onProposeDeductions: (recipeName: string, items: CookedDeduction[]) => void;
}): Promise<void> {
  const r = await toggleEntryCookedAction(entryId, cooked);
  if (r.error) {
    toast.error(r.error);
    return;
  }
  // Al desmarcar (o si es texto libre) no se toca el inventario.
  if (!cooked || !recipeId) {
    toast.success(cooked ? "Marcado como cocinado" : "Ya no está cocinado");
    onResolved(cooked ? date : null);
    return;
  }
  toast.success("Marcado como cocinado");
  const d = await computeCookedDeductionsAction(recipeId);
  const items = d.deductions ?? [];
  if (items.some((it) => it.deductible)) {
    onProposeDeductions(recipeName, items);
    return;
  }
  // Nada que descontar: se DICE por qué. Callarse aquí era indistinguible de que
  // la app no hubiera intentado nada, y encima tenía el motivo calculado.
  const why = noDeductionsReason(items);
  if (why) toast.info(why);
  onResolved(date);
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
  skippedAt: string | null;
  pinned: boolean;
};

export function MenuView({
  weekStart,
  menuId,
  entries,
  pendingCheckin,
  weekCost,
  budgetWarning,
  skippedSlots,
  slots,
  canCopyPrevious,
  recipes,
  householdName,
  settingsSlot,
}: {
  weekStart: string;
  menuId: string | null;
  entries: MenuEntry[];
  /**
   * Platos pasados sin resolver del hogar (R2). Vienen del servidor porque el
   * rango cruza semanas: el lunes, el domingo pendiente es de la semana anterior
   * y no está en `entries`.
   */
  pendingCheckin: PendingCheckinEntry[];
  weekCost: { total: number; complete: boolean } | null;
  /**
   * Aviso de que el menú ya se pasa del objetivo semanal, o null. Solo llega
   * cuando se pasa: el presupuesto cubre TODA la compra y el coste solo los
   * platos, así que caber dentro no demuestra nada (ver `week-budget.ts`).
   */
  budgetWarning: WeekBudgetWarning | null;
  /**
   * Huecos que el hogar no planifica, como claves `díaDeLaSemana|hueco`
   * (0 = lunes). Vienen ya resueltos de las reglas activas: la vista solo los
   * pinta.
   */
  skippedSlots: string[];
  slots: SlotDef[];
  canCopyPrevious: boolean;
  /**
   * Recetario del hogar, para el buscador del «+» (elegir una receta guardada en
   * vez de escribir texto libre). Lo carga ya la página para los ajustes del
   * menú: no cuesta ninguna consulta extra.
   */
  recipes: SavedRecipe[];
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
  // Acción rápida "Lo cocinamos" desde la celda (R1): el id que se está
  // guardando (para el spinner de SU botón, no de todos).
  const [markingId, setMarkingId] = useState<string | null>(null);
  const [, startMarkCooked] = useTransition();
  // Repaso de platos pasados (R2): se abre desde el chip de la cabecera.
  const [checkinOpen, setCheckinOpen] = useState(false);
  /*
    Feedback inmediato de la acción rápida: el ✔ aparece en la celda antes de que
    el servidor conteste y la capa optimista se desvanece sola cuando termina la
    transición (con `router.refresh()` dentro, así que ya llega el dato real).
    Si la action falla, el ✔ se retira igual: la verdad la tiene el servidor.
  */
  const [optimisticEntries, markCookedOptimistic] = useOptimistic(
    entries,
    (list: MenuEntry[], entryId: string) =>
      list.map((e) => (e.id === entryId ? { ...e, cookedAt: e.date } : e)),
  );

  const days = getWeekDays(weekStart);
  const today = todayLocalISO();
  // Varios platos por hueco: agrupamos por `date|slot` (ya vienen por posición).
  const bySlot = new Map<string, MenuEntry[]>();
  for (const e of optimisticEntries) {
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
  const skipped = new Set(skippedSlots);
  // Hay trabajo que la regeneración respetuosa conservaría (fijado o manual):
  // solo entonces tiene sentido ofrecer el "Rehacer todo" destructivo.
  const hasPreservable = entries.some((e) => e.pinned || e.source === "manual");
  const [confirmReplace, setConfirmReplace] = useState(false);
  const [copying, startCopy] = useTransition();
  /*
    Cascada de entrada de los días (E). Cambiar esta clave remonta la semana y
    con ella vuelven a correr las animaciones CSS de cada tarjeta; es el patrón
    que ya usamos para animar listas con estado.

    Empieza en 0 y la animación solo se aplica cuando ya ha subido: así la carga
    normal de la página pinta la semana de golpe (nada de retener el contenido
    tras un escalonado en el primer render) y la cascada queda reservada al
    momento en que la semana LLEGA —generada o copiada—, que es cuando de verdad
    hay algo nuevo que mirar.
  */
  const [revealKey, setRevealKey] = useState(0);
  // Acción de IA a reintentar tras aceptar el consentimiento (null ⇒ modal cerrado).
  const [aiConsentRetry, setAiConsentRetry] = useState<null | (() => void)>(null);

  function copyPrevious() {
    startCopy(async () => {
      const r = await copyPreviousWeekAction(weekStart);
      if (r.error) toast.error(r.error);
      else {
        toast.success("Semana copiada de la anterior");
        setRevealKey((k) => k + 1);
        router.refresh();
      }
    });
  }

  function generate(mode: "fill" | "replace") {
    setConfirmReplace(false);
    startGenerate(async () => {
      const r = await generateMenuAction(weekStart, mode);
      if (r.needsAiConsent) {
        // Sin consentimiento de IA: pedimos aceptar y reintentamos al aceptar.
        // El botón de generar no vive dentro de otro modal, así que abrir este
        // no anida ResponsiveModal.
        setAiConsentRetry(() => () => generate(mode));
        return;
      }
      if (r.error) toast.error(r.error);
      else {
        toast.success(mode === "replace" ? "Menú rehecho" : "Menú generado");
        setRevealKey((k) => k + 1);
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
      skippedAt: null,
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
      skippedAt: entry.skippedAt,
      pinned: entry.pinned,
    });
  }

  /**
   * "Lo cocinamos" a un toque desde la celda (R1), sin abrir el drawer: mismo
   * flujo que el botón del drawer (misma action, mismo descuento propuesto).
   * Solo marca; desmarcar sigue viviendo en el drawer para que un toque
   * accidental no des-cocine un plato (el descuento no se revierte).
   */
  function quickMarkCooked(entry: MenuEntry) {
    vibrateTick();
    setMarkingId(entry.id);
    startMarkCooked(async () => {
      markCookedOptimistic(entry.id);
      await runToggleCooked({
        entryId: entry.id,
        cooked: true,
        recipeId: entry.recipeId,
        recipeName: entry.recipeName ?? entry.freeText ?? "",
        date: entry.date,
        onResolved: () => router.refresh(),
        onProposeDeductions: (recipeName, items) => {
          setCookedDeductions({ recipeName, items });
          router.refresh();
        },
      });
      setMarkingId(null);
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

      {/*
        Repaso de días pasados (R2): solo aparece si hay algo que preguntar, y
        entonces es lo primero que se ve bajo la semana. Discreto (outline, no
        primario): el primario de esta pantalla es generar el menú.
      */}
      {pendingCheckin.length > 0 ? (
        <Button
          variant="outline"
          onClick={() => setCheckinOpen(true)}
          className="self-center print:hidden"
        >
          <ChefHat aria-hidden />
          {pendingCheckin.length === 1
            ? "Repasar 1 plato de días pasados"
            : `Repasar días pasados (${pendingCheckin.length})`}
        </Button>
      ) : null}

      {weekCost ? (
        <div className="-mt-2 flex flex-col gap-1 print:hidden">
          <p className="text-center text-xs text-muted-foreground">
            Coste estimado de la semana:{" "}
            <span className="font-medium text-chart-3">
              {weekCost.complete ? "≈ " : "≥ "}
              {formatEuro(weekCost.total)}
            </span>
            {weekCost.complete ? "" : " (parcial)"}
          </p>
          {/*
            `warning` y no `destructive`: esto es un plan, no un gasto ya hecho.
            Nada ha salido mal todavía y la semana se puede cambiar entera —de
            hecho el aviso está justo encima del botón de generar—.
          */}
          {budgetWarning ? (
            <p className="text-center text-xs font-medium text-warning">
              {budgetWarning.partial ? "Ya se pasa " : "Se pasa "}
              {formatEuro(budgetWarning.overBy)} de lo que te toca gastar esta
              semana ({formatEuro(budgetWarning.target)})
              {budgetWarning.partial ? ", y aún hay platos sin precio." : "."}
            </p>
          ) : null}
        </div>
      ) : null}

      {/*
        Un solo primario en pantalla: generar con IA. Los ajustes que condicionan
        a la IA van a su lado (icono) y compartir/imprimir en la cabecera de la
        página. «¿Qué hago hoy?» queda como enlace: sigue a un toque, pero deja
        de competir con el generador.
      */}
      <div className="flex flex-col gap-2 print:hidden">
        <div className="flex items-center gap-2">
          <AiGenerateButton
            onClick={() => generate("fill")}
            loading={generating}
            busyLabel={
              hasPreservable
                ? "Completando el menú con IA"
                : "Generando el menú con IA"
            }
            size="lg"
            className="flex-1"
          >
            {hasPreservable ? "Completar menú con IA" : "Generar menú con IA"}
          </AiGenerateButton>
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
              Se borrará lo que queda de semana —incluidos tus platos fijados y
              los que has editado o añadido a mano— y se generará un menú nuevo.
              Los días que ya han pasado se quedan como están. Esta acción no se
              puede deshacer.
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
      <div
        key={revealKey}
        className="flex flex-col gap-3 lg:grid lg:grid-cols-2 lg:items-start lg:gap-3 xl:grid-cols-3 2xl:grid-cols-7 2xl:gap-2 print:!grid print:!grid-cols-7 print:!gap-2"
      >
        {days.map((date, dayIndex) => (
          <div
            key={date}
            /*
              Escalón de 60ms por día: los siete entran en ~0.7s contando la
              duración. Va inline porque son siete valores distintos calculados
              del índice; `prefers-reduced-motion` lo neutraliza igual, porque la
              regla global de globals.css pisa el retardo con `!important`.
            */
            style={
              revealKey > 0
                ? { animationDelay: `${dayIndex * 60}ms` }
                : undefined
            }
            // 120mm de alto por columna llenan la hoja (≈160mm de los 186mm
            // útiles de un A4 horizontal) dejando holgura para las impresoras
            // que imponen un margen mayor que el `@page` que pedimos.
            //
            // El día de hoy se distingue con el borde de marca; en papel vuelve
            // al borde neutro (la hoja de la nevera no sabe qué día la miras).
            className={cn(
              "rounded-xl border p-3 print:flex print:min-h-[120mm] print:break-inside-avoid print:flex-col print:rounded-md print:p-2.5",
              date === today && "border-primary print:border-border",
              // `fill-mode-both` NO es decorativo y no sobra: `animate-in` deja
              // el fill-mode en `none`, y entonces cada día se vería normal
              // durante su retardo, desaparecería de golpe al arrancar su turno
              // y entraría — un parpadeo, no una cascada. Con `both` el día
              // espera ya invisible. (La utilidad tiene que ser esta: un
              // `[animation-fill-mode:both]` arbitrario lo pisa `animate-in`.)
              //
              // Y por eso mismo `print:animate-none`: si la entrada empieza en
              // opacidad 0, imprimir mientras corre dejaría días en blanco en el
              // papel. Sin animación el día vuelve a su estado natural, visible.
              revealKey > 0 &&
                "animate-in fade-in slide-in-from-bottom-2 fill-mode-both duration-300 print:animate-none",
            )}
          >
            <div className="mb-2 flex items-center gap-2">
              <p className="text-sm font-semibold capitalize print:text-[11pt]">
                {format(parseISO(date), "EEEE d", { locale: es })}
              </p>
              {date === today ? <Badge className="print:hidden">Hoy</Badge> : null}
            </div>
            <div
              className={cn(
                "grid items-start gap-2 2xl:grid-cols-1 print:!grid-cols-1 print:flex-1 print:auto-rows-fr print:gap-2",
                slots.length === 3 ? "grid-cols-3" : "grid-cols-2",
              )}
            >
              {slots.map((slot) => {
                const slotEntries = bySlot.get(`${date}|${slot.key}`) ?? [];
                // Hueco que el hogar ha dicho que no se planifique. Solo se
                // anuncia si está VACÍO: sobre un plato ya puesto, el rótulo
                // contradiría lo que se está viendo.
                const notPlanned =
                  slotEntries.length === 0 &&
                  skipped.has(`${dayIndex}|${slot.key}`);
                return (
                  <div
                    key={slot.key}
                    // Contenedor de consulta: cuando la columna del hueco es
                    // estrecha (3 slots en móvil, 3 días por fila en xl…) la
                    // acción rápida se apila bajo el plato en vez de robarle
                    // 44px de ancho al nombre. Solo CSS, un único árbol.
                    className="@container flex flex-col gap-1.5 print:gap-0.5"
                  >
                    <span className="text-xs font-medium text-muted-foreground print:text-[8pt] print:font-bold print:tracking-wider print:text-primary print:uppercase">
                      {slot.label}
                    </span>
                    {slotEntries.map((entry) => {
                      const text = entry.recipeName ?? entry.freeText ?? "";
                      const cooked = Boolean(entry.cookedAt);
                      // Pasado sin resolver: el día ya pasó y nadie ha dicho si
                      // se cocinó. Tratamiento NEUTRO a propósito: `warning`
                      // significa "caduca pronto" en toda la app.
                      const unresolved = !cooked && entry.date < today;
                      // Marcar solo tiene sentido en hoy o antes (igual que en
                      // el drawer); en futuro ni se ofrece.
                      const canQuickMark = !cooked && entry.date <= today;
                      return (
                        <div
                          key={entry.id}
                          className="flex flex-col gap-1 @min-[9rem]:flex-row print:block"
                        >
                          <button
                            type="button"
                            onClick={() => openEdit(date, slot, entry)}
                            className="flex min-h-11 flex-1 items-start gap-1.5 rounded-lg border p-2 text-left text-sm transition-colors hover:bg-muted print:min-h-0 print:border-0 print:p-0 print:text-[10pt]"
                          >
                            {/* Cocinado, pendiente y fijado son estado de la app,
                                no del menú que cuelgas en la nevera: no se
                                imprimen. */}
                            {cooked ? (
                              <Check
                                className="mt-0.5 size-3.5 shrink-0 text-success print:hidden"
                                aria-label="Cocinado"
                              />
                            ) : null}
                            {unresolved ? (
                              <span className="mt-1.5 flex shrink-0 print:hidden">
                                <span
                                  aria-hidden
                                  className="size-1.5 rounded-full bg-muted-foreground"
                                />
                                <span className="sr-only">Sin marcar</span>
                              </span>
                            ) : null}
                            {entry.pinned ? (
                              <Pin
                                className="mt-0.5 size-3.5 shrink-0 text-muted-foreground print:hidden"
                                aria-label="Fijado"
                              />
                            ) : null}
                            {/* Cocinado se atenúa, no se tacha: un plato tachado
                                se lee como "eliminado". */}
                            <span
                              className={cn(
                                "line-clamp-2 print:line-clamp-none",
                                cooked && "text-muted-foreground print:text-inherit",
                              )}
                            >
                              {text}
                            </span>
                          </button>
                          {canQuickMark ? (
                            <Button
                              variant="outline"
                              size="icon"
                              aria-label={`Marcar como cocinado: ${text}`}
                              loading={markingId === entry.id}
                              onClick={() => quickMarkCooked(entry)}
                              className="h-auto min-h-11 w-full self-stretch text-muted-foreground @min-[9rem]:w-11 print:hidden"
                            >
                              <CircleCheck aria-hidden className="size-5" />
                            </Button>
                          ) : null}
                        </div>
                      );
                    })}
                    {/*
                      Hueco libre: solo un «+». Con el texto «Añadir plato» en
                      cada hueco había más botones que platos y la semana se
                      leía como interfaz, no como menú. El nombre completo vive
                      en el aria-label y el target sigue siendo de 44px.

                      Si el hogar no planifica ese hueco, el mismo botón lo DICE
                      en vez de enseñar un «+» mudo: un hueco vacío sin más se
                      lee como que a la IA se le olvidó. Sigue abriendo el alta,
                      porque la regla es una preferencia, no una prohibición.
                    */}
                    <button
                      type="button"
                      onClick={() => openAdd(date, slot)}
                      aria-label={
                        notPlanned
                          ? `${slot.label} del ${format(parseISO(date), "EEEE d", {
                              locale: es,
                            })}: no se planifica. Añadir plato igualmente`
                          : `Añadir plato · ${slot.label} del ${format(
                              parseISO(date),
                              "EEEE d",
                              { locale: es },
                            )}`
                      }
                      className="flex min-h-11 items-center justify-center rounded-lg border border-dashed text-muted-foreground transition-colors hover:bg-muted hover:text-foreground print:hidden"
                    >
                      {notPlanned ? (
                        <span className="px-2 text-center text-xs text-balance">
                          No se planifica
                        </span>
                      ) : (
                        <Plus className="size-4" aria-hidden />
                      )}
                    </button>
                    {/* En papel el hueco vacío no puede quedar mudo (el «+» no
                        se imprime): una raya, como en la imagen de compartir; o
                        el motivo, si es que ese hueco no se planifica. */}
                    {slotEntries.length === 0 ? (
                      <span
                        aria-hidden
                        className="hidden text-muted-foreground print:block print:text-[10pt]"
                      >
                        {notPlanned ? "No se planifica" : "—"}
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
        recipes={recipes}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          router.refresh();
        }}
        onCookedChange={(cookedAt) => {
          // Refresca los datos sin cerrar el drawer y refleja el nuevo estado.
          // Cocinar limpia "no se hizo" en la BD: reflejarlo también aquí.
          setEditing((prev) =>
            prev ? { ...prev, cookedAt, skippedAt: cookedAt ? null : prev.skippedAt } : prev,
          );
          router.refresh();
        }}
        onSkippedChange={(skippedAt) => {
          setEditing((prev) =>
            prev ? { ...prev, skippedAt, cookedAt: skippedAt ? null : prev.cookedAt } : prev,
          );
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

      <CookedCheckinModal
        open={checkinOpen}
        onOpenChange={setCheckinOpen}
        entries={pendingCheckin}
        slots={slots}
        onResolved={() => router.refresh()}
      />

      <AiConsentModal
        open={aiConsentRetry !== null}
        onOpenChange={(o) => {
          if (!o) setAiConsentRetry(null);
        }}
        onAccepted={() => {
          const retry = aiConsentRetry;
          setAiConsentRetry(null);
          retry?.();
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

function EditEntryDrawer({
  editing,
  weekStart,
  slots,
  recipes,
  onClose,
  onSaved,
  onCookedChange,
  onSkippedChange,
  onProposeDeductions,
}: {
  editing: Editing | null;
  weekStart: string;
  slots: SlotDef[];
  recipes: SavedRecipe[];
  onClose: () => void;
  onSaved: () => void;
  onCookedChange: (cookedAt: string | null) => void;
  onSkippedChange: (skippedAt: string | null) => void;
  onProposeDeductions: (recipeName: string, items: CookedDeduction[]) => void;
}) {
  const [value, setValue] = useState("");
  const [mode, setMode] = useState<"edit" | "move" | "duplicate">("edit");
  const [pending, startTransition] = useTransition();
  const [savingRecipe, startSaveRecipe] = useTransition();
  const [cooking, startCooking] = useTransition();
  const [skipping, startSkipping] = useTransition();
  const [picking, startPicking] = useTransition();
  const [pinningPending, startPinning] = useTransition();
  const [rerolling, startReroll] = useTransition();
  const [generatingSlot, startGenerateSlot] = useTransition();
  const [addingRecipe, startAddRecipe] = useTransition();
  const [addingRecipeId, setAddingRecipeId] = useState<string | null>(null);

  const isNew = editing?.entryId == null;
  const cooked = Boolean(editing?.cookedAt);
  const skipped = Boolean(editing?.skippedAt);
  const pinned = Boolean(editing?.pinned);
  // "Lo cocinamos" solo tiene sentido en entradas ya guardadas y de hoy/pasado.
  const canMarkCooked = Boolean(editing?.entryId && editing.date <= todayLocalISO());
  // "No se hizo" solo en días YA pasados (por el de hoy no se pregunta todavía)
  // y sin cocinar: las dos marcas son excluyentes.
  const canMarkSkipped = Boolean(
    editing?.entryId && editing.date < todayLocalISO() && !cooked,
  );
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
    setAddingRecipeId(null);
  }

  /*
    Sugerencias del recetario para el hueco vacío. Con algo escrito, filtra por
    nombre (sin acentos ni mayúsculas, igual que la BD); sin nada escrito, propone
    las recetas del hueco —el desayuno no lo declara ninguna receta (meal_types es
    comida/cena), así que ahí, o si ninguna encaja, valen todas—.
  */
  const query = normalizeName(value);
  const slotRecipes = recipes.filter((r) =>
    editing ? r.mealTypes.includes(editing.slot) : false,
  );
  const suggestions = (
    query
      ? recipes.filter((r) => normalizeName(r.name).includes(query))
      : slotRecipes.length > 0
        ? slotRecipes
        : recipes
  ).slice(0, 6);
  // Cualquier escritura en curso bloquea el resto de vías de añadir el plato.
  const addBusy = pending || generatingSlot || addingRecipe;

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

  /**
   * Genera con IA el plato de este hueco (solo al añadir). Sin consentimiento de
   * IA nos quedamos en el aviso por toast: abrir aquí el modal de consentimiento
   * encadenaría dos ResponsiveModal y el segundo se cerraría solo. Es lo mismo
   * que hace «Otra idea» en un plato ya puesto.
   */
  function generateSlot() {
    if (!editing) return;
    const { date, slot } = editing;
    startGenerateSlot(async () => {
      const r = await generateSlotEntryAction(weekStart, date, slot);
      if (r.error) toast.error(r.error);
      else {
        toast.success("Plato generado");
        onSaved();
      }
    });
  }

  /** Añade una receta del recetario al hueco, enlazada (no como texto libre). */
  function addRecipe(recipeId: string) {
    if (!editing) return;
    const { date, slot } = editing;
    setAddingRecipeId(recipeId);
    startAddRecipe(async () => {
      const r = await addRecipeToSlotAction(weekStart, date, slot, recipeId);
      if (r.error) toast.error(r.error);
      else {
        toast.success("Receta añadida al menú");
        onSaved();
      }
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
    startCooking(() =>
      runToggleCooked({
        entryId,
        cooked: next,
        recipeId,
        recipeName,
        date,
        onResolved: onCookedChange,
        onProposeDeductions,
      }),
    );
  }

  /**
   * "No se hizo" (R2): paridad con el repaso desde el propio plato. Deja huella
   * para no volver a preguntar y se puede deshacer (el tile va en `aria-pressed`).
   * No toca el inventario ni ahora ni al deshacerlo.
   */
  function toggleSkipped() {
    if (!editing?.entryId) return;
    const entryId = editing.entryId;
    const date = editing.date;
    const next = !skipped;
    startSkipping(async () => {
      const r = await toggleEntrySkippedAction(entryId, next);
      if (r.error) {
        toast.error(r.error);
        return;
      }
      toast.success(next ? "Anotado: no se hizo" : "Vuelve a estar pendiente");
      onSkippedChange(next ? date : null);
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
                  ? "Genéralo con IA, elige una receta de tu recetario o escríbelo."
                  : "Edita o quita este plato."}
          </ResponsiveModalDescription>
        </ResponsiveModalHeader>

        {picker ? (
          <div className="flex flex-col gap-3 px-4">
            <SlotPickerGrid
              days={days}
              slots={slots}
              busy={picking}
              originKey={editing ? `${editing.date}|${editing.slot}` : null}
              // Mover: no al propio hueco, ni a un futuro un plato cocinado.
              // Duplicar: el propio hueco sí vale (una copia más ese día).
              originBlocked={mode === "move"}
              isBlocked={(date) =>
                mode === "move" && cooked && date > todayLocalISO()
              }
              onPick={pick}
            />
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
          {/*
            Hueco vacío: la IA rellena SOLO este hueco (1 plato, sin tocar el
            resto de la semana). Es la vía rápida; debajo quedan las manuales.
          */}
          {isNew ? (
            <Button
              type="button"
              size="lg"
              onClick={generateSlot}
              loading={generatingSlot}
              disabled={addBusy && !generatingSlot}
            >
              <Sparkles aria-hidden />
              {generatingSlot ? "Generando plato…" : "Generar este hueco con IA"}
            </Button>
          ) : null}

          <div className="flex flex-col gap-2">
            <Label htmlFor="menu-dish">Plato</Label>
            <Input
              id="menu-dish"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              autoComplete="off"
              placeholder="p. ej. Lentejas con verduras"
            />
            {/*
              Al añadir, lo que escribes busca en tu recetario: elegir una receta
              deja la entrada ENLAZADA (cuenta para el coste de la semana, para
              "lo que falte" y para descontar del inventario al cocinarla), algo
              que el texto libre no puede hacer.
            */}
            {isNew ? (
              <>
                {suggestions.length > 0 ? (
                  <ul className="flex max-h-56 flex-col gap-1.5 overflow-y-auto">
                    {suggestions.map((r) => (
                      <li key={r.id}>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => addRecipe(r.id)}
                          loading={addingRecipe && addingRecipeId === r.id}
                          disabled={addBusy && addingRecipeId !== r.id}
                          className="w-full justify-start"
                        >
                          <ChefHat aria-hidden />
                          <span className="min-w-0 flex-1 truncate text-left">
                            {r.name}
                          </span>
                          <span className="shrink-0 text-xs text-muted-foreground">
                            receta
                          </span>
                        </Button>
                      </li>
                    ))}
                  </ul>
                ) : null}
                {value.trim() ? (
                  <Button
                    type="submit"
                    variant="outline"
                    loading={pending}
                    disabled={addBusy && !pending}
                    className="justify-start"
                  >
                    <Plus aria-hidden />
                    {/*
                      El verbo y la pista van FUERA del truncado: con todo en un
                      solo span, un plato largo se comía el "como texto libre" y
                      la fila dejaba de decir qué hacía.
                    */}
                    {pending ? (
                      <span className="flex-1 text-left">Añadiendo…</span>
                    ) : (
                      <>
                        <span className="shrink-0">Añadir</span>
                        <span className="min-w-0 flex-1 truncate text-left">
                          «{value.trim()}»
                        </span>
                        <span className="shrink-0 text-xs text-muted-foreground">
                          texto libre
                        </span>
                      </>
                    )}
                  </Button>
                ) : null}
              </>
            ) : null}
          </div>
          {/*
            Acciones secundarias del plato en rejilla de iconos con etiqueta:
            apiladas como botones anchos eran hasta seis filas que enterraban el
            plato y el «Guardar». Cada celda mantiene los 44px de target.
          */}
          {!isNew ? (
            <div className="grid grid-cols-3 gap-2">
              {canMarkSkipped ? (
                <EntryActionTile
                  icon={CalendarOff}
                  label={skipped ? "No se hizo · deshacer" : "No se hizo"}
                  onClick={toggleSkipped}
                  loading={skipping}
                  pressed={skipped}
                />
              ) : null}
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
            {/*
              Al añadir no hay «Guardar» en el pie: las tres vías (IA, receta y
              texto libre) están arriba, cada una a un toque, y un primario aquí
              solo repetiría la de texto libre.
            */}
            {!isNew ? (
              <Button
                type="submit"
                size="lg"
                disabled={!value.trim()}
                loading={pending}
              >
                {pending ? "Guardando…" : "Guardar"}
              </Button>
            ) : null}
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
 *
 * Si el descuento deja algo a cero o bajo mínimo, el modal NO se cierra: pasa a
 * un segundo paso que ofrece apuntarlo en la lista. Cerrar el círculo aquí es lo
 * que evita el viaje al supermercado sin lo que se acabó anteayer. Es un paso
 * dentro del MISMO modal —vista que sustituye a la anterior, como el "Mover a…"
 * del repaso— porque anidar `ResponsiveModal` hace que el segundo se cierre solo.
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
  /*
    Segundo paso: lo que se ha quedado sin existencias al descontar. Que no sea
    null significa además que el descuento YA está aplicado, así que a partir de
    ahí cerrar de cualquier forma (botón o gesto) tiene que refrescar los datos.
  */
  const [restock, setRestock] = useState<RestockCandidate[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Al abrir con un conjunto nuevo, prellenar cantidades de los descontables.
  const [lastKey, setLastKey] = useState<string | null>(null);
  const key = data ? data.items.map((i) => i.key).join(",") : null;
  if (key !== lastKey) {
    setLastKey(key);
    setQty(initialDeductionQty(data?.items ?? []));
    setRestock(null);
    setSelected(new Set());
  }

  const items = data?.items ?? [];
  const count = deductionCount(items, qty);

  function confirm() {
    if (!data) return;
    startTransition(async () => {
      const r = await confirmCookedDeductionsAction(
        deductionPayload(items, qty),
      );
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
      const ranOut = r.restock ?? [];
      if (ranOut.length > 0) {
        setRestock(ranOut);
        setSelected(initialRestockSelection(ranOut));
        return;
      }
      onDone();
    });
  }

  function addToList() {
    if (!restock) return;
    startTransition(async () => {
      const r = await addListItemsAction(restockPayload(restock, selected));
      if (r.error) {
        toast.error(r.error);
        return;
      }
      toast.success(restockToastMessage(r));
      onDone();
    });
  }

  return (
    <ResponsiveModal
      open={data !== null}
      // Con el descuento ya aplicado, cerrar sin apuntar sigue necesitando
      // refresco: el inventario cambió aunque no se apunte nada.
      onOpenChange={(o) => !o && (restock ? onDone() : onClose())}
    >
      <ResponsiveModalContent>
        <ResponsiveModalHeader>
          <ResponsiveModalTitle>
            {restock ? "¿Lo apuntamos?" : "Descontar del inventario"}
          </ResponsiveModalTitle>
          <ResponsiveModalDescription>
            {restock
              ? "Al cocinar se te ha terminado esto. Desmarca lo que no quieras apuntar."
              : `Ajusta lo que has gastado de «${data?.recipeName}». Se descuenta del lote que caduca antes. Desmarcar «cocinado» no repone el stock.`}
          </ResponsiveModalDescription>
        </ResponsiveModalHeader>

        <div className="flex max-h-[55vh] flex-col gap-3 overflow-y-auto px-4">
          {restock ? (
            <CookedRestockFields
              candidates={restock}
              selected={selected}
              onToggle={(productId, on) =>
                setSelected((prev) => {
                  const next = new Set(prev);
                  if (on) next.add(productId);
                  else next.delete(productId);
                  return next;
                })
              }
            />
          ) : (
            <CookedDeductionsFields
              items={items}
              qty={qty}
              onQtyChange={(k, value) =>
                setQty((prev) => ({ ...prev, [k]: value }))
              }
            />
          )}
        </div>

        <ResponsiveModalFooter className="gap-2">
          {restock ? (
            <>
              <Button
                type="button"
                size="lg"
                onClick={addToList}
                disabled={selected.size === 0}
                loading={pending}
              >
                <ShoppingCart aria-hidden />
                {selected.size <= 1
                  ? "Apuntar 1 en la lista"
                  : `Apuntar ${selected.size} en la lista`}
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={onDone}
                disabled={pending}
              >
                Ahora no
              </Button>
            </>
          ) : (
            <>
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
            </>
          )}
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
