"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import {
  Check,
  ChefHat,
  ChevronLeft,
  ChevronRight,
  ListChecks,
  PartyPopper,
  ShoppingCart,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { usePersistedChoice } from "@/hooks/use-persisted-flag";
import { useWakeLock } from "@/hooks/use-wake-lock";
import { vibrateTick } from "@/lib/haptics";
import { cn } from "@/lib/utils";
import { addListItemsAction } from "@/features/shopping-list/actions";
import type { RestockCandidate } from "@/features/shopping-list/queries";
import {
  computeCookedDeductionsAction,
  confirmCookedDeductionsAction,
  toggleEntryCookedAction,
} from "@/features/menus/actions";
import { noDeductionsReason, type CookedDeduction } from "@/features/menus/cooked";
import {
  CookedDeductionsFields,
  deductionCount,
  deductionPayload,
  initialDeductionQty,
} from "@/features/menus/components/cooked-deductions-fields";
import {
  CookedRestockFields,
  initialRestockSelection,
  restockPayload,
  restockToastMessage,
} from "@/features/menus/components/cooked-restock-fields";
import type { RecipeCooking } from "../actions";
import type { RecipeRatingSummary } from "../queries";
import {
  finishOffer,
  progressStorageKey,
  readProgress,
  timesCookedLabel,
  writeProgress,
  type CookingEntry,
} from "../cooking-flow";
import { RecipeIngredientList } from "./recipe-cooking";
import { RecipeRating } from "./recipe-rating";

/** Recorrido (px) que hay que deslizar para cambiar de paso. */
const SWIPE_THRESHOLD = 60;

/**
 * En qué punto del cierre está la pantalla del final. No es el «paso» de la
 * receta: son las preguntas que se encadenan una vez el plato está hecho, las
 * mismas del repaso de platos y en el mismo orden, porque son la misma
 * conversación adelantada al momento en que de verdad ocurre.
 */
type Stage = "mark" | "deduct" | "restock" | "done";

/**
 * Modo cocinado: la receta paso a paso, a pantalla completa, y un cierre que
 * recoge lo que hasta ahora había que contestar al día siguiente.
 *
 * Es la hermana del modo compra, y por los mismos motivos: ruta propia en vez de
 * un modal (el visor del panel del menú vive en un `ResponsiveModal`, y desde
 * dentro de uno no se puede encadenar el descuento —anidarlos hace que el
 * segundo se cierre solo—), pantalla siempre encendida, un solo objetivo grande
 * por vez y nada de navegación alrededor.
 *
 * **El cierre es la razón de ser de todo esto.** Marcar cocinado, descontar la
 * despensa, apuntar lo que se ha terminado y valorar el plato ya existían, pero
 * repartidos y a destiempo: el repaso pregunta al día siguiente, cuando ya nadie
 * se acuerda de cuánto arroz echó. Aquí las mismas cuatro cosas caen solas en el
 * único momento en que se saben y en que apetece contestarlas — con el plato
 * recién hecho delante. No hay puntos ni medallas: lo que se celebra son datos
 * de verdad (cuántas veces lo habéis cocinado, qué se ha descontado), que es el
 * mismo criterio con el que se hizo la hucha de la compra.
 *
 * Ojo con el reparto de responsabilidades: aquí NO se escribe nada nuevo. Las
 * cuatro escrituras son las Server Actions que ya existían, con sus guardas
 * intactas; lo que aporta esta pantalla es el momento y el orden.
 */
