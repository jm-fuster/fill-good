"use client";

import { useEffect, useOptimistic, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { aiProvenanceAttrs } from "@/lib/ai/provenance";
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
  Trash,
  TriangleAlert,
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
import { actionErrorMessage, safeAction } from "@/lib/action-error";
import { vibrateTick } from "@/lib/haptics";
import { formatEuro } from "@/lib/money";
import { normalizeName } from "@/lib/normalize";
import { cn } from "@/lib/utils";
import {
  fillRecipeDetailsAction,
  getRecipeCookingAction,
  saveGeneratedRecipeAction,
} from "@/features/recipes/actions";
import { RecipeCookingDetails } from "@/features/recipes/components/recipe-cooking";
import type {
  RecipeCooking,
  SavedRecipe,
} from "@/features/recipes/queries";
import { addListItemsAction } from "@/features/shopping-list/actions";
import type { RestockCandidate } from "@/features/shopping-list/queries";
import type {
  MenuEntry,
  MenuPrefs,
  MenuRule,
  PendingCheckinEntry,
} from "../queries";
import type { SlotDef } from "../slots";
import type { WeekBudgetWarning } from "../week-budget";
import type { MissingCandidate } from "../missing";
import { noDeductionsReason, type CookedDeduction } from "../cooked";
import type { SkipReason } from "../skip-reason";
import type { TonightCard } from "../tonight";
import { CookedCheckinModal } from "./cooked-checkin-modal";
import { SkipReasonChips } from "./skip-reason-chips";
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
import { AiGenerateButton, SLOT_GENERATION_STEPS } from "./ai-generate-button";
import { EntryActionTile } from "./entry-action-tile";
import {
  MenuSettings,
  MenuSettingsPanel,
  useMenuSettingsState,
} from "./menu-settings";
import { SlotPickerGrid } from "./slot-picker-grid";
import { TodayStrip } from "./today-strip";
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
  setEntrySkippedReasonAction,
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
  const r = await safeAction(
    toggleEntryCookedAction(entryId, cooked),
    "No se pudo marcar el plato.",
  );
  if (r.error) {
    toast.error(r.error);
    return;
  }
  // Ya estaba cocinado (lo marcó otra persona, o una vista vieja): nada que
  // descontar otra vez.
  if (r.already) {
    toast.info("Ya estaba marcado como cocinado.");
    onResolved(date);
    return;
  }
  // Al desmarcar (o si es texto libre) no se toca el inventario.
  if (!cooked || !recipeId) {
    toast.success(cooked ? "Marcado como cocinado" : "Ya no está cocinado");
    onResolved(cooked ? date : null);
    return;
  }
  toast.success("Marcado como cocinado");
  const d = await safeAction(
    computeCookedDeductionsAction(recipeId),
    "No se pudo calcular el descuento.",
  );
  // El plato ya está marcado: si lo que falla es la propuesta, se dice y se da
  // por resuelto, en vez de callarse como si no hubiera nada que descontar.
  if (d.error) {
    toast.error(d.error);
    onResolved(date);
    return;
  }
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
  /** Motivo del descarte, para que los chips lleguen con el suyo ya marcado. */
  skippedReason: string | null;
  pinned: boolean;
  /** La receta enlazada la inventó la IA al generar el menú (`recipes.source`). */
  recipeFromAi: boolean;
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
  cookableRecipeIds,
  recipes,
  householdName,
  prefs,
  rules,
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
   * Recetas de HOY que tienen pasos escritos, o sea las que se pueden cocinar
   * paso a paso. Solo las de hoy: los pasos no viajan en la consulta de la
   * semana (serían catorce recetas completas para que se lea una), así que esto
   * lo resuelve una consulta aparte con los ids del día — y lo que cruza al
   * cliente es esta lista, no el texto.
   */
  cookableRecipeIds: string[];
  /**
   * Recetario del hogar, para el buscador del «+» (elegir una receta guardada en
   * vez de escribir texto libre). Lo carga ya la página para los ajustes del
   * menú: no cuesta ninguna consulta extra.
   */
  recipes: SavedRecipe[];
  /** Solo para la cabecera de la hoja impresa (D5). */
  householdName: string | null;
  /**
   * Preferencias y reglas del hogar: esta vista no las usa, las pasa tal cual a
   * `MenuSettings`, que viaja junto al botón de generar. Antes llegaba ya
   * montado como slot desde el servidor —más limpio—, pero el menú de ese icono
   * necesita disparar el «rehacer todo», y esa confirmación (y `generate`) viven
   * aquí; un callback no se puede pasar desde un Server Component.
   */
  prefs: MenuPrefs;
  rules: MenuRule[];
}) {
  const router = useRouter();
  const [generating, startGenerate] = useTransition();
  const [addingList, startAddList] = useTransition();
  const [editing, setEditing] = useState<Editing | null>(null);
  /*
    Candidatos a añadir a la lista, con el menú al que pertenecen. El id viaja
    JUNTO a ellos en vez de leerse del prop al confirmar porque el repaso se abre
    también desde el toast de «Menú generado», y ahí el menú puede acabar de
    crearse: el prop seguiría en null hasta que aterrice el `router.refresh()` y
    confirmar no habría escrito nada (sin error, además: la guarda `if (!menuId)`
    del drawer se limitaba a no hacer nada).
  */
  const [missing, setMissing] = useState<{
    menuId: string;
    candidates: MissingCandidate[];
  } | null>(null);
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
  /*
    Descarte de un plato de HOY desde la tira, con la pregunta del motivo detrás.
    Vive aquí y no en `TodayStrip` por una razón concreta: la tira se dibuja según
    lo que queda SIN resolver, así que en un hogar que solo planifica cena,
    descartar el único plato del día la desmonta —y con ella se iría el estado de
    la pregunta antes de poder contestarla—. Guardando el plato aquí, la tira se
    queda montada mientras hay algo que preguntar (ver `showTodayStrip`).

    Hace falta guardarlo entero, y no su id: `toggleEntrySkippedAction` revalida
    `/menus`, y en la ruta revalidada Next devuelve la página ya re-renderizada en
    la MISMA respuesta de la action (el modelo de una sola vuelta de Next 16). O
    sea que en cuanto se escribe el descarte, el plato desaparece de `entries` y la
    fila no se puede reconstruir de ahí.
  */
  const [skipAsking, setSkipAsking] = useState<MenuEntry | null>(null);
  const [skippingId, setSkippingId] = useState<string | null>(null);
  const [, startSkip] = useTransition();
  // Repaso de platos pasados (R2): se abre desde el chip de la cabecera.
  const [checkinOpen, setCheckinOpen] = useState(false);
  // El panel de ajustes guarda aquí su estado: ver `useMenuSettingsState`.
  const menuSettings = useMenuSettingsState(prefs);
  /*
    Cada apertura del repaso es una sesión nueva. En /menus el modal vive
    montado toda la visita, y lo que recordaba de la vez anterior (qué filas ya
    había contestado) seguía ahí: si luego desmarcabas «cocinado» en la
    cuadrícula, ese plato volvía a estar pendiente pero el repaso lo seguía
    escondiendo. La clave lo remonta limpio al abrir.
  */
  const [checkinSession, setCheckinSession] = useState(0);
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
  /*
    Huecos que «completar con IA» puede llenar: sin plato, sin regla de «no se
    planifica» y **de hoy en adelante** —el generador no replanifica un día ya
    vivido (el candado de `rules.ts`), así que un hueco pasado que quedó vacío no
    es trabajo pendiente y contarlo dejaría el botón mandando para siempre—.

    De esto depende dónde va el botón: mientras haya huecos, arriba; con la
    semana completa, debajo de la semana. Que el primario ocupe el sitio del
    contenido cuando no tiene nada que hacer es lo que dejaba el «Lunes 3»
    asomando en el filo de la pantalla.
  */
  let freeSlots = 0;
  days.forEach((date, dayIndex) => {
    if (date < today) return;
    for (const slot of slots) {
      const taken = (bySlot.get(`${date}|${slot.key}`) ?? []).length > 0;
      if (!taken && !skipped.has(`${dayIndex}|${slot.key}`)) freeSlots += 1;
    }
  });
  const ctaOnTop = freeSlots > 0;
  /*
    Semana ENTERA en el pasado (se llega con «‹»). Ahí esta pantalla es un
    registro, no un plan, y las tres acciones de planificar no pintan nada:

     - generar/completar y rehacer los rechaza ya el servidor
       (`generateMenuAction`), así que el botón prometía lo que la app iba a negar
       con un error;
     - copiar la semana anterior sí funcionaba, y era peor que no funcionar:
       sembraba platos en días ya vividos que el repaso preguntaba uno a uno
       (vetado también en la action, que es donde tiene que estar);
     - comprar lo que falta para una semana que ya se comió no lleva a ningún
       sitio.

    Lo que sí sigue teniendo sentido y se queda: la semana, el repaso, lo que
    costó, «¿Qué hago hoy?» —que habla de hoy, no de la semana mirada— y el «+» de
    cada hueco, porque apuntar a mano lo que cocinaste es justo para lo que
    existe (y por eso la action del hueco suelto NO lleva este veto).
  */
  const isPastWeek = days.every((date) => date < today);
  /*
    La tira de hoy (`TodayStrip`) solo tiene sentido en la semana que contiene
    hoy. Los platos se sacan de `bySlot` y no filtrando `entries`, porque el
    orden tiene que ser el de los HUECOS (desayuno → comida → cena) y el de la
    consulta es alfabético por `meal_slot`, que pone la cena antes de la comida.
    Sale de la capa optimista, así que marcar un plato lo quita de la tira ya.
  */
  const isCurrentWeek = days.includes(today);
  const todayEntries = isCurrentWeek
    ? slots.flatMap((s) => bySlot.get(`${today}|${s.key}`) ?? [])
    : [];
  /*
    Sin resolver = ni cocinado ni descartado. El descarte cuenta como respuesta
    desde que la propia tira lo ofrece: si no, el plato al que acabas de decir
    «no se hizo» seguiría ahí arriba pidiendo que lo contestes.
  */
  const todayUnresolved = todayEntries.filter(
    (e) => !e.cookedAt && !e.skippedAt,
  );
  /*
    Las filas de la tira: lo que queda por resolver más, si lo hay, el plato al
    que se le está preguntando el motivo (que ya está resuelto y por eso se cayó
    de la lista). Va al final: son tres filas como mucho, todas de hoy.
  */
  const todayRows =
    skipAsking && !todayUnresolved.some((e) => e.id === skipAsking.id)
      ? [...todayUnresolved, skipAsking]
      : todayUnresolved;
  // Con todo resuelto no hay nada que la tarjeta del día no diga ya. Salvo que
  // haya una pregunta a medias: desmontar la tira sería tragarse la pregunta.
  const showTodayStrip =
    isCurrentWeek && (todayRows.length > 0 || todayEntries.length === 0);
  /*
    Quién aloja «¿Qué hago hoy?»: la tira, cuando hoy está vacío (ahí ES su
    respuesta), y el bloque de generar en cualquier otro caso. Nunca los dos a la
    vez — dos botones que abren el mismo ranking es justo lo que sobraba.
  */
  const tonightInStrip = showTodayStrip && todayRows.length === 0;
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
      const r = await safeAction(
        copyPreviousWeekAction(weekStart),
        "No se pudo copiar la semana.",
      );
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
      /*
        Toda acción de IA de esta vista va envuelta, y no es celo: una que lanza
        dentro de una transición sube hasta la barrera de error y **se lleva la
        pantalla entera** — la semana desaparece y en su sitio queda «No se pudo
        cargar», que ni nombra lo que fallaba ni deja reintentar solo eso. Un
        aviso dice más y no cuesta el contexto. `actionErrorMessage` es el mismo
        texto honrado que usa el resto de la app (y trae la referencia del log).
      */
      let r: Awaited<ReturnType<typeof generateMenuAction>>;
      try {
        r = await generateMenuAction(weekStart, mode);
      } catch (err) {
        toast.error(actionErrorMessage("No se pudo generar el menú.", err));
        return;
      }
      if (r.needsAiConsent) {
        // Sin consentimiento de IA: pedimos aceptar y reintentamos al aceptar.
        // El botón de generar no vive dentro de otro modal, así que abrir este
        // no anida ResponsiveModal.
        setAiConsentRetry(() => () => generate(mode));
        return;
      }
      if (r.error) toast.error(r.error);
      else {
        toast.success(mode === "replace" ? "Menú rehecho" : "Menú generado", {
          /*
            El siguiente paso de una semana recién generada es comprar lo que
            falta, y su botón vive al final de la página, debajo de los siete
            días: mientras hay huecos el generador está ARRIBA (`ctaOnTop`), así
            que se genera desde arriba y la acción que viene después queda a una
            semana entera de scroll. Aquí llega a un toque, en el momento exacto
            en que sirve de algo. El botón de abajo se queda donde está: esto es
            un atajo mientras el toast vive, no su sitio.

            Lo que NO hacemos es abrir el repaso solo: la recompensa de generar
            es ver la semana entrar en cascada (`revealKey`) y un modal encima la
            taparía justo cuando se pinta. Por lo mismo el toast no se alarga más
            allá de los 5 s que ya usan los de deshacer: se queda encima de la
            semana que celebra, y quien no lo coja tiene el botón abajo.
          */
          duration: 5000,
          action: {
            label: "Añadir lo que falte",
            onClick: () => reviewMissing(r.menuId ?? menuId),
          },
        });
        setRevealKey((k) => k + 1);
        router.refresh();
      }
    });
  }

  function askTonight() {
    startTonight(async () => {
      let r: Awaited<ReturnType<typeof computeTonightAction>>;
      try {
        r = await computeTonightAction();
      } catch (err) {
        toast.error(actionErrorMessage("No se pudo pensar qué hacer hoy.", err));
        return;
      }
      if (r.error) {
        toast.error(r.error);
        return;
      }
      setTonight(r.cards ?? []);
    });
  }

  /**
   * Calcula lo que falta para el menú y abre el repaso. Recibe el id en vez de
   * tomarlo del prop porque se llama también desde el toast de «Menú generado»,
   * donde el menú puede acabar de nacer (ver `MenuState.menuId`).
   */
  function reviewMissing(id: string | null = menuId) {
    if (!id) return;
    startAddList(async () => {
      const r = await safeAction(
        computeMissingForMenuAction(id),
        "No se pudo calcular lo que falta.",
      );
      if (r.error) {
        toast.error(r.error);
        return;
      }
      const candidates = r.candidates ?? [];
      if (candidates.length === 0) {
        toast.info("Ya tienes todos los ingredientes");
        return;
      }
      setMissing({ menuId: id, candidates });
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
      skippedReason: null,
      pinned: false,
      recipeFromAi: false,
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
      skippedReason: entry.skippedReason,
      pinned: entry.pinned,
      recipeFromAi: entry.recipeSource === "ai",
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

  /**
   * "No se hizo" a un toque desde la tira de hoy. Al terminar, la fila pregunta
   * el motivo: es lo único que hace algo con el descarte —decide si el generador
   * puede volver a proponer el plato la semana que viene— y a los dos segundos
   * ya nadie se acuerda de qué plato era.
   *
   * No refresca: la action ya revalida `/menus`, así que la página vuelve
   * re-renderizada en la misma respuesta.
   */
  function quickSkip(entry: MenuEntry) {
    vibrateTick();
    setSkippingId(entry.id);
    startSkip(async () => {
      const r = await safeAction(
        toggleEntrySkippedAction(entry.id, true),
        "No se pudo guardar.",
      );
      setSkippingId(null);
      if (r.error) {
        toast.error(r.error);
        return;
      }
      toast.success("Anotado: no se hizo");
      setSkipAsking(entry);
    });
  }

  /** Motivo del descarte desde la tira: se guarda y la fila se despide. */
  function pickSkipReason(entryId: string, reason: SkipReason | null) {
    setSkippingId(entryId);
    startSkip(async () => {
      const r = await safeAction(
        setEntrySkippedReasonAction(entryId, reason),
        "No se pudo guardar el motivo.",
      );
      setSkippingId(null);
      if (r.error) {
        toast.error(r.error);
        return;
      }
      toast.success("Motivo guardado");
      setSkipAsking(null);
    });
  }

  /*
    El bloque de generar, en una variable porque se coloca en dos sitios según
    `ctaOnTop`: encima de la semana mientras haya huecos que llenar, y debajo
    cuando la semana está completa. Es UNA sola instancia —nunca las dos—, así
    que no hay dos botones de generar en pantalla.

    Con la semana completa se va abajo también «¿Qué hago hoy?». Es coherente:
    ese enlace responde a «no sé qué cocinar», y si la semana está entera la
    respuesta para hoy ya está en su tarjeta, ahora visible sin bajar.
  */
  const generateBlock = (
    <div className="flex flex-col gap-2 print:hidden">
      {isPastWeek ? (
        /*
          La ausencia de los botones se explica: sin una palabra se lee como que
          la app está rota. Y se dice de paso qué SÍ se puede hacer aquí, que es
          la razón por la que uno vuelve a una semana pasada.
        */
        <p className="text-center text-xs text-muted-foreground">
          Esta semana ya ha pasado: no se puede planificar. Con el «+» de cada
          hueco puedes apuntar lo que cocinaste.
        </p>
      ) : (
        <div className="flex items-center gap-2">
          <AiGenerateButton
            onClick={() => generate("fill")}
            loading={generating}
            busyLabel={
              hasPreservable
                ? "Completando el menú con IA"
                : "Generando el menú con IA"
            }
            // Grande cuando manda arriba; del tamaño normal cuando acompaña abajo.
            size={ctaOnTop ? "lg" : "default"}
            className="flex-1"
          >
            {hasPreservable ? "Completar menú con IA" : "Generar menú con IA"}
          </AiGenerateButton>
          {/*
            «Rehacer todo desde cero» vive en el menú de este icono, no en una
            línea suelta debajo del botón: es una acción de una vez al mes que
            ocupaba, con su frase de aviso, dos líneas permanentes entre el botón
            de generar y la semana.
          */}
          <MenuSettings
            settings={menuSettings}
            rules={rules}
            onReplaceAll={
              hasPreservable ? () => setConfirmReplace(true) : undefined
            }
          />
        </div>
      )}
      {/*
        Solo existe en semanas vacías (`canCopyPrevious` lo exige), así que
        nunca compite con un menú ya puesto: ahí es la alternativa natural a
        generar con IA.
      */}
      {canCopyPrevious && !isPastWeek ? (
        <Button onClick={copyPrevious} loading={copying} variant="outline">
          <CalendarDays aria-hidden />
          {copying ? "Copiando…" : "Copiar la semana anterior"}
        </Button>
      ) : null}
      {/*
        Sin recetas guardadas, el recetario hay que nombrarlo: se entra por un
        icono del header, y un icono no dice que ahí dentro espera un pack de
        recetas listas para empezar (antes esa palabra la ponía la pestaña
        «Recetario»). El aviso se extingue solo —con una receta guardada
        desaparece— así que no es una línea permanente, es el arranque; misma
        pauta que el empujón al escáner en el inventario vacío.
      */}
      {recipes.length === 0 && !isPastWeek ? (
        <p className="text-center text-xs text-muted-foreground text-pretty">
          Aún no tienes recetas guardadas.{" "}
          <Link
            href="/recetas"
            className="font-medium text-foreground underline underline-offset-2"
          >
            Añádelas al recetario
          </Link>{" "}
          y la IA planificará con ellas.
        </p>
      ) : null}
      {tonightInStrip ? null : (
        <Button
          variant="link"
          onClick={askTonight}
          loading={askingTonight}
          className="self-center"
        >
          <Lightbulb aria-hidden />
          {askingTonight ? "Pensando…" : "¿Qué hago hoy?"}
        </Button>
      )}
    </div>
  );

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
        {/*
          Repaso de días pasados (R2) junto a la semana, no en una fila propia:
          es un contador, y en cuanto cabe al lado del rótulo deja de costar una
          línea entera. Envuelve (`flex-wrap`) en vez de apretar, así que en una
          pantalla estrecha baja bajo el rótulo pero sigue dentro de este bloque,
          sin el hueco de una fila más. Discreto (`ghost`): el primario de esta
          pantalla es generar el menú.
        */}
        <div className="flex min-w-0 flex-1 flex-wrap items-center justify-center gap-x-2 gap-y-1">
          <p className="text-sm font-medium">
            Semana del{" "}
            {format(parseISO(weekStart), "d 'de' MMMM", { locale: es })}
          </p>
          {pendingCheckin.length > 0 ? (
            <Button
              variant="ghost"
              onClick={() => {
                setCheckinSession((n) => n + 1);
                setCheckinOpen(true);
              }}
              className="text-muted-foreground"
              aria-label={
                pendingCheckin.length === 1
                  ? "Repasar 1 plato de días pasados"
                  : `Repasar ${pendingCheckin.length} platos de días pasados`
              }
            >
              <ChefHat aria-hidden />
              {pendingCheckin.length === 1
                ? "1 por repasar"
                : `${pendingCheckin.length} por repasar`}
            </Button>
          ) : null}
        </div>
        <Button variant="ghost" size="icon" asChild aria-label="Semana siguiente">
          <Link href={`/menus?week=${shiftWeek(weekStart, 1)}`}>
            <ChevronRight aria-hidden />
          </Link>
        </Button>
      </div>

      {/*
        Lo de hoy va ANTES del botón de generar: es contenido, y el generador es
        una herramienta. Con la tira delante, lo primero que se lee al entrar es
        qué toca hoy y no qué puede hacer la IA.
      */}
      {showTodayStrip ? (
        <TodayStrip
          today={today}
          entries={todayRows}
          cookableRecipeIds={cookableRecipeIds}
          onMarkCooked={quickMarkCooked}
          markingId={markingId}
          skip={{
            askingFor: skipAsking?.id ?? null,
            busyId: skippingId,
            onSkip: quickSkip,
            onPickReason: pickSkipReason,
            onClose: () => setSkipAsking(null),
          }}
          onAskTonight={askTonight}
          askingTonight={askingTonight}
        />
      ) : null}

      {/*
        Un solo primario en pantalla: generar con IA. Los ajustes que condicionan
        a la IA van a su lado (icono) y compartir/imprimir en la cabecera de la
        página. Arriba solo mientras haya huecos que llenar (`ctaOnTop`).
      */}
      {ctaOnTop ? generateBlock : null}

      <ResponsiveModal
        open={confirmReplace}
        onOpenChange={(o) => !o && setConfirmReplace(false)}
      >
        <ResponsiveModalContent
          // Como en «¿Eliminar esta receta?»: el foco inicial cae en la acción
          // segura y no en la destructiva, que es la primera del DOM.
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            document.getElementById("menu-replace-cancel")?.focus();
          }}
        >
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
              <Button id="menu-replace-cancel" type="button" variant="ghost">
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
                      const skipped = Boolean(entry.skippedAt);
                      // Pasado sin resolver: el día ya pasó y nadie ha dicho si
                      // se cocinó. Tratamiento NEUTRO a propósito: `warning`
                      // significa "caduca pronto" en toda la app.
                      //
                      // «No se hizo» también resuelve: sin esa condición, un
                      // plato descartado seguía enseñando el punto de «sin
                      // marcar» y pedía una respuesta que ya se había dado.
                      const unresolved =
                        !cooked && !skipped && entry.date < today;
                      // Marcar solo tiene sentido en hoy o antes (igual que en
                      // el drawer); en futuro ni se ofrece. Un plato descartado
                      // sí lo sigue ofreciendo: cambiar de opinión —«al final sí
                      // lo hicimos»— limpia la marca y es un toque.
                      const canQuickMark = !cooked && entry.date <= today;
                      return (
                        /*
                          Plato y resolución en UNA sola caja, no en dos hermanas
                          con borde propio: el botón de al lado se leía como algo
                          suelto —y en columna estrecha, donde se apila, como una
                          barra que no pertenecía a nada—. Ahora el borde es del
                          conjunto y dentro hay dos zonas: el nombre, que abre el
                          panel, y la de la derecha, que resuelve.

                          La zona de resolver baja al borde INFERIOR cuando la
                          columna del hueco es estrecha (3 huecos en móvil, 3 días
                          por fila en xl…): con 44px a la derecha de una columna
                          de ~110px el nombre se quedaba en «Lente…». Sigue dentro
                          de la caja, así que apilarse ya no parte el plato en
                          dos. Solo CSS (contenedor de consulta), un único árbol.

                          Entre las dos formas no cambia el ANCHO del borde del
                          botón, solo su color: la base de Button ya trae
                          `border` transparente en los cuatro lados, así que
                          pintar uno u otro lado no mueve nada de sitio.
                        */
                        <div
                          key={entry.id}
                          // Marca legible por máquina de lo que escribió la IA
                          // (Reglamento de IA, art. 50.2); ver `lib/ai/provenance.ts`.
                          {...aiProvenanceAttrs(entry.source === "ai")}
                          className="flex flex-col rounded-lg border @min-[9rem]:flex-row print:block print:border-0"
                        >
                          <button
                            type="button"
                            onClick={() => openEdit(date, slot, entry)}
                            className="flex min-h-11 min-w-0 flex-1 items-start gap-1.5 rounded-t-lg p-2 text-left text-sm transition-colors hover:bg-muted @min-[9rem]:rounded-t-none @min-[9rem]:rounded-l-lg print:min-h-0 print:p-0 print:text-[10pt]"
                          >
                            {/* Pendiente y fijado son estado de la app, no del
                                menú que cuelgas en la nevera: no se imprimen. */}
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
                            {/* Resuelto se atenúa, no se tacha: un plato tachado
                                se lee como "eliminado". */}
                            <span
                              className={cn(
                                "line-clamp-2 print:line-clamp-none",
                                (cooked || skipped) &&
                                  "text-muted-foreground print:text-inherit",
                              )}
                            >
                              {text}
                            </span>
                          </button>
                          {canQuickMark ? (
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label={`Marcar como cocinado: ${text}`}
                              loading={markingId === entry.id}
                              onClick={() => quickMarkCooked(entry)}
                              className="h-auto min-h-11 w-full self-stretch rounded-t-none rounded-b-lg border-t-border text-muted-foreground @min-[9rem]:w-11 @min-[9rem]:rounded-l-none @min-[9rem]:rounded-r-lg @min-[9rem]:border-t-transparent @min-[9rem]:border-l-border print:hidden"
                            >
                              <CircleCheck aria-hidden className="size-5" />
                            </Button>
                          ) : cooked || skipped ? (
                            /*
                              Ya resuelto: el mismo sitio pasa a decir CÓMO, así
                              que marcar un plato no mueve el nombre ni cambia la
                              forma de la caja —antes el ✓ aparecía a la izquierda
                              del nombre y el botón desaparecía por la derecha—.
                              Aquí no se apila: un estado no necesita 44px, y una
                              franja de 44px al pie de una celda estrecha solo
                              para un ✓ sería más hueco que dato.

                              Iconos sin círculo, al contrario que los de las
                              acciones (`CircleCheck`, `CircleX`): en esta pantalla
                              lo redondeado se pulsa y lo desnudo se lee.
                            */
                            <span className="flex w-full shrink-0 items-center justify-center py-1 @min-[9rem]:w-7 @min-[9rem]:py-0 print:hidden">
                              {cooked ? (
                                <Check
                                  className="size-4 text-success"
                                  aria-label="Cocinado"
                                />
                              ) : (
                                <CalendarOff
                                  className="size-4 text-muted-foreground"
                                  aria-label="No se hizo"
                                />
                              )}
                            </span>
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

      {/*
        Coste de la semana y aviso de presupuesto, DEBAJO de la semana y pegados a
        la compra. Estaban entre el selector de semana y el contenido, que es el
        sitio más caro de la pantalla, y son metadatos: dos líneas de texto
        pequeño que había que saltar para llegar al menú. Aquí llegan en el
        momento en que sirven de algo —justo antes de decidir qué se compra— y en
        una semana completa acompañan al resto de acciones, que ya bajan también.
      */}
      {weekCost ? (
        <div className="flex flex-col gap-1 print:hidden">
          <p className="text-center text-xs text-muted-foreground">
            Coste estimado de la semana:{" "}
            <span className="font-medium text-price">
              {weekCost.complete ? "≈ " : "≥ "}
              {formatEuro(weekCost.total)}
            </span>
            {weekCost.complete ? "" : " (parcial)"}
          </p>
          {/*
            `warning` y no `destructive`: esto es un plan, no un gasto ya hecho.
            Nada ha salido mal todavía y la semana entera se puede rehacer.

            El icono no es adorno: sin él, lo único que separaba este aviso del
            pie de coste que tiene encima era el color, y un aviso que se
            distingue solo por el color no se distingue para quien no percibe ese
            color (WCAG 1.4.1). Va en línea para que envuelva como texto.
          */}
          {budgetWarning ? (
            <p className="text-center text-xs font-medium text-warning">
              <TriangleAlert
                aria-hidden
                className="mr-1 inline size-4 align-[-3px]"
              />
              {budgetWarning.partial ? "Ya se pasa " : "Se pasa "}
              {formatEuro(budgetWarning.overBy)} de lo que te toca gastar esta
              semana ({formatEuro(budgetWarning.target)})
              {budgetWarning.partial ? ", y aún hay platos sin precio." : "."}
            </p>
          ) : null}
        </div>
      ) : null}

      {/* En una semana pasada no: comprar los ingredientes de lo que ya se comió
          no lleva a ningún sitio (ver `isPastWeek`). */}
      {hasRecipes && !isPastWeek ? (
        <Button
          variant="outline"
          size="lg"
          // Envuelto: `reviewMissing` recibe el id del menú como primer
          // argumento y sin el lambda le llegaría el evento del click.
          onClick={() => reviewMissing()}
          loading={addingList}
          className="print:hidden"
        >
          {/*
            El carrito es el vocabulario de la app para «esto va a la lista»: la
            pestaña Lista, el «apuntar» del inventario y el «Apuntar en la lista»
            del descuento al cocinar, aquí al lado, lo llevan. Este era el único
            botón que manda cosas a la lista sin decirlo. En `loading` lo esconde
            el propio Button y saca el spinner en su sitio.
          */}
          <ShoppingCart aria-hidden />
          {addingList ? "Calculando…" : "Añadir a la lista lo que falte"}
        </Button>
      ) : null}

      {/*
        Semana completa: el generador baja aquí, DESPUÉS de «añadir a la lista lo
        que falte». Con la semana entera, el siguiente paso es la compra; volver
        a tocar el menú es la excepción, y desde aquí sigue a un toque.
      */}
      {ctaOnTop ? null : generateBlock}

      {/* Pie de la hoja, como en la imagen para compartir. */}
      <p className="hidden text-[7.5pt] text-muted-foreground print:mt-4 print:block">
        Fill Good · Compra lo justo, ahorra más
      </p>

      <MissingReviewDrawer review={missing} onClose={() => setMissing(null)} />

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
          // Cocinar limpia "no se hizo" en la BD —y con él su motivo, que sin
          // marca no puede existir—: reflejarlo también aquí.
          setEditing((prev) =>
            prev
              ? {
                  ...prev,
                  cookedAt,
                  skippedAt: cookedAt ? null : prev.skippedAt,
                  skippedReason: cookedAt ? null : prev.skippedReason,
                }
              : prev,
          );
          router.refresh();
        }}
        onSkippedChange={(skippedAt) => {
          setEditing((prev) =>
            prev
              ? {
                  ...prev,
                  skippedAt,
                  cookedAt: skippedAt ? null : prev.cookedAt,
                  // Deshacer el descarte se lleva el motivo por delante; volver
                  // a marcarlo empieza otra vez sin motivo, no con el de antes.
                  skippedReason: null,
                }
              : prev,
          );
          router.refresh();
        }}
        onSkippedReasonChange={(skippedReason) => {
          setEditing((prev) => (prev ? { ...prev, skippedReason } : prev));
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

      {/* Fuera del bloque de generar, que cambia de sitio: ver `MenuSettings`. */}
      <MenuSettingsPanel
        settings={menuSettings}
        prefs={prefs}
        rules={rules}
        recipes={recipes}
      />

      <CookedCheckinModal
        key={checkinSession}
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
  onSkippedReasonChange,
}: {
  editing: Editing | null;
  weekStart: string;
  slots: SlotDef[];
  recipes: SavedRecipe[];
  onClose: () => void;
  onSaved: () => void;
  onCookedChange: (cookedAt: string | null) => void;
  onSkippedChange: (skippedAt: string | null) => void;
  onSkippedReasonChange: (reason: string | null) => void;
}) {
  const [value, setValue] = useState("");
  /*
    Vistas del panel, nunca modales encadenados: un ResponsiveModal que abre otro
    se cierra solo (cierre por historial de E11). «remove» es la confirmación de
    quitar, y solo se usa cuando el plato está resuelto —ver `askRemove`—.

    «deduct» es el descuento de la despensa tras «Lo cocinamos». Antes era el
    caso de libro de lo que este comentario prohíbe: el panel se cerraba y en el
    mismo commit se abría el modal de descontar; el `history.back()` del que se
    cerraba llegaba como `popstate` al recién abierto, que lo tomaba por «atrás»
    y se cerraba solo. En móvil el plato quedaba cocinado, la propuesta asomaba
    y desaparecía, y la despensa no se tocaba nunca por este camino.
  */
  const [mode, setMode] = useState<
    "edit" | "move" | "duplicate" | "remove" | "recipe" | "deduct"
  >("edit");
  const [deductData, setDeductData] = useState<DeductionData | null>(null);
  // Terminado el descuento (o el «¿lo apuntamos?»), el panel se cierra con
  // refresco: el inventario ha cambiado.
  const deduction = useDeductionFlow(deductData, onSaved);

  /*
    Foco al cambiar de vista, el mismo patrón que el selector de icono de
    inventario (`ProductIconPickerView` + `EditItemDrawer`). Hacen falta las dos
    mitades, y por el mismo motivo: la celda que abre la vista se oculta al
    entrar, así que sin esto el foco se queda en `<body>` y quien va con teclado
    tiene que tabular desde el principio del panel —dos veces, porque al volver
    pasa igual—.

     - Al ENTRAR se enfoca el contenedor de la vista (`tabIndex={-1}`), que
       además la sube si el panel venía scrolleado. El contenedor y no el primer
       control: en «quitar» el primer control es el botón destructivo, y en el
       selector de días enfocar una celda no dice de qué va la vista.
     - Al VOLVER, el foco regresa a la celda que la abrió, que estaba oculta
       cuando se pidió el cambio, así que hay que esperar al repintado (de eso se
       encarga el efecto). Solo tras un viaje de ida y vuelta: al abrir el panel
       el foco lo coloca el propio modal.
  */
  const viewRef = useRef<HTMLDivElement>(null);
  const moveTileRef = useRef<HTMLButtonElement>(null);
  const duplicateTileRef = useRef<HTMLButtonElement>(null);
  const removeTileRef = useRef<HTMLButtonElement>(null);
  const recipeTileRef = useRef<HTMLButtonElement>(null);
  const volverA = useRef<
    "move" | "duplicate" | "remove" | "recipe" | null
  >(null);

  useEffect(() => {
    if (mode !== "edit") {
      viewRef.current?.focus();
      return;
    }
    const destino = volverA.current;
    if (!destino) return;
    volverA.current = null;
    // Mapa y no una cadena de ternarios: la cadena acababa en un `else` que
    // devolvía el foco a «quitar», así que una vista nueva que se olvidara de
    // añadir su rama no fallaba —enfocaba la celda equivocada, en silencio—.
    // Aquí, un valor sin celda es un error de tipos.
    const celda = {
      move: moveTileRef,
      duplicate: duplicateTileRef,
      remove: removeTileRef,
      recipe: recipeTileRef,
    }[destino];
    celda.current?.focus();
  }, [mode]);

  /** «Volver» de cualquier vista: apunta a dónde devolver el foco y sale. */
  function volverAlPlato() {
    // Del descuento no se vuelve al plato: se sale del panel.
    volverA.current = mode === "edit" || mode === "deduct" ? null : mode;
    setMode("edit");
  }
  const [pending, startTransition] = useTransition();
  const [savingRecipe, startSaveRecipe] = useTransition();
  const [cooking, startCooking] = useTransition();
  const [skipping, startSkipping] = useTransition();
  const [savingReason, startReason] = useTransition();
  const [picking, startPicking] = useTransition();
  const [pinningPending, startPinning] = useTransition();
  const [rerolling, startReroll] = useTransition();
  const [generatingSlot, startGenerateSlot] = useTransition();
  const [addingRecipe, startAddRecipe] = useTransition();
  const [addingRecipeId, setAddingRecipeId] = useState<string | null>(null);
  /*
    La receta de la vista «Cómo se cocina», traída cuando se abre. Se guarda
    ENTERA en local, no su id: la action que escribe los pasos revalida /menus, y
    en la ruta revalidada Next devuelve la página ya re-renderizada en la misma
    respuesta, así que reconstruirla de `entries` no es fiable a mitad de la
    conversación. Es lo mismo que hace `skipAsking` con su fila.
  */
  const [detail, setDetail] = useState<RecipeCooking | null>(null);
  const [loadingDetail, startLoadDetail] = useTransition();
  const [fillingSteps, startFillSteps] = useTransition();
  /**
   * Contador de la petición en curso, para descartar la que llegue tarde. El
   * `setDetail(null)` del cambio de plato solo cubre lo sincrónico: una consulta
   * lanzada para el plato de ayer sigue viva mientras abres el de hoy.
   */
  const detailRequest = useRef(0);

  const isNew = editing?.entryId == null;
  const cooked = Boolean(editing?.cookedAt);
  const skipped = Boolean(editing?.skippedAt);
  const pinned = Boolean(editing?.pinned);
  // "Lo cocinamos" solo tiene sentido en entradas ya guardadas y de hoy/pasado.
  const canMarkCooked = Boolean(editing?.entryId && editing.date <= todayLocalISO());
  /*
    "No se hizo" en hoy o antes, y sin cocinar (las dos marcas son excluyentes).

    Hoy CUENTA, aunque el repaso automático no pregunte por hoy hasta mañana: son
    dos cosas distintas y confundirlas dejaba el día de hoy sin salida. Que la app
    no dé por perdida la cena a las once de la mañana es prudencia de la app; que
    tú puedas decir «hoy comemos fuera» es información que ya tienes, y hasta
    ahora había que esperar a que el día pasara para poder darla. La tira de hoy
    ofrece lo mismo con el mismo criterio, así que este veto tenía que aflojarse
    a la vez: una regla en una pantalla y no en la otra es el patrón que ya ha
    roto los datos de este repo cuatro veces.
  */
  const canMarkSkipped = Boolean(
    editing?.entryId && editing.date <= todayLocalISO() && !cooked,
  );
  /*
    «Otra idea» solo mientras el plato siga siendo un PLAN. Resuelto —cocinado o
    «no se hizo»— ya es lo que pasó, y pedirle a la IA otra cosa para la cena del
    lunes pasado no significa nada: borraba la prueba de que lo cocinaste y
    dejaba el descuento de inventario pagando un plato retirado (el veto y el
    porqué completo están en `rerollMenuEntryAction`). Para cambiarlo de verdad
    está «deshacer» la marca, que sigue a un toque justo al lado.

    Tampoco en un día ya vivido, aunque siga sin marcar: el servidor lo niega
    (`rerollMenuEntryAction`, con el candado de `generateMenuAction`), y ofrecer
    un botón cuyo único desenlace es un error es el patrón que `finishOffer` ya
    evita en el modo cocinado. Lo mismo el «Generar este hueco con IA».
  */
  const isPastDay = Boolean(editing && editing.date < todayLocalISO());
  const canReroll = !cooked && !skipped && !isPastDay;
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
    setDeductData(null);
    setAddingRecipeId(null);
    // Sin esto, abrir otro plato enseñaría la receta del anterior mientras llega
    // la suya (el panel no se desmonta al cambiar de entrada).
    setDetail(null);
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
    /*
      Sin cambios no se guarda: el campo llega con el nombre de la receta ya
      escrito, así que abrir el panel para otra cosa —fijar, mover, marcar
      cocinado— y pulsar «Guardar» desvinculaba la receta sin haber tocado nada,
      y con ella el coste, los ingredientes y las señales de lo cocinado (el
      porqué completo, en `updateMenuEntryAction`). Se cierra igual: quien pulsa
      «Guardar» espera que el panel se vaya, no un aviso de que no había nada.
    */
    if (editing.entryId && trimmed === editing.current.trim()) {
      onSaved();
      return;
    }
    startTransition(async () => {
      const r = editing.entryId
        ? await safeAction(
            updateMenuEntryAction(editing.entryId, trimmed),
            "No se pudo guardar el plato.",
          )
        : await safeAction(
            addMenuEntryAction(weekStart, editing.date, editing.slot, trimmed),
            "No se pudo guardar el plato.",
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
      let r: Awaited<ReturnType<typeof generateSlotEntryAction>>;
      try {
        r = await generateSlotEntryAction(weekStart, date, slot);
      } catch (err) {
        toast.error(actionErrorMessage("No se pudo generar el plato.", err));
        return;
      }
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
      const r = await safeAction(
        addRecipeToSlotAction(weekStart, date, slot, recipeId),
        "No se pudo añadir la receta.",
      );
      if (r.error) toast.error(r.error);
      else {
        toast.success("Receta añadida al menú");
        onSaved();
      }
    });
  }

  /*
    Quitar un plato que sigue siendo un PLAN no se pregunta: no se pierde nada,
    era una intención. Quitar uno COCINADO sí, porque borra la fila y con ella la
    vez cocinada de esa receta, de la que viven `timesCooked`/`lastCookedAt` (lo
    que evita que el generador te la repita pronto), y porque el descuento de
    inventario que se propuso al marcarlo no se revierte.

    Solo cocinado, no «no se hizo»: ahí no hubo descuento ni vez cocinada que
    perder, así que preguntar sería estorbar por simetría.

    Se pregunta en vez de bloquearse (la otra opción, y más barata) porque
    bloquear añade un paso sin contar qué se pierde: deshaces la marca, quitas el
    plato igual y sigues sin saberlo.
  */
  function askRemove() {
    if (cooked) {
      setMode("remove");
      return;
    }
    remove();
  }

  function remove() {
    if (!editing?.entryId) return;
    startTransition(async () => {
      const r = await safeAction(
        removeMenuEntryAction(editing.entryId!),
        "No se pudo quitar el plato.",
      );
      if (r.error) toast.error(r.error);
      else onSaved();
    });
  }

  function saveToRecipes() {
    if (!editing?.recipeId) return;
    startSaveRecipe(async () => {
      const r = await safeAction(
        saveGeneratedRecipeAction(editing.recipeId!),
        "No se pudo guardar la receta.",
      );
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
        // El descuento se propone como vista de ESTE panel, no en un modal
        // nuevo (ver el comentario de `mode`). El plato ya está cocinado, así
        // que se refleja igual que en `onResolved`.
        onProposeDeductions: (name, items) => {
          onCookedChange(date);
          setDeductData({ recipeName: name, items });
          setMode("deduct");
        },
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
      const r = await safeAction(
        toggleEntrySkippedAction(entryId, next),
        "No se pudo guardar.",
      );
      if (r.error) {
        toast.error(r.error);
        return;
      }
      toast.success(next ? "Anotado: no se hizo" : "Vuelve a estar pendiente");
      onSkippedChange(next ? date : null);
    });
  }

  /**
   * Motivo del descarte: aparece en cuanto el plato está marcado y se puede
   * cambiar o quitar (el chip ya elegido es un interruptor). No confirma con
   * toast, al contrario que en la tira: aquí los chips se quedan a la vista con
   * el elegido pulsado, así que el propio grupo ya dice lo que ha pasado.
   */
  function pickSkipReason(reason: SkipReason | null) {
    if (!editing?.entryId) return;
    const entryId = editing.entryId;
    startReason(async () => {
      const r = await safeAction(
        setEntrySkippedReasonAction(entryId, reason),
        "No se pudo guardar el motivo.",
      );
      if (r.error) {
        toast.error(r.error);
        return;
      }
      onSkippedReasonChange(reason);
    });
  }

  /** Mueve o duplica el plato al hueco (date, slot) elegido en el picker. */
  function pick(date: string, slot: string) {
    if (!editing?.entryId) return;
    const entryId = editing.entryId;
    startPicking(async () => {
      const r =
        mode === "move"
          ? await safeAction(
              moveMenuEntryAction(entryId, date, slot),
              "No se pudo mover el plato.",
            )
          : await safeAction(
              duplicateMenuEntryAction(entryId, date, slot),
              "No se pudo duplicar el plato.",
            );
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
      const r = await safeAction(
        toggleEntryPinnedAction(entryId, next),
        "No se pudo fijar el plato.",
      );
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
      let r: Awaited<ReturnType<typeof rerollMenuEntryAction>>;
      try {
        r = await rerollMenuEntryAction(entryId);
      } catch (err) {
        toast.error(actionErrorMessage("No se pudo pensar otra idea.", err));
        return;
      }
      if (r.error) toast.error(r.error);
      else {
        toast.success("Nueva idea lista");
        onSaved();
      }
    });
  }

  /**
   * Abre «Cómo se cocina» y trae la receta en ese momento. La carga es perezosa a
   * propósito: la consulta de la semana no arrastra los pasos de catorce platos
   * para que se lea el de un día.
   */
  function openRecipeView() {
    const recipeId = editing?.recipeId;
    if (!recipeId) return;
    const peticion = ++detailRequest.current;
    setDetail(null);
    setMode("recipe");
    startLoadDetail(async () => {
      const r = await safeAction(
        getRecipeCookingAction(recipeId),
        "No se pudo cargar la receta.",
      );
      // Una respuesta que llega tarde se tira. Sin esto: abres un plato, la
      // consulta se atasca, cierras, abres otro y pides su receta —y encima de
      // ella cae la del primero, con el título del segundo. Y lo peor no es lo
      // que se lee: «Escribir los pasos con IA» se ofrece según los pasos de la
      // receta pintada y escribe sobre la del plato abierto.
      if (peticion !== detailRequest.current) return;
      if (r.error || !r.recipe) {
        toast.error(r.error ?? "No se pudo abrir la receta.");
        return;
      }
      setDetail(r.recipe);
    });
  }

  /**
   * Escribe los pasos que le faltan al plato con IA, y los guarda. Aquí no hay
   * borrador que revisar antes de guardar, y por eso `fillRecipeDetailsAction`
   * solo rellena huecos: se niega a rehacer unos pasos que ya existan.
   *
   * Sin consentimiento de IA nos quedamos en el aviso por toast, igual que «Otra
   * idea»: abrir aquí el modal de consentimiento encadenaría dos ResponsiveModal
   * y el segundo se cerraría solo.
   */
  function fillSteps() {
    const recipeId = editing?.recipeId;
    if (!recipeId) return;
    const peticion = detailRequest.current;
    startFillSteps(async () => {
      let r: Awaited<ReturnType<typeof fillRecipeDetailsAction>>;
      try {
        r = await fillRecipeDetailsAction(recipeId);
      } catch (err) {
        toast.error(actionErrorMessage("No se pudieron escribir los pasos.", err));
        return;
      }
      // Puede volver con las dos cosas: los pasos guardados y una pega («una
      // cantidad no se pudo guardar»). Manda la pega, que es lo que hay que leer.
      if (r.error) toast.error(r.error);
      else if (r.details) toast.success("Ya tienes la receta");
      /*
        Se relee SIEMPRE, también al fallar, y por dos motivos. Uno: lo que se
        guarda es ADITIVO (una cantidad que ya estaba le gana a la del modelo),
        así que leer lo guardado es la única forma de que la vista no prometa algo
        distinto de lo que hay en la receta. Dos: un fallo a mitad puede haber
        dejado los pasos ya escritos, y sin releer el panel seguía diciendo
        «todavía nadie ha escrito cómo se hace» debajo de un botón que a partir de
        ese momento contesta «esta receta ya tiene sus pasos» — un callejón que se
        contradice en dos toques.
      */
      const fresh = await safeAction(
        getRecipeCookingAction(recipeId),
        "No se pudo cargar la receta.",
      );
      if (peticion === detailRequest.current && fresh.recipe) {
        setDetail(fresh.recipe);
      }
    });
  }

  // `picker` es el selector de día y hueco: lo comparten mover y duplicar. El
  // modo «remove» NO lo usa (no elige destino), así que se nombra explícito en
  // vez de con un `!== "edit"` que lo arrastraría dentro.
  const picker = mode === "move" || mode === "duplicate";

  return (
    <ResponsiveModal
      open={editing !== null}
      // Con el descuento ya escrito, cerrar (botón o gesto) tiene que refrescar:
      // el inventario ha cambiado aunque no se apunte nada en la lista.
      onOpenChange={(o) =>
        !o && (mode === "deduct" && deduction.applied ? onSaved() : onClose())
      }
    >
      <ResponsiveModalContent>
        <ResponsiveModalHeader>
          {/*
            `capitalize` es para el rótulo del hueco («cena · martes»), así que
            los títulos que son una frase se quedan fuera: con él, «Cómo se
            cocina» se pintaría «Cómo Se Cocina».
          */}
          <ResponsiveModalTitle
            className={
              picker || mode === "recipe" || mode === "deduct"
                ? undefined
                : "capitalize"
            }
          >
            {mode === "deduct"
              ? deductionTitle(deduction)
              : mode === "move"
                ? "Mover a…"
                : mode === "duplicate"
                  ? "Duplicar en…"
                  : mode === "remove"
                    ? "¿Quitar este plato?"
                    : mode === "recipe"
                      ? "Cómo se cocina"
                      : editing?.label}
          </ResponsiveModalTitle>
          <ResponsiveModalDescription>
            {mode === "deduct"
              ? deductionDescription(deduction, deductData?.recipeName)
              : mode === "move"
                ? "Elige el día y el hueco de destino."
                : mode === "duplicate"
                  ? "Elige dónde añadir una copia de este plato."
                  : mode === "remove"
                    ? "Ya lo marcaste como cocinado."
                    : mode === "recipe"
                      ? (detail?.name ?? editing?.current)
                      : isNew
                        ? isPastDay
                          ? "Elige una receta de tu recetario o escríbelo."
                          : "Genéralo con IA, elige una receta de tu recetario o escríbelo."
                        : "Edita o quita este plato."}
          </ResponsiveModalDescription>
        </ResponsiveModalHeader>

        {mode === "deduct" ? (
          <div
            ref={viewRef}
            tabIndex={-1}
            role="group"
            aria-label={deductionTitle(deduction)}
            className="flex flex-col gap-3 outline-none"
          >
            <CookedDeductionsSteps
              flow={deduction}
              // «No descontar»: el plato ya quedó cocinado y refrescado al
              // marcarlo; solo se cierra el panel.
              onSkip={onClose}
              onDone={onSaved}
            />
          </div>
        ) : picker ? (
          // `tabIndex={-1}` para poder recibir el foco al entrar sin quedar en el
          // orden de tabulación (no es un control, es el destino del foco).
          <div
            ref={viewRef}
            tabIndex={-1}
            // Con nombre, como el selector de icono: al recibir el foco, un lector
            // de pantalla dice a qué vista se ha entrado. El título del modal ya
            // cambió, pero el modal no se vuelve a anunciar al cambiar de vista.
            role="group"
            aria-label={mode === "move" ? "Mover a…" : "Duplicar en…"}
            className="flex flex-col gap-3 px-4 outline-none"
          >
            {/* Sin esto las casillas bloqueadas solo salían al 50 %, sin
                explicación. */}
            {mode === "move" && cooked ? (
              <p className="text-sm text-muted-foreground">
                Ya está cocinado: puedes moverlo a hoy o a un día anterior, no a
                uno que no ha llegado.
              </p>
            ) : null}
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
                onClick={volverAlPlato}
                disabled={picking}
              >
                <ChevronLeft aria-hidden />
                Volver
              </Button>
            </ResponsiveModalFooter>
          </div>
        ) : mode === "remove" ? (
          <div
            ref={viewRef}
            tabIndex={-1}
            role="group"
            aria-label="Quitar este plato"
            className="flex flex-col gap-3 px-4 outline-none"
          >
            <p className="text-sm">
              <span className="font-medium">{editing?.current}</span> dejará de
              contar como cocinado: el menú olvida esa vez, y con ella lo que
              evita que el generador te lo repita pronto.
            </p>
            {/*
              «Si descontaste» y no «se descontó»: el descuento al cocinar se
              PROPONE y se confirma, así que la app no sabe aquí si llegó a
              hacerse. Afirmarlo sería mentir la mitad de las veces.
            */}
            <p className="text-sm text-muted-foreground">
              Si descontaste sus ingredientes del inventario, ese descuento no se
              deshace.
            </p>
            <ResponsiveModalFooter className="gap-2 px-0">
              <Button
                type="button"
                variant="destructive"
                size="lg"
                onClick={remove}
                loading={pending}
              >
                <Trash aria-hidden />
                {pending ? "Quitando…" : "Quitar del menú"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={volverAlPlato}
                disabled={pending}
              >
                <ChevronLeft aria-hidden />
                Volver
              </Button>
            </ResponsiveModalFooter>
          </div>
        ) : mode === "recipe" ? (
          <div
            ref={viewRef}
            tabIndex={-1}
            role="group"
            aria-label="Cómo se cocina"
            {...aiProvenanceAttrs(editing?.recipeFromAi ?? false)}
            className="flex flex-col gap-3 px-4 outline-none"
          >
            {/*
              La receta scrollea dentro de la vista y no arrastra el panel: una de
              doce pasos no debe empujar el «Volver» fuera de la pantalla. Mismo
              recurso que la lista de sugerencias de este mismo panel.
            */}
            <div className="max-h-[55vh] overflow-y-auto">
              {detail ? (
                <RecipeCookingDetails recipe={detail} />
              ) : loadingDetail ? (
                <p className="text-sm text-muted-foreground">
                  Abriendo la receta…
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No se pudo abrir la receta.
                </p>
              )}
            </div>
            {/*
              Con pasos escritos, la acción principal de esta vista es ponerse a
              cocinar: leerlos aquí es de un vistazo, y guiarlos uno a uno con la
              pantalla encendida y las manos sucias es el modo cocinado. Va como
              enlace porque sale del modal a una ruta propia (no cabe dentro: el
              cierre encadena el descuento, y anidar modales no funciona).
            */}
            {detail && detail.steps.length > 0 && editing?.recipeId ? (
              <Button asChild size="lg">
                <Link
                  href={`/recetas/${editing.recipeId}/cocinar${
                    editing.entryId ? `?entrada=${editing.entryId}` : ""
                  }`}
                >
                  <ChefHat aria-hidden />
                  Cocinar paso a paso
                </Link>
              </Button>
            ) : null}
            {/*
              El botón solo cuando faltan los pasos: un plato que la IA inventó al
              planificar la semana llega con ingredientes y sin pasos, y las
              recetas del pack curado tampoco los traen. Con pasos ya escritos no
              se ofrece, porque lo que se guardara desde aquí no pasaría por
              delante de nadie antes de pisar lo que hubiera.
            */}
            {detail && detail.steps.length === 0 ? (
              <Button
                type="button"
                variant="outline"
                onClick={fillSteps}
                loading={fillingSteps}
              >
                <Sparkles aria-hidden />
                {fillingSteps ? "Escribiendo…" : "Escribir los pasos con IA"}
              </Button>
            ) : null}
            <ResponsiveModalFooter className="gap-2 px-0">
              <Button
                type="button"
                variant="ghost"
                onClick={volverAlPlato}
                disabled={fillingSteps}
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
          {isNew && !isPastDay ? (
            <AiGenerateButton
              type="button"
              size="lg"
              onClick={generateSlot}
              loading={generatingSlot}
              disabled={addBusy && !generatingSlot}
              steps={SLOT_GENERATION_STEPS}
              busyLabel="Generando el plato con IA"
            >
              Generar este hueco con IA
            </AiGenerateButton>
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
              Editar el texto DESVINCULA la receta (`updateMenuEntryAction` lo
              hace a propósito: lo editado pasa a ser texto libre). En un plato ya
              cocinado eso borra además la única prueba de que se cocinó ESA
              receta —`menu_entries.recipe_id + cooked_at`, de donde salen
              `timesCooked`/`lastCookedAt`—, y no hay forma limpia de conservarla:
              mantener el enlace haría que la vista siguiera mostrando el nombre
              de la receta y la edición pareciera no hacer nada.

              Así que se avisa, que es lo que se pudo hacer sin decidir el esquema
              —misma salida que en «quitar un plato cocinado» y en la fusión de
              productos—. Solo cuando hay algo que perder: cocinado Y enlazado.
            */}
            {!isNew && cooked && editing?.recipeId ? (
              <p className="text-xs text-warning">
                Si cambias el nombre, el plato se desvincula de la receta y esta
                vez deja de contar como cocinada.
              </p>
            ) : null}
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
              {/*
                Primera celda cuando el plato es una receta: al abrir un plato de
                hoy, «cómo se cocina» es más veces lo que se venía a buscar que
                moverlo o quitarlo. Un plato de texto libre no la tiene porque no
                hay nada que leer.
              */}
              {editing?.recipeId ? (
                <EntryActionTile
                  ref={recipeTileRef}
                  icon={ChefHat}
                  label="Cómo se cocina"
                  onClick={openRecipeView}
                />
              ) : null}
              {canMarkSkipped ? (
                <EntryActionTile
                  icon={CalendarOff}
                  label={skipped ? "No se hizo · deshacer" : "No se hizo"}
                  onClick={toggleSkipped}
                  loading={skipping}
                  pressed={skipped}
                />
              ) : null}
              {canReroll ? (
                <EntryActionTile
                  icon={RefreshCw}
                  label={rerolling ? "Pensando…" : "Otra idea"}
                  onClick={reroll}
                  loading={rerolling}
                />
              ) : null}
              <EntryActionTile
                icon={pinned ? PinOff : Pin}
                label={pinned ? "Quitar fijado" : "Fijar"}
                onClick={togglePinned}
                loading={pinningPending}
                pressed={pinned}
              />
              {/* Las celdas que abren una vista llevan `ref`: es donde vuelve el
                  foco al salir de ella (ver `volverAlPlato`). */}
              <EntryActionTile
                ref={moveTileRef}
                icon={MoveRight}
                label="Mover a…"
                onClick={() => setMode("move")}
              />
              <EntryActionTile
                ref={duplicateTileRef}
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
                ref={removeTileRef}
                icon={Trash}
                label="Quitar del menú"
                onClick={askRemove}
                disabled={pending}
                destructive
              />
            </div>
          ) : null}

          {/*
            El motivo solo existe si el plato está descartado, y aparece DESPUÉS
            —nunca como un campo del formulario—: preguntar por qué no se hizo
            algo que sigue en pie no significa nada. Al deshacer la marca el
            grupo desaparece con ella.
          */}
          {skipped ? (
            <div className="animate-in fade-in slide-in-from-top-1 duration-200">
              <SkipReasonChips
                value={editing?.skippedReason ?? null}
                busy={savingReason}
                onPick={pickSkipReason}
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
            {/* «Cerrar» y no «Cancelar»: «No se hizo», su motivo y fijar se
                guardan al tocarlos, así que cerrar no deshace nada de eso. */}
            <ResponsiveModalClose asChild>
              <Button type="button" variant="ghost">
                {isNew ? "Cancelar" : "Cerrar"}
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
  review,
  onClose,
}: {
  /** Candidatos y el menú del que salieron (ver el estado `missing`). */
  review: { menuId: string; candidates: MissingCandidate[] } | null;
  onClose: () => void;
}) {
  const [included, setIncluded] = useState<Set<string>>(new Set());
  const [pending, startTransition] = useTransition();
  const candidates = review?.candidates ?? null;

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
    if (!review) return;
    startTransition(async () => {
      const r = await safeAction(
        confirmMissingToListAction(review.menuId, [...included]),
        "No se pudo apuntar en la lista.",
      );
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
      open={review !== null}
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
            {/* Carrito y no `Check`: es la misma acción que el botón que abre
                este repaso y que el «Apuntar en la lista» del descuento al
                cocinar. El visto bueno lo da el propio gesto de confirmar. */}
            <ShoppingCart aria-hidden />
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
type DeductionData = { recipeName: string; items: CookedDeduction[] };

/**
 * Estado del flujo «descontar → ¿lo apuntamos?» tras marcar un plato como
 * cocinado. Va en un hook y no dentro de un modal porque se pinta en dos
 * sitios: en su propio modal (el ✔ de la celda o de la tira, que no tienen
 * ningún panel abierto) y como VISTA del panel del plato (ver
 * `EditEntryDrawer`), que es la única forma de encadenarlo sin que se cierre
 * solo.
 */
function useDeductionFlow(data: DeductionData | null, onDone: () => void) {
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
      const r = await safeAction(
        confirmCookedDeductionsAction(deductionPayload(items, qty)),
        "No se pudo descontar del inventario.",
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
      const r = await safeAction(
        addListItemsAction(restockPayload(restock, selected)),
        "No se pudo apuntar en la lista.",
      );
      if (r.error) {
        toast.error(r.error);
        return;
      }
      toast.success(restockToastMessage(r));
      onDone();
    });
  }

  return {
    items,
    qty,
    setQty,
    restock,
    selected,
    setSelected,
    pending,
    count,
    confirm,
    addToList,
    /** El descuento ya se escribió: cerrar tiene que refrescar. */
    applied: restock !== null,
  };
}

type DeductionFlow = ReturnType<typeof useDeductionFlow>;

function deductionTitle(flow: DeductionFlow): string {
  return flow.restock ? "¿Lo apuntamos?" : "Descontar del inventario";
}

function deductionDescription(
  flow: DeductionFlow,
  recipeName: string | undefined,
): string {
  return flow.restock
    ? "Al cocinar se te ha terminado esto. Desmarca lo que no quieras apuntar."
    : `Ajusta lo que has gastado de «${recipeName ?? ""}». Se descuenta del lote que caduca antes. Desmarcar «cocinado» no repone el stock.`;
}

/**
 * Los dos pasos (campos y botones), sin modal alrededor ni cabecera: quien los
 * monta pone el título con `deductionTitle`/`deductionDescription`.
 */
function CookedDeductionsSteps({
  flow,
  onSkip,
  onDone,
}: {
  flow: DeductionFlow;
  /** «No descontar»: el plato se queda cocinado y la despensa, como estaba. */
  onSkip: () => void;
  onDone: () => void;
}) {
  const { restock, selected, setSelected, pending, count } = flow;
  return (
    <>
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
            items={flow.items}
            qty={flow.qty}
            onQtyChange={(k, value) =>
              flow.setQty((prev) => ({ ...prev, [k]: value }))
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
              onClick={flow.addToList}
              disabled={selected.size === 0}
              loading={pending}
            >
              <ShoppingCart aria-hidden />
              {/* Con `<= 1` el cero decía «Apuntar 1»: con nada marcado el botón
                  (deshabilitado) prometía apuntar algo. */}
              {pending
                ? "Apuntando…"
                : selected.size === 0
                  ? "Apuntar en la lista"
                  : selected.size === 1
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
              onClick={flow.confirm}
              disabled={count === 0}
              loading={pending}
            >
              <Check aria-hidden />
              {pending
                ? "Descontando…"
                : count === 0
                  ? "Descontar"
                  : count === 1
                    ? "Descontar 1 ingrediente"
                    : `Descontar ${count} ingredientes`}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={onSkip}
              disabled={pending}
            >
              No descontar
            </Button>
          </>
        )}
      </ResponsiveModalFooter>
    </>
  );
}

/**
 * El descuento en su propio modal: para el ✔ de la celda o de la tira, que
 * marcan sin tener ningún panel abierto. Desde el panel del plato NO se usa
 * (ahí es una vista del mismo panel, ver `EditEntryDrawer`).
 */
function CookedDeductionsDrawer({
  data,
  onClose,
  onDone,
}: {
  data: DeductionData | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const flow = useDeductionFlow(data, onDone);
  return (
    <ResponsiveModal
      open={data !== null}
      // Con el descuento ya aplicado, cerrar sin apuntar sigue necesitando
      // refresco: el inventario cambió aunque no se apunte nada.
      onOpenChange={(o) => !o && (flow.applied ? onDone() : onClose())}
    >
      <ResponsiveModalContent>
        <ResponsiveModalHeader>
          <ResponsiveModalTitle>{deductionTitle(flow)}</ResponsiveModalTitle>
          <ResponsiveModalDescription>
            {deductionDescription(flow, data?.recipeName)}
          </ResponsiveModalDescription>
        </ResponsiveModalHeader>
        <CookedDeductionsSteps flow={flow} onSkip={onClose} onDone={onDone} />
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
      const r = await safeAction(
        addRecipeToMenuAction(recipeId),
        "No se pudo añadir al menú.",
      );
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
            {/* El consejo sin enlace dejaba el modal sin más salida que
                «Cerrar». */}
            <Button asChild variant="outline" className="mt-2 w-full">
              <Link href="/recetas">
                <ChefHat aria-hidden />
                Ir a mis recetas
              </Link>
            </Button>
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
