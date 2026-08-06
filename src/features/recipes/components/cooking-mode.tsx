"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import {
  BellRing,
  Check,
  ChefHat,
  ChevronLeft,
  ChevronRight,
  ListChecks,
  PartyPopper,
  ShoppingCart,
  Timer,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  usePersistedChoice,
  usePersistedFlag,
} from "@/hooks/use-persisted-flag";
import { useWakeLock } from "@/hooks/use-wake-lock";
import { playChime, primeChime } from "@/lib/chime";
import { vibrateAlarm, vibrateTick } from "@/lib/haptics";
import { cn } from "@/lib/utils";
import { addListItemsAction } from "@/features/shopping-list/actions";
import type { RestockCandidate } from "@/features/shopping-list/queries";
import {
  computeCookedDeductionsAction,
  confirmCookedDeductionsAction,
  confirmMissingForRecipeAction,
  toggleEntryCookedAction,
} from "@/features/menus/actions";
import type { MissingCandidate } from "@/features/menus/missing";
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
import type { RecipeCooking, RecipeRatingSummary } from "../queries";
import {
  finishOffer,
  progressStorageKey,
  readProgress,
  timesCookedLabel,
  writeProgress,
  type CookingEntry,
} from "../cooking-flow";
import { findStepTimers, formatCountdown } from "../step-timers";
import { RecipeIngredientList } from "./recipe-cooking";
import { RecipeRating } from "./recipe-rating";

/** Recorrido (px) que hay que deslizar para cambiar de paso. */
const SWIPE_THRESHOLD = 60;

/**
 * Cuántos temporizadores pueden correr a la vez. Tres cubre la cocina real (el
 * horno, el arroz y el reposo) y es lo que cabe en la barra sin que cada uno se
 * quede sin sitio para su cuenta atrás.
 */
const MAX_RUNNING_TIMERS = 3;

/** Clave del silenciador del pitido, por dispositivo. */
const MUTE_KEY = "cocinar:silencio";