export function CookingMode({
  recipeId,
  recipe,
  entry,
  today,
  loadedAt,
  timesCookedBefore,
  rating,
  backHref,
}: {
  recipeId: string;
  recipe: RecipeCooking;
  /** Entrada del menú desde la que se entró, o null si se cocina fuera de plan. */
  entry: CookingEntry | null;
  /**
   * Hoy en ISO local, calculado en el SERVIDOR. No se mira el reloj del
   * dispositivo a propósito: la guarda que decide si se puede marcar como
   * cocinado (`finishOffer`) copia la de `toggleEntryCookedAction`, y si cada
   * lado usara su propio «hoy», un móvil en otra zona horaria vería el botón
   * justo cuando el servidor va a rechazarlo.
   */
  today: string;
  /**
   * Cuándo se cargó la pantalla, en milisegundos. Viene del servidor por la
   * misma razón que `today`, y además porque leer el reloj durante el render de
   * un componente cliente es impuro: con él se mide si el progreso guardado
   * todavía es de esta sesión de cocina (ver `readProgress`).
   */
  loadedAt: number;
  /** Veces que el hogar ya había cocinado esta receta al abrir la pantalla. */
  timesCookedBefore: number;
  rating: RecipeRatingSummary;
  /** Adónde se vuelve al salir: el menú si vino de un plato, si no su ficha. */
  backHref: string;
}) {
  // Las manos ocupadas y el móvil apoyado: lo mismo que la compra.
  useWakeLock();

  const total = recipe.steps.length;
  const [progress, setProgress] = usePersistedChoice(
    progressStorageKey(recipeId),
  );
  /*
    `loadedAt` y no `Date.now()` aquí: el instante con el que se mide si el
    progreso guardado sigue valiendo tiene que ser UNO, fijo mientras dure la
    pantalla. Leyendo el reloj en cada render, el paso por el que se entra podría
    cambiar solo porque el componente se repinta —y además leer el reloj durante
    el render es impuro, que es justo lo que el compilador de React prohíbe—.
  */
  const step = readProgress(progress, total, loadedAt);
  // Se ha retomado y todavía no se ha tocado nada: es lo único que justifica
  // avisar de ello (ver el aviso de «Retomas donde lo dejaste»).
  const [moved, setMoved] = useState(false);
  const resumed = step > 0 && !moved;

  const [finished, setFinished] = useState(false);

  /*
    Guardar el paso SIEMPRE con `loadedAt`, nunca con el reloj de este instante.
    Lo que se sella es cuándo empezó esta sesión de cocina, no cuándo se pasó de
    paso, y tiene que ser el mismo instante con el que se lee: escribiendo
    `Date.now()` el sello quedaba por delante del `loadedAt` con el que se lee,
    `readProgress` lo tomaba por un reloj movido hacia atrás y devolvía 0 — o
    sea, la pantalla volvía al paso 1 en cuanto avanzabas. Dos `number`, así que
    el compilador no dice nada; lo fija `check:cocina`.
  */
  function saveStep(next: number) {
    setMoved(true);
    setProgress(writeProgress(next, loadedAt));
  }

  function goTo(next: number, buzz = true) {
    if (next < 0 || next >= total) return;
    if (buzz) vibrateTick();
    saveStep(next);
  }

  /*
    Flechas del teclado, solo mientras se leen los pasos. En el cierre hay
    campos de cantidad, y ahí una flecha es del `<input type="number">`.

    Va en `document` y no en un contenedor con `onKeyDown` porque el objetivo es
    que funcione sin tener que enfocar nada primero — y porque colgar un manejador
    de teclado de un `div` que no es un control es justo lo que el lint de
    accesibilidad prohíbe, con razón.
  */
  useEffect(() => {
    if (finished) return;
    function onKey(e: KeyboardEvent) {
      if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
      const el = document.activeElement;
      // Escribiendo en algún sitio manda el campo, no el paso.
      if (
        el instanceof HTMLInputElement ||
        el instanceof HTMLTextAreaElement ||
        (el instanceof HTMLElement && el.isContentEditable)
      ) {
        return;
      }
      const next = step + (e.key === "ArrowRight" ? 1 : -1);
      if (next < 0 || next >= total) return;
      e.preventDefault();
      vibrateTick();
      setMoved(true);
      setProgress(writeProgress(next, loadedAt));
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [finished, step, total, loadedAt, setProgress]);

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-background">
      <CookingHeader
        name={recipe.name}
        step={step}
        total={total}
        finished={finished}
        backHref={backHref}
      />
      {finished ? (
        <CookingFinish
          recipeId={recipeId}
          recipe={recipe}
          entry={entry}
          today={today}
          timesCookedBefore={timesCookedBefore}
          rating={rating}
          backHref={backHref}
          onBackToSteps={() => setFinished(false)}
          onDone={() => setProgress(null)}
        />
      ) : (
        <CookingSteps
          recipe={recipe}
          step={step}
          resumed={resumed}
          onGoTo={goTo}
          onRestart={() => saveStep(0)}
          onFinish={() => {
            vibrateTick();
            setFinished(true);
          }}
        />
      )}
    </div>
  );
}

/** Cabecera fija: de qué plato se habla, por dónde vas y cómo se sale. */
function CookingHeader({
  name,
  step,
  total,
  finished,
  backHref,
}: {
  name: string;
  step: number;
  total: number;
  finished: boolean;
  backHref: string;
}) {
  // Terminado, la barra se llena: el progreso ya no es «paso N», es «hecho».
  const done = finished ? total : step;

  return (
    // `pt-safe-3` y no `py-3 pt-safe`: las dos declaran padding-top y gana la del
    // safe-area, así que en un navegador sin notch el título salía pegado al
    // borde. Mismo apaño que el modo compra.
    <header className="border-b px-4 pb-3 pt-safe-3">
      <div className="mx-auto flex w-full max-w-2xl items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="truncate text-lg font-semibold">{name}</h1>
          <p className="text-xs text-muted-foreground tabular-nums">
            {finished
              ? "Plato terminado"
              : total > 0
                ? `Paso ${step + 1} de ${total}`
                : "Sin pasos"}
          </p>
        </div>
        <Button asChild variant="ghost" size="icon" aria-label="Salir de cocinar">
          <Link href={backHref}>
            <X className="size-5" aria-hidden />
          </Link>
        </Button>
      </div>
      {total > 0 ? (
        <div
          className="mx-auto mt-2 h-1 w-full max-w-2xl overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuenow={done}
          aria-label="Progreso de la receta"
        >
          <div
            className="h-full rounded-full bg-success transition-[width] duration-300"
            style={{ width: `${(done / total) * 100}%` }}
          />
        </div>
      ) : null}
    </header>
  );
}

/** El paso actual a tamaño de cocina, los ingredientes a un toque y el avance. */
function CookingSteps({
  recipe,
  step,
  resumed,
  onGoTo,
  onRestart,
  onFinish,
}: {
  recipe: RecipeCooking;
  step: number;
  resumed: boolean;
  onGoTo: (next: number) => void;
  onRestart: () => void;
  onFinish: () => void;
}) {
  const total = recipe.steps.length;
  const isLast = step === total - 1;
  const [showIngredients, setShowIngredients] = useState(false);
  // Hacia dónde entró el paso: la animación acompaña al gesto en vez de
  // contradecirlo (avanzar entra por la derecha, retroceder por la izquierda).
  const [forward, setForward] = useState(true);

  function move(next: number) {
    setForward(next > step);
    onGoTo(next);
  }

  const gesture = useRef({
    x: 0,
    y: 0,
    active: false,
    axis: "none" as "none" | "h" | "v",
  });

  /*
    Deslizar para cambiar de paso. Gesto propio y no `useSwipeAction`: aquel
    aparta una FILA para destapar su botón (y captura el puntero para eso), y
    aquí no hay nada debajo que destapar — el gesto es la navegación.

    El eje se decide en el primer movimiento y se respeta hasta soltar, si no un
    scroll que empieza torcido saltaría de paso. Solo dedo o lápiz: con ratón
    están los botones, que es lo que se descubre en escritorio.
  */
  function onPointerDown(e: React.PointerEvent) {
    if (e.pointerType === "mouse") return;
    gesture.current = { x: e.clientX, y: e.clientY, active: true, axis: "none" };
  }

  function onPointerMove(e: React.PointerEvent) {
    const g = gesture.current;
    if (!g.active || g.axis !== "none") return;
    const dx = e.clientX - g.x;
    const dy = e.clientY - g.y;
    if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
    g.axis = Math.abs(dx) > Math.abs(dy) ? "h" : "v";
  }

  function onPointerUp(e: React.PointerEvent) {
    const g = gesture.current;
    if (!g.active) return;
    g.active = false;
    if (g.axis !== "h") return;
    const dx = e.clientX - g.x;
    if (dx <= -SWIPE_THRESHOLD) move(step + 1);
    else if (dx >= SWIPE_THRESHOLD) move(step - 1);
  }

  return (
    <>
      <div
        className="flex-1 overflow-y-auto px-4 py-6"
        style={{ touchAction: "pan-y" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => {
          gesture.current.active = false;
        }}
      >
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
          {resumed ? (
            <div className="flex items-center justify-between gap-3 rounded-xl border border-dashed p-3 animate-in fade-in duration-200">
              <p className="text-xs text-muted-foreground">
                Retomas donde lo dejaste.
              </p>
              <Button
                variant="ghost"
                size="sm"
                onClick={onRestart}
                className="shrink-0"
              >
                Empezar de cero
              </Button>
            </div>
          ) : null}

          {/*
            Una sola región viva para el contador y el texto: si el «Paso N de M»
            de la cabecera también lo fuera, cada cambio se anunciaría dos veces.
            La `key` remonta el bloque, que es lo que dispara la animación de
            entrada y, de paso, lo que hace que el lector lea el paso entero.
          */}
          <div aria-live="polite" className="flex flex-col gap-3">
            <p
              key={`n-${step}`}
              className="text-xs font-medium text-muted-foreground tabular-nums"
            >
              Paso {step + 1} de {total}
            </p>
            <p
              key={`t-${step}`}
              className={cn(
                "text-xl leading-relaxed font-medium text-balance duration-200 animate-in fade-in md:text-2xl",
                forward ? "slide-in-from-right-4" : "slide-in-from-left-4",
              )}
            >
              {recipe.steps[step]}
            </p>
          </div>

          {recipe.ingredients.length > 0 ? (
            <div className="flex flex-col gap-3 rounded-xl border p-3">
              <Button
                variant="ghost"
                aria-expanded={showIngredients}
                onClick={() => setShowIngredients((v) => !v)}
                className="justify-start"
              >
                <ListChecks aria-hidden />
                {showIngredients
                  ? "Ocultar ingredientes"
                  : `Ver ingredientes (${recipe.ingredients.length})`}
              </Button>
              {showIngredients ? (
                <div className="flex flex-col gap-2 animate-in fade-in slide-in-from-top-1 duration-200">
                  {/* Las cantidades son las de la receta, para SUS raciones: no
                      se reescalan a las del hogar (la app no tiene modelo de
                      sobras y un número reescalado sin comprobar se lee igual de
                      firme que uno bueno). */}
                  <p className="text-xs text-muted-foreground">
                    Para{" "}
                    {recipe.servings === 1
                      ? "1 ración"
                      : `${recipe.servings} raciones`}
                  </p>
                  <RecipeIngredientList ingredients={recipe.ingredients} />
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      {/*
        Los dos controles del gesto principal, anclados abajo y a tamaño de dedo
        mojado: `size="lg"` y el avance ocupando el ancho que sobra, porque de
        cada diez toques de esta pantalla nueve son «siguiente».
      */}
      <footer className="border-t px-4 pb-safe-3 pt-3">
        <div className="mx-auto flex w-full max-w-2xl gap-2">
          <Button
            variant="outline"
            size="lg"
            onClick={() => move(step - 1)}
            disabled={step === 0}
            aria-label="Paso anterior"
          >
            <ChevronLeft aria-hidden />
          </Button>
          {isLast ? (
            <Button size="lg" className="flex-1" onClick={onFinish}>
              <PartyPopper aria-hidden />
              Terminar
            </Button>
          ) : (
            <Button size="lg" className="flex-1" onClick={() => move(step + 1)}>
              Siguiente
              <ChevronRight aria-hidden />
            </Button>
          )}
        </div>
      </footer>
    </>
  );
}

/**
 * El cierre: lo que se sabe justo al terminar y en ningún otro momento.
 *
 * Encadena las mismas preguntas que el repaso de platos y en el mismo orden
 * —marcar, descontar, apuntar lo que se ha acabado—, más la valoración. La
 * diferencia no es el contenido, es cuándo: aquí el plato está recién hecho.
 *
 * El descuento NO depende de que haya entrada de menú: los ingredientes se
 * gastan igual cocinando fuera de plan, así que se ofrece siempre. Lo que sí
 * depende de la entrada es la marca de cocinado (ver `finishOffer`).
 */
function CookingFinish({
  recipeId,
  recipe,
  entry,
  today,
  timesCookedBefore,
  rating,
  backHref,
  onBackToSteps,
  onDone,
}: {
  recipeId: string;
  recipe: RecipeCooking;
  entry: CookingEntry | null;
  today: string;
  timesCookedBefore: number;
  rating: RecipeRatingSummary;
  backHref: string;
  onBackToSteps: () => void;
  /** Al salir por la puerta buena: el progreso guardado ya no sirve de nada. */
  onDone: () => void;
}) {
  const offer = finishOffer(entry, today);
  const [marked, setMarked] = useState(false);
  const [stage, setStage] = useState<Stage>(
    offer === "mark" ? "mark" : "deduct",
  );
  // null = todavía cargando la propuesta de descuento.
  const [deductions, setDeductions] = useState<CookedDeduction[] | null>(null);
  const [qty, setQty] = useState<Record<string, string>>({});
  const [restock, setRestock] = useState<RestockCandidate[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, startAction] = useTransition();
  const [pendingKind, setPendingKind] = useState<Stage | null>(null);

  /*
    La propuesta de descuento se pide al llegar aquí, no al pulsar: es una
    LECTURA (no escribe nada) y así el bloque ya está calculado cuando el usuario
    termina de leer la enhorabuena. `ignore` porque la respuesta puede llegar
    después de salir de la pantalla.
  */
  useEffect(() => {
    let ignore = false;
    computeCookedDeductionsAction(recipeId)
      .then((r) => {
        if (ignore) return;
        const items = r.deductions ?? [];
        setDeductions(items);
        // Prellenadas con lo que dice la receta: revisar un número es un gesto,
        // teclearlo doce veces es un formulario. Es también lo que hace que el
        // botón de descontar nazca habilitado.
        setQty(initialDeductionQty(items));
      })
      .catch(() => {
        // Sin propuesta no se puede descontar, pero el plato SÍ está hecho: se
        // sigue adelante con lista vacía en vez de dejar el cierre colgado para
        // siempre en «Mirando qué tienes…». Lo que se pierde es el descuento
        // automático, que el inventario deja corregir a mano; lo que no se puede
        // perder es la salida de esta pantalla.
        if (!ignore) setDeductions([]);
      });
    return () => {
      ignore = true;
    };
  }, [recipeId]);

  const deductibles = (deductions ?? []).filter((d) => d.deductible);
  const toDeduct = deductions ? deductionCount(deductions, qty) : 0;
  // La cuenta que se celebra sale de la app, no de un marcador aparte: es la
  // misma de la que se fía el generador de menús para no repetir un plato.
  const times = timesCookedBefore + (marked ? 1 : 0);
  const timesLabel = timesCookedLabel(times);

  /** «Lo cocinamos»: marca la entrada y pasa al descuento. */
  function mark() {
    if (!entry) return;
    vibrateTick();
    setPendingKind("mark");
    startAction(async () => {
      const r = await toggleEntryCookedAction(entry.id, true);
      setPendingKind(null);
      if (r.error) {
        toast.error(r.error);
        return;
      }
      toast.success("Marcado como cocinado");
      setMarked(true);
      setStage("deduct");
    });
  }

  /** Confirma las cantidades revisadas y, si algo se acaba, lo ofrece apuntar. */
  function confirmDeduct() {
    if (!deductions) return;
    setPendingKind("deduct");
    startAction(async () => {
      const r = await confirmCookedDeductionsAction(
        deductionPayload(deductions, qty),
      );
      setPendingKind(null);
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
        setStage("restock");
        return;
      }
      setStage("done");
    });
  }

  /** Apunta en la lista lo que se ha quedado a cero al descontar. */
  function addRestock() {
    setPendingKind("restock");
    startAction(async () => {
      const r = await addListItemsAction(restockPayload(restock, selected));
      setPendingKind(null);
      if (r.error) {
        toast.error(r.error);
        return;
      }
      toast.success(restockToastMessage(r));
      setStage("done");
    });
  }

  return (
    <div className="flex-1 overflow-y-auto px-4 py-6">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-5">
        <div className="flex flex-col items-center gap-2 text-center">
          <span className="flex size-12 items-center justify-center rounded-full bg-accent text-accent-foreground animate-in zoom-in-75 duration-300">
            <PartyPopper className="size-6" aria-hidden />
          </span>
          <h2 className="font-heading text-xl font-semibold">
            ¡{recipe.name} listo!
          </h2>
          {timesLabel ? (
            <p className="text-sm text-muted-foreground">{timesLabel}</p>
          ) : null}
        </div>

        {stage === "mark" ? (
          <div className="flex flex-col gap-2 rounded-xl border p-4">
            <p className="text-sm font-medium">¿Lo apuntamos como cocinado?</p>
            <p className="text-xs text-muted-foreground">
              Con esto el menú deja de preguntarte por él y el generador sabe que
              no toca repetirlo pronto.
            </p>
            <Button
              size="lg"
              onClick={mark}
              loading={busy && pendingKind === "mark"}
            >
              <ChefHat aria-hidden />
              Lo cocinamos
            </Button>
            <Button variant="ghost" onClick={() => setStage("deduct")}>
              Ahora no
            </Button>
          </div>
        ) : null}

        {/*
          El plato estaba planificado para más adelante. No se ofrece marcarlo
          porque el servidor lo rechaza (`toggleEntryCookedAction` veta los días
          que no han llegado), pero callarse dejaría la duda de por qué no está
          el botón que sí sale los demás días.
        */}
        {offer === "future" ? (
          <p className="rounded-xl border border-dashed p-3 text-xs text-muted-foreground">
            Este plato lo tenías planificado para más adelante, así que se
            marcará como cocinado cuando llegue su día.
          </p>
        ) : null}

        {stage === "deduct" ? (
          <div className="flex flex-col gap-3 rounded-xl border p-4">
            <p className="text-sm font-medium">Lo que has gastado</p>
            {deductions === null ? (
              <p className="text-sm text-muted-foreground">
                Mirando qué tienes en la despensa…
              </p>
            ) : deductibles.length === 0 ? (
              <>
                <p className="text-sm text-muted-foreground">
                  {noDeductionsReason(deductions) ??
                    "No hay nada que descontar de la despensa."}
                </p>
                <Button variant="outline" onClick={() => setStage("done")}>
                  Entendido
                </Button>
              </>
            ) : (
              <>
                <p className="text-xs text-muted-foreground">
                  Ajusta las cantidades. Se descuenta del lote que caduca antes.
                </p>
                <CookedDeductionsFields
                  items={deductions}
                  qty={qty}
                  onQtyChange={(key, value) =>
                    setQty((prev) => ({ ...prev, [key]: value }))
                  }
                />
                <Button
                  size="lg"
                  onClick={confirmDeduct}
                  loading={busy && pendingKind === "deduct"}
                  disabled={toDeduct === 0}
                >
                  <Check aria-hidden />
                  {toDeduct <= 1
                    ? "Descontar 1 ingrediente"
                    : `Descontar ${toDeduct} ingredientes`}
                </Button>
                <Button variant="ghost" onClick={() => setStage("done")}>
                  No descontar
                </Button>
              </>
            )}
          </div>
        ) : null}

        {stage === "restock" ? (
          <div className="flex flex-col gap-3 rounded-xl border p-4 animate-in fade-in slide-in-from-top-1 duration-200">
            <p className="text-sm font-medium">Se te ha terminado esto</p>
            <p className="text-xs text-muted-foreground">
              Desmarca lo que no quieras apuntar en la lista.
            </p>
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
              idPrefix="cocinar-restock"
            />
            <Button
              size="lg"
              onClick={addRestock}
              loading={busy && pendingKind === "restock"}
              disabled={selected.size === 0}
            >
              <ShoppingCart aria-hidden />
              {selected.size <= 1
                ? "Apuntar 1 en la lista"
                : `Apuntar ${selected.size} en la lista`}
            </Button>
            <Button variant="ghost" onClick={() => setStage("done")}>
              Ahora no
            </Button>
          </div>
        ) : null}

        {/*
          La valoración vive fuera de la cadena y siempre visible: no es un paso
          que despachar, es la pregunta que mejor se contesta con el plato
          delante. De ella salen las señales de gusto del generador de menús.
        */}
        <RecipeRating
          recipeId={recipeId}
          initialUserRating={rating.userRating}
          avg={rating.avg}
          count={rating.count}
        />

        <div className="flex flex-col gap-2">
          <Button asChild size="lg" onClick={onDone}>
            <Link href={backHref}>Listo</Link>
          </Button>
          {/* Salida de emergencia del cierre: haber pulsado «Terminar» de más no
              puede costar volver a entrar en el modo. */}
          <Button variant="ghost" onClick={onBackToSteps}>
            <ChevronLeft aria-hidden />
            Volver a los pasos
          </Button>
        </div>
      </div>
    </div>
  );
}