/** Un temporizador en marcha. */
type RunningTimer = {
  id: string;
  /** Cómo se llamaba el tiempo en el paso: «35 min». */
  label: string;
  /** Momento en que termina, en epoch ms. */
  endsAt: number;
  /** Ya ha sonado y espera que lo quiten de en medio. */
  rung: boolean;
};

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
  missing,
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
  /**
   * Ingredientes que no están ni en la despensa ni apuntados, calculados en el
   * SERVIDOR con la misma cuenta que «añadir a la lista lo que falte». Viene ya
   * resuelto y no se pide al abrir: es lo primero que se lee al entrar, y una
   * pantalla que empieza con «cargando…» donde va el aviso más importante no
   * avisa de nada.
   */
  missing: MissingCandidate[];
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
    El repaso de ingredientes es la pantalla de entrada, y se sale de ella
    pulsando: `started` es ese pulsado y nada más.

    Deliberadamente NO depende de si hay progreso guardado. Podría —«si vuelves a
    mitad, sáltate el repaso»— pero eso se decide leyendo `localStorage`, que en
    el servidor no existe: la primera pintura enseñaría el repaso y la hidratación
    lo quitaría de golpe. Mejor una pantalla estable con el botón diciendo a dónde
    va («Seguir en el paso 5») que un parpadeo en la única pantalla que se mira
    con las manos llenas.
  */
  const [started, setStarted] = useState(false);

  /*
    Temporizadores. Viven AQUÍ y no en la vista de los pasos porque tienen que
    sobrevivir a cambiar de paso y a llegar al cierre: un arroz de 18 minutos se
    arranca en el paso 3 y se come en el 6, y el horno sigue encendido mientras
    valoras el plato.

    Cada uno guarda CUÁNDO TERMINA, no cuánto le queda. Descontando un segundo
    por tic, un rato en segundo plano —donde el navegador estrangula los
    intervalos— dejaría el temporizador retrasado sin que nada fallara; con la
    hora de fin, volver a la pantalla recalcula lo que queda y, si ya pasó, suena
    en ese momento.
  */
  const [timers, setTimers] = useState<RunningTimer[]>([]);
  const [now, setNow] = useState(loadedAt);
  const [muted, setMuted] = usePersistedFlag(MUTE_KEY, false);

  useEffect(() => {
    if (timers.length === 0) return;
    const id = setInterval(() => {
      const t = Date.now();
      setNow(t);
      const due = timers.filter((x) => !x.rung && x.endsAt <= t);
      if (due.length === 0) return;
      // El aviso sale del intervalo y no de la actualización de estado: un
      // actualizador de React tiene que ser puro y se le puede llamar dos veces.
      vibrateAlarm();
      if (!muted) playChime();
      toast.success(
        due.length === 1 ? `¡Tiempo! ${due[0].label}` : "¡Tiempo en la cocina!",
      );
      setTimers((prev) =>
        prev.map((x) => (x.endsAt <= t ? { ...x, rung: true } : x)),
      );
    }, 1000);
    return () => clearInterval(id);
  }, [timers, muted]);

  function startTimer(seconds: number, label: string) {
    if (timers.length >= MAX_RUNNING_TIMERS) {
      toast.info("Ya tienes tres tiempos en marcha.");
      return;
    }
    vibrateTick();
    // Despertar el audio AQUÍ, aprovechando este toque: un `AudioContext` creado
    // sin gesto del usuario nace suspendido, y dentro de 35 minutos no habrá
    // ningún gesto que lo despierte (ver `chime.ts`).
    if (!muted) primeChime();
    const t = Date.now();
    setNow(t);
    setTimers((prev) => [
      ...prev,
      { id: `${t}-${seconds}`, label, endsAt: t + seconds * 1000, rung: false },
    ]);
  }

  function stopTimer(id: string) {
    setTimers((prev) => prev.filter((x) => x.id !== id));
  }

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

  // Sin ingredientes apuntados no hay nada que repasar: se entra directo al paso 1.
  const showPrep = !started && !finished && recipe.ingredients.length > 0;

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-background">
      <CookingHeader
        name={recipe.name}
        step={step}
        total={total}
        finished={finished}
        prep={showPrep}
        backHref={backHref}
      />
      {/* Entre la cabecera y el contenido: se ve igual leyendo un paso que en el
          cierre, porque el horno sigue encendido mientras valoras el plato. */}
      <TimerBar
        timers={timers}
        now={now}
        muted={muted}
        onToggleMute={() => setMuted(!muted)}
        onStop={stopTimer}
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
      ) : showPrep ? (
        <CookingPrep
          recipeId={recipeId}
          recipe={recipe}
          missing={missing}
          resumeStep={step}
          onStart={() => {
            vibrateTick();
            setStarted(true);
          }}
        />
      ) : (
        <CookingSteps
          recipe={recipe}
          step={step}
          resumed={resumed}
          runningTimers={timers.length}
          onStartTimer={startTimer}
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

/**
 * *Mise en place*: el repaso de ingredientes con el que arranca el modo.
 *
 * Hace dos cosas que no se parecen, y por eso la pantalla lo dice con dos
 * lenguajes distintos:
 *
 *  - **La lista con casillas es el ritual**, no un dato de la app: se marca lo
 *    que vas dejando en la encimera. Nace todo sin marcar, porque marcarlo por ti
 *    sería justo lo contrario de para lo que sirve.
 *  - **El rótulo de «no lo tienes» es la app hablando**, y sale de la MISMA
 *    cuenta con la que «añadir a la lista lo que falte» decide qué apuntar
 *    (`computeMissingForRecipes`). Por eso el botón de apuntar actúa sobre eso y
 *    NO sobre las casillas vacías: una casilla sin marcar significa «todavía no
 *    lo he sacado», que no es lo mismo que «no lo tengo».
 *
 * Se muestra siempre al entrar, sin preferencia de «no volver a enseñarla». Es
 * un toque, y la alternativa —guardarla en el dispositivo— haría parpadear la
 * pantalla en cada carga mientras el servidor no sabe todavía qué eligió este
 * móvil. Si estorba, se quita entera; media medida aquí sale peor.
 */
function CookingPrep({
  recipeId,
  recipe,
  missing,
  resumeStep,
  onStart,
}: {
  recipeId: string;
  recipe: RecipeCooking;
  missing: MissingCandidate[];
  /** Paso guardado al que se volvería, o 0 si se empieza de cero. */
  resumeStep: number;
  onStart: () => void;
}) {
  const [ready, setReady] = useState<Set<number>>(new Set());
  const [addedToList, setAddedToList] = useState(false);
  const [adding, startAdding] = useTransition();

  // Los que la app sabe que no tienes, por nombre: los dos lados salen de la
  // misma columna (`recipe_ingredients.name`), así que casan carácter a carácter.
  const missingNames = new Set(missing.map((m) => m.ingredientName));

  function addMissing() {
    vibrateTick();
    startAdding(async () => {
      const r = await confirmMissingForRecipeAction(
        recipeId,
        missing.map((m) => m.key),
      );
      if (r.error) {
        toast.error(r.error);
        return;
      }
      const n = r.added ?? 0;
      toast.success(
        n === 1 ? "1 producto apuntado en la lista" : `${n} apuntados en la lista`,
      );
      setAddedToList(true);
    });
  }

  return (
    <>
      <div className="flex-1 overflow-y-auto px-4 py-6">
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-5">
          <div className="flex flex-col gap-1">
            <h2 className="font-heading text-xl font-semibold">
              Antes de empezar
            </h2>
            <p className="text-sm text-muted-foreground">
              Saca lo que vas a necesitar y márcalo. Para{" "}
              {recipe.servings === 1 ? "1 ración" : `${recipe.servings} raciones`}
              {recipe.prepMinutes !== null ? ` · ${recipe.prepMinutes} min` : ""}.
            </p>
          </div>

          {missing.length > 0 && !addedToList ? (
            <div className="flex flex-col gap-2 rounded-xl border border-warning/40 bg-warning/15 p-3">
              <p className="text-sm font-medium text-warning">
                {missing.length === 1
                  ? "Te falta 1 ingrediente"
                  : `Te faltan ${missing.length} ingredientes`}
              </p>
              <p className="text-xs text-warning">
                No está en la despensa ni apuntado en la lista:{" "}
                {missing.map((m) => m.ingredientName).join(", ")}.
              </p>
              <Button
                variant="outline"
                onClick={addMissing}
                loading={adding}
                className="self-start bg-background"
              >
                <ShoppingCart aria-hidden />
                Apuntar en la lista
              </Button>
            </div>
          ) : null}

          <ul className="flex flex-col gap-1">
            {recipe.ingredients.map((ing, i) => {
              const id = `mise-${i}`;
              const falta = missingNames.has(ing.name);
              return (
                <li key={`${ing.name}-${i}`}>
                  <Label
                    htmlFor={id}
                    className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-1 font-normal"
                  >
                    <Checkbox
                      id={id}
                      checked={ready.has(i)}
                      onCheckedChange={(v) => {
                        if (v === true) vibrateTick();
                        setReady((prev) => {
                          const next = new Set(prev);
                          if (v === true) next.add(i);
                          else next.delete(i);
                          return next;
                        });
                      }}
                      className="size-5 shrink-0"
                    />
                    <span
                      className={cn(
                        "min-w-16 shrink-0 text-sm tabular-nums text-muted-foreground",
                        ready.has(i) && "line-through",
                      )}
                    >
                      {ing.quantity === null
                        ? "al gusto"
                        : `${ing.quantity}${ing.unit ? ` ${ing.unit}` : ""}`}
                    </span>
                    <span
                      className={cn(
                        "min-w-0 flex-1 text-sm",
                        ready.has(i) && "text-muted-foreground line-through",
                      )}
                    >
                      {ing.name}
                      {ing.optional ? (
                        <span className="text-muted-foreground"> (opcional)</span>
                      ) : null}
                    </span>
                    {falta ? (
                      <span className="shrink-0 rounded-md border border-warning/40 bg-warning/15 px-1.5 py-0.5 text-xs text-warning">
                        no lo tienes
                      </span>
                    ) : null}
                  </Label>
                </li>
              );
            })}
          </ul>
        </div>
      </div>

      <footer className="border-t px-4 pb-safe-3 pt-3">
        <div className="mx-auto w-full max-w-2xl">
          {/*
            Nunca bloquea: las casillas son para ti, no un formulario que haya que
            completar. Se puede empezar con todo sin marcar y con ingredientes que
            te faltan — a lo mejor los sustituyes, o los tienes y la app no lo
            sabe.
          */}
          <Button size="lg" className="w-full" onClick={onStart}>
            {resumeStep > 0 ? `Seguir en el paso ${resumeStep + 1}` : "Empezar"}
            <ChevronRight aria-hidden />
          </Button>
        </div>
      </footer>
    </>
  );
}

/**
 * Los tiempos en marcha, siempre a la vista mientras dure el modo.
 *
 * Un temporizador que hay que ir a buscar no sirve de nada, así que esto no se
 * pliega ni se esconde tras un icono: ocupa sitio solo cuando hay algo contando,
 * y entonces es justo lo que se quiere ver al levantar la vista.
 *
 * El que ya ha sonado se queda en la barra en vez de desaparecer solo, con el
 * aviso en `warning` (el mismo tinte que usa la app para «esto pide tu
 * atención»). Desaparecer sería perder la única prueba de que sonó para quien
 * estaba en otra habitación.
 */
function TimerBar({
  timers,
  now,
  muted,
  onToggleMute,
  onStop,
}: {
  timers: RunningTimer[];
  /** Reloj compartido por todos: uno por temporizador no cabría en un tic. */
  now: number;
  muted: boolean;
  onToggleMute: () => void;
  onStop: (id: string) => void;
}) {
  if (timers.length === 0) return null;

  return (
    <div className="border-b bg-card px-4 py-2">
      <div className="mx-auto flex w-full max-w-2xl items-center gap-2">
        <ul className="flex min-w-0 flex-1 flex-wrap gap-2">
          {timers.map((t) => {
            const left = t.endsAt - now;
            const done = t.rung || left <= 0;
            return (
              <li
                key={t.id}
                className={cn(
                  "flex items-center gap-2 rounded-lg border px-2 py-1",
                  done && "border-warning/40 bg-warning/15 text-warning",
                )}
              >
                {done ? (
                  <BellRing aria-hidden className="size-4 shrink-0" />
                ) : (
                  <Timer
                    aria-hidden
                    className="size-4 shrink-0 text-muted-foreground"
                  />
                )}
                {/*
                  `aria-live` solo en el que ya sonó: una cuenta atrás que se
                  anuncia cada segundo deja el lector de pantalla inservible.
                */}
                <span
                  className="text-sm font-medium tabular-nums"
                  aria-live={done ? "assertive" : "off"}
                >
                  {done ? `¡Tiempo! ${t.label}` : formatCountdown(left)}
                </span>
                {/*
                  Diana completa de 44px y no un `icon-sm` que abultaría menos:
                  esta pantalla se toca con las manos mojadas, que es el peor
                  sitio posible para un objetivo pequeño. La barra crece un poco
                  y solo mientras haya algo contando.
                */}
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={
                    done
                      ? `Descartar el aviso de ${t.label}`
                      : `Cancelar el tiempo de ${t.label}`
                  }
                  onClick={() => onStop(t.id)}
                >
                  <X aria-hidden className="size-4" />
                </Button>
              </li>
            );
          })}
        </ul>
        <Button
          variant="ghost"
          size="icon"
          aria-label={muted ? "Activar el sonido" : "Silenciar el sonido"}
          aria-pressed={muted}
          onClick={onToggleMute}
          className="shrink-0 text-muted-foreground"
        >
          {muted ? (
            <VolumeX aria-hidden className="size-5" />
          ) : (
            <Volume2 aria-hidden className="size-5" />
          )}
        </Button>
      </div>
    </div>
  );
}

/** Cabecera fija: de qué plato se habla, por dónde vas y cómo se sale. */
function CookingHeader({
  name,
  step,
  total,
  finished,
  prep,
  backHref,
}: {
  name: string;
  step: number;
  total: number;
  finished: boolean;
  /** En el repaso de ingredientes, que va antes del primer paso. */
  prep: boolean;
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
              : prep
                ? "Ingredientes"
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
  runningTimers,
  onStartTimer,
  onGoTo,
  onRestart,
  onFinish,
}: {
  recipe: RecipeCooking;
  step: number;
  resumed: boolean;
  /** Cuántos hay ya en marcha: al llegar al tope los chips se apagan. */
  runningTimers: number;
  onStartTimer: (seconds: number, label: string) => void;
  onGoTo: (next: number) => void;
  onRestart: () => void;
  onFinish: () => void;
}) {
  const total = recipe.steps.length;
  const isLast = step === total - 1;
  // Los tiempos que menciona ESTE paso. Se calcula en el render y no se guarda:
  // es una función pura sobre un texto que ya está en memoria (ver `step-timers`).
  const stepTimers = findStepTimers(recipe.steps[step] ?? "");
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

          {/*
            Los tiempos que dice el paso, para ponerlos en marcha sin ir a buscar
            el reloj del móvil con las manos sucias. Es una SUGERENCIA leída del
            texto, no un dato de la receta: por eso son chips que se pulsan y no
            un temporizador que arranca solo. Un paso sin tiempos no enseña nada
            (ver `step-timers.ts`, que prefiere callarse a acertar de más).
          */}
          {stepTimers.length > 0 ? (
            <div
              className="flex flex-wrap items-center gap-2"
              role="group"
              aria-label="Tiempos de este paso"
            >
              {stepTimers.map((t) => (
                <Button
                  key={t.key}
                  variant="outline"
                  onClick={() => onStartTimer(t.seconds, t.label)}
                  disabled={runningTimers >= MAX_RUNNING_TIMERS}
                  aria-label={`Poner un temporizador de ${t.label}`}
                >
                  <Timer aria-hidden />
                  {t.label}
                </Button>
              ))}
            </div>
          ) : null}

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
