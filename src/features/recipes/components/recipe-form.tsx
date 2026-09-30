"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronUp, Plus, Trash } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  APPROX,
  convertQuantity,
  formatQuantity,
  roundQuantity,
  UNIT_OPTIONS,
  unitFamily,
} from "@/lib/units";
import { actionErrorMessage, safeAction } from "@/lib/action-error";
import { aiProvenanceAttrs } from "@/lib/ai/provenance";
import { normalizeName } from "@/lib/normalize";
import { cn } from "@/lib/utils";
import type { UnitType } from "@/lib/supabase/types";
import { AiConsentModal } from "@/features/ai-consent/components/ai-consent-modal";
import type { ProductStock } from "@/features/inventory/queries";
// El botón de IA vive en `menus` porque nació allí, y se reutiliza tal cual: es
// la firma de IA de la app (el relleno `--ai-fill` que late), y recrear ese
// degradado aquí sería un segundo sitio donde mantener el mismo color.
import { AiGenerateButton } from "@/features/menus/components/ai-generate-button";
import type { CatalogProduct } from "@/features/shopping-list/queries";
import { ProductAutocomplete } from "@/features/shopping-list/components/product-autocomplete";
import type { RecipeForEdit, MealTypeValue, SeasonValue } from "../queries";
import { cleanStepText } from "../ai-draft";
import {
  MAX_INGREDIENT_QUANTITY,
  MAX_RECIPE_STEPS,
  type RecipeIngredientInput,
  type RecipeInput,
} from "../schemas";
import {
  MEAL_TYPE_OPTIONS,
  RECIPE_GENERATION_STEPS,
  SEASON_OPTIONS,
  seasonsToChoice,
} from "../constants";
import {
  createRecipeAction,
  deleteRecipeAction,
  generateRecipeDetailsAction,
  updateRecipeAction,
  type RecipeDetailsDraft,
} from "../actions";

type IngredientRow = {
  key: number;
  name: string;
  quantity: string;
  unit: string; // "none" o UnitType
  optional: boolean;
  productId: string | null;
};

/**
 * Un paso del editor. Lleva `key` propia por lo mismo que las filas de
 * ingrediente: si la posición fuera la key, reordenar remontaría los campos y el
 * foco se caería del que estás moviendo.
 */
type StepRow = { key: number; text: string };

const NO_UNIT = "none";

function emptyRow(key: number): IngredientRow {
  return {
    key,
    name: "",
    quantity: "",
    unit: NO_UNIT,
    optional: false,
    productId: null,
  };
}

function emptyStep(key: number): StepRow {
  return { key, text: "" };
}

/** Tono del badge de stock por ingrediente (tokens semánticos). */
type StockTone = "muted" | "success" | "warning";

/**
 * Veredicto de stock para un ingrediente ya resuelto a un producto del catálogo.
 * Devuelve `null` cuando el ingrediente no está vinculado (texto libre sin
 * match): en ese caso no se muestra badge, igual que antes de F3.
 */
function stockInfo(
  stock: ProductStock | undefined,
  quantity: string,
  unit: string,
): { text: string; tone: StockTone } | null {
  if (!stock) return { text: "No lo tienes", tone: "muted" };

  const have = formatQuantity(stock.quantity, stock.unit);
  const qty = quantity.trim() ? Number(quantity.replace(",", ".")) : null;

  // Sin cantidad pedida en la receta → solo presencia.
  if (qty === null || !Number.isFinite(qty) || qty <= 0) {
    return { text: "En casa", tone: "success" };
  }
  // Sin unidad en la receta no hay nada que comparar.
  if (unit === NO_UNIT) return { text: `Tienes ${have}`, tone: "muted" };

  // El stock se lleva a la unidad de la receta: exacto en la misma familia y,
  // entre ud y medida, con el contenido del envase si el producto lo declara.
  const askUnit = unit as UnitType;
  const stockInAskUnit = convertQuantity(
    stock.quantity,
    stock.unit,
    askUnit,
    stock.content,
  );
  // Sigue sin poder convertirse (ud contra peso sin contenido) → stock sin veredicto.
  if (stockInAskUnit === null) return { text: `Tienes ${have}`, tone: "muted" };

  // Al cruzar familias el equivalente se muestra entre paréntesis: "3 ud" no
  // deja ver si llega para los 300 ml que pide la receta.
  const crossFamily = unitFamily(askUnit) !== unitFamily(stock.unit);
  const equivalent = formatQuantity(roundQuantity(stockInAskUnit), askUnit);
  // Si el puente ha sido un PESO MEDIO, el equivalente es aproximado y no da
  // para un veredicto: se muestra como pista (gris, con «≈») y decide quien
  // cocina. Un "no te llega" en ámbar sobre un peso estimado sería mentir.
  const approx = crossFamily && stock.content?.estimate === true;
  if (approx) {
    return { text: `Tienes ${have} (${APPROX} ${equivalent})`, tone: "muted" };
  }
  const text = crossFamily ? `Tienes ${have} (${equivalent})` : `Tienes ${have}`;
  return { text, tone: stockInAskUnit >= qty ? "success" : "warning" };
}

export function RecipeForm({
  recipe,
  catalog = [],
  stock = {},
}: {
  recipe?: RecipeForEdit;
  catalog?: CatalogProduct[];
  stock?: Record<string, ProductStock>;
}) {
  const router = useRouter();
  const isEdit = Boolean(recipe);

  const [name, setName] = useState(recipe?.name ?? "");
  const [description, setDescription] = useState(recipe?.description ?? "");
  const [servings, setServings] = useState(String(recipe?.servings ?? 2));
  const [prepMinutes, setPrepMinutes] = useState(
    recipe?.prepMinutes != null ? String(recipe.prepMinutes) : "",
  );
  const [mealTypes, setMealTypes] = useState<MealTypeValue[]>(
    (recipe?.mealTypes ?? ["lunch"]).filter(
      (m): m is MealTypeValue =>
        m === "breakfast" || m === "lunch" || m === "dinner",
    ),
  );
  const [season, setSeason] = useState<SeasonValue>(
    seasonsToChoice(recipe?.seasons ?? ["all"]),
  );

  const initialRows: IngredientRow[] =
    recipe && recipe.ingredients.length > 0
      ? recipe.ingredients.map((ing, i) => ({
          key: i,
          name: ing.name,
          quantity: ing.quantity != null ? String(ing.quantity) : "",
          unit: ing.unit ?? NO_UNIT,
          optional: ing.optional,
          productId: ing.productId,
        }))
      : [emptyRow(0)];
  const [rows, setRows] = useState<IngredientRow[]>(initialRows);
  const nextKey = useRef(initialRows.length);

  const initialSteps: StepRow[] =
    recipe && recipe.steps.length > 0
      ? recipe.steps.map((text, i) => ({ key: i, text }))
      : [emptyStep(0)];
  const [steps, setSteps] = useState<StepRow[]>(initialSteps);
  const nextStepKey = useRef(initialSteps.length);
  // La marca de IA acompaña al texto guardado, no al campo: en cuanto se toca
  // un paso ya es el borrador de una persona (y guardarlo la quita en la base).
  const stepsFromAi =
    !!recipe?.stepsFromAi &&
    steps.length === recipe.steps.length &&
    steps.every((s, i) => s.text === recipe.steps[i]);

  // Índice del catálogo por nombre normalizado, para resolver el vínculo en vivo
  // mientras se escribe (además del id explícito elegido en el autocompletado).
  const catalogByNorm = useMemo(() => {
    const map = new Map<string, CatalogProduct>();
    for (const p of catalog) map.set(p.normalizedName, p);
    return map;
  }, [catalog]);

  /** Producto vinculado a una fila: id explícito o match exacto por nombre. */
  function resolveProductId(row: IngredientRow): string | null {
    if (row.productId) return row.productId;
    const norm = normalizeName(row.name);
    return norm ? (catalogByNorm.get(norm)?.id ?? null) : null;
  }

  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [aiConsentRetry, setAiConsentRetry] = useState<null | (() => void)>(
    null,
  );

  /*
    El botón de la IA vive dentro del `<fieldset disabled>` que se bloquea al
    generar, así que en cuanto empieza deja de poder recibir el foco y quien va
    con teclado se lo encuentra en `<body>`. Al terminar se le devuelve, que es
    además donde tiene sentido dejarlo: es el botón que se acaba de pulsar y
    está justo encima de lo que ha cambiado.
  */
  const aiButtonRef = useRef<HTMLButtonElement>(null);
  const wasGenerating = useRef(false);
  useEffect(() => {
    if (wasGenerating.current && !generating) aiButtonRef.current?.focus();
    wasGenerating.current = generating;
  }, [generating]);

  function toggleMealType(value: MealTypeValue) {
    setMealTypes((prev) =>
      prev.includes(value)
        ? prev.filter((m) => m !== value)
        : [...prev, value],
    );
  }

  function patchRow(key: number, patch: Partial<IngredientRow>) {
    setRows((prev) =>
      prev.map((r) => (r.key === key ? { ...r, ...patch } : r)),
    );
  }

  function addRow() {
    setRows((prev) => [...prev, emptyRow(nextKey.current++)]);
  }

  function removeRow(key: number) {
    setRows((prev) => prev.filter((r) => r.key !== key));
  }

  function patchStep(key: number, text: string) {
    setSteps((prev) =>
      prev.map((s) => (s.key === key ? { ...s, text } : s)),
    );
  }

  function addStep() {
    setSteps((prev) => [...prev, emptyStep(nextStepKey.current++)]);
  }

  function removeStep(key: number) {
    setSteps((prev) => prev.filter((s) => s.key !== key));
  }

  /** Intercambia un paso con el de al lado (dir = -1 sube, +1 baja). */
  function moveStep(index: number, dir: -1 | 1) {
    setSteps((prev) => {
      const target = index + dir;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  /**
   * Pegar un texto con saltos de línea reparte una línea por paso: así llega una
   * receta copiada de cualquier sitio, y dejarla caer entera en un solo campo
   * obliga a partirla a mano justo cuando ya la tenías escrita.
   *
   * El paso donde pegas conserva su `key`, que es lo que mantiene el foco donde
   * estaba. La numeración de las líneas la quita `cleanStepText`, el MISMO recorte
   * que se aplica a lo que escribe la IA: dos copias de esa regla acababan
   * arregladas solo en una.
   */
  function handleStepPaste(
    key: number,
    event: React.ClipboardEvent<HTMLTextAreaElement>,
  ) {
    const pasted = event.clipboardData.getData("text");
    if (!pasted.includes("\n")) return; // una línea: pegado normal del navegador

    /*
      Lo pegado ocupa el sitio de la SELECCIÓN: la primera línea se cose a lo que
      hubiera delante del cursor y la última recoge lo que hubiera detrás (con una
      sola línea, las dos cosas caen en el mismo paso). Sin esto, seleccionar un
      paso y pegar encima no sustituía nada —lo seleccionado se quedaba y lo pegado
      se iba al final—, y el mismo gesto hacía dos cosas distintas según si el
      portapapeles traía un salto de línea o no.
    */
    const el = event.currentTarget;
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? start;
    const lineas = pasted.split(/\r?\n/);
    lineas[0] = `${el.value.slice(0, start)}${lineas[0]}`;
    lineas[lineas.length - 1] += el.value.slice(end);
    const partes = lineas.map(cleanStepText).filter(Boolean);
    if (partes.length === 0) return;

    event.preventDefault();

    /*
      El tope se aplica AL PEGAR y no al guardar. Una receta copiada de una web
      trae de propina su encabezado y su lista de ingredientes, así que dejar
      entrar las cuarenta líneas convertía el «Guardar» en un «Demasiados pasos»
      con treinta filas que borrar a mano, después de haber pegado.
    */
    const sitio = Math.max(MAX_RECIPE_STEPS - (steps.length - 1), 1);
    const cabe = partes.slice(0, sitio);
    if (cabe.length < partes.length) {
      toast.info(
        `Se han pegado ${cabe.length} pasos: no caben más de ${MAX_RECIPE_STEPS}.`,
      );
    }

    // Las keys se reservan fuera del updater: dentro, un `key++` se ejecutaría
    // dos veces con StrictMode.
    const nuevas = cabe.slice(1).map((text) => ({
      key: nextStepKey.current++,
      text,
    }));
    setSteps((prev) =>
      prev.flatMap((s) =>
        s.key === key ? [{ ...s, text: cabe[0] }, ...nuevas] : [s],
      ),
    );
  }

  /** Raciones para las que están escritas las cantidades, en palabras. */
  const servingsCount = Number(servings) || 2;
  const servingsLabel =
    servingsCount === 1 ? "1 ración" : `${servingsCount} raciones`;

  /** ¿Hay algo escrito? Decide si el botón de IA escribe o REHACE los pasos. */
  const hasSteps = steps.some((s) => s.text.trim().length > 0);

  /**
   * Los ingredientes del formulario tal como los espera el servidor. Lo comparten
   * el guardado y la generación con IA a propósito: la mezcla del borrador
   * (`ai-draft.ts`) empareja por NOMBRE para no romper el vínculo con el catálogo,
   * así que el nombre que viaja al modelo tiene que ser exactamente el que se
   * guardaría. Con dos mapeos, cualquier recorte que se añadiera en uno haría que
   * el modelo viera un ingrediente y la base otro.
   */
  function ingredientInputs(): RecipeIngredientInput[] {
    return rows
      .filter((r) => r.name.trim())
      .map((r) => ({
        name: r.name.trim(),
        quantity: r.quantity.trim()
          ? Number(r.quantity.replace(",", "."))
          : null,
        unit: r.unit === NO_UNIT ? null : (r.unit as UnitType),
        optional: r.optional,
        productId: r.productId,
      }));
  }

  function buildInput(): RecipeInput {
    return {
      name: name.trim(),
      description: description.trim() || null,
      servings: servingsCount,
      prepMinutes: prepMinutes.trim() ? Number(prepMinutes) : null,
      mealTypes,
      seasons: [season],
      // Cada paso viaja en UNA línea: los saltos que se hayan tecleado dentro de
      // un paso se colapsan a un espacio. Si no, un paso con un `\n` dentro
      // volvería del servidor como un paso que se pinta en dos y el editor ya no
      // sabría dónde acaba: pegar un bloque es lo que reparte en varios pasos.
      steps: steps
        .map((s) => s.text.replace(/\s+/g, " ").trim())
        .filter(Boolean),
      ingredients: ingredientInputs(),
    };
  }

  /**
   * Vuelca en el formulario lo que ha escrito la IA. NO guarda nada: lo que se
   * ve es un borrador que se guarda con el botón de siempre, y por eso rehacer
   * los pasos aquí no puede perder nada mientras no se pulse guardar.
   */
  function applyDetails(details: RecipeDetailsDraft) {
    const nextRows: IngredientRow[] = details.ingredients.map((ing, i) => ({
      key: i,
      name: ing.name,
      quantity: ing.quantity != null ? String(ing.quantity) : "",
      unit: ing.unit ?? NO_UNIT,
      optional: ing.optional,
      productId: ing.productId,
    }));
    setRows(nextRows.length > 0 ? nextRows : [emptyRow(0)]);
    nextKey.current = Math.max(nextRows.length, 1);

    // Sin pasos en la respuesta, se quedan los que había: el modelo a veces
    // trae solo ingredientes, y aplicar la lista vacía borraba del borrador
    // unos pasos escritos a mano bajo un «Receta escrita».
    if (details.steps.length > 0) {
      setSteps(details.steps.map((text, i) => ({ key: i, text })));
      nextStepKey.current = details.steps.length;
    }

    // Los minutos, solo si no los habías puesto tú: ese dato ya era tuyo.
    if (!prepMinutes.trim() && details.prepMinutes !== null) {
      setPrepMinutes(String(details.prepMinutes));
    }
  }

  async function generateWithAi() {
    setError(null);
    if (!name.trim()) {
      setError("Escribe primero el nombre del plato.");
      return;
    }

    setGenerating(true);
    try {
      const result = await generateRecipeDetailsAction({
        name: name.trim(),
        description: description.trim() || null,
        servings: servingsCount,
        mealTypes,
        ingredients: ingredientInputs(),
      });
      /*
        Esta página no es un modal, así que aquí SÍ se puede abrir el de
        consentimiento y reintentar al aceptar. Dentro de /menus, «Otra idea» solo
        puede avisar por toast: vive en un ResponsiveModal y encadenar dos hace
        que el segundo se cierre solo (cierre por historial de E11).
      */
      if (result.needsAiConsent) {
        setAiConsentRetry(() => () => void generateWithAi());
        return;
      }
      if (result.error || !result.details) {
        setError(result.error ?? "No se pudo escribir la receta.");
        return;
      }
      applyDetails(result.details);
      toast.success("Receta escrita. Revísala antes de guardar.");
    } catch (err) {
      setError(actionErrorMessage("No se pudo escribir la receta.", err));
    } finally {
      setGenerating(false);
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError("Escribe el nombre de la receta.");
      return;
    }
    if (mealTypes.length === 0) {
      setError("Marca para qué comida es.");
      return;
    }

    setPending(true);
    const input = buildInput();
    try {
      const result =
        recipe != null
          ? await updateRecipeAction(recipe.id, input)
          : await createRecipeAction(input);
      if (result.error) {
        setError(result.error);
        return;
      }
      toast.success(isEdit ? "Receta actualizada" : "Receta guardada");
      router.push("/recetas");
      router.refresh();
    } catch (err) {
      setError(actionErrorMessage("No se pudo guardar la receta.", err));
    } finally {
      setPending(false);
    }
  }

  async function handleDelete() {
    if (!recipe) return;
    setDeleting(true);
    const result = await safeAction(
      deleteRecipeAction(recipe.id),
      "No se pudo eliminar la receta.",
    );
    setDeleting(false);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success("Receta eliminada");
    router.push("/recetas");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6 pb-8">
      {/* Datos básicos */}
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="recipe-name">Nombre</Label>
          <Input
            id="recipe-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            maxLength={160}
            autoComplete="off"
            placeholder="p. ej. Lentejas con verduras"
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="recipe-description">
            Descripción <span className="text-muted-foreground">(opcional)</span>
          </Label>
          <Textarea
            id="recipe-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={1000}
            placeholder="Una nota breve sobre el plato"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-2">
            <Label htmlFor="recipe-servings">Raciones</Label>
            <Input
              id="recipe-servings"
              type="number"
              inputMode="numeric"
              min={1}
              max={99}
              step={1}
              value={servings}
              onChange={(e) => setServings(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="recipe-minutes">
              Minutos <span className="text-muted-foreground">(opcional)</span>
            </Label>
            <Input
              id="recipe-minutes"
              type="number"
              inputMode="numeric"
              min={0}
              max={999}
              step={1}
              value={prepMinutes}
              onChange={(e) => setPrepMinutes(e.target.value)}
              placeholder="p. ej. 45"
            />
          </div>
        </div>
      </div>

      {/* Tipo de comida */}
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium">Tipo de comida</legend>
        <p className="mb-1 text-xs text-muted-foreground">
          Puedes marcar varias.
        </p>
        {/* `flex-wrap`: con Desayuno son tres botones grandes, y a 375 px no caben. */}
        <div className="flex flex-wrap gap-2">
          {MEAL_TYPE_OPTIONS.map((o) => {
            const active = mealTypes.includes(o.value);
            return (
              <Button
                key={o.value}
                type="button"
                variant={active ? "default" : "outline"}
                size="lg"
                aria-pressed={active}
                onClick={() => toggleMealType(o.value)}
                className="flex-1"
              >
                {o.label}
              </Button>
            );
          })}
        </div>
      </fieldset>

      {/* Temporada */}
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium">Temporada</legend>
        <div className="flex gap-2">
          {SEASON_OPTIONS.map((o) => {
            const active = season === o.value;
            return (
              <Button
                key={o.value}
                type="button"
                variant={active ? "default" : "outline"}
                aria-pressed={active}
                onClick={() => setSeason(o.value)}
                className="flex-1"
              >
                {o.label}
              </Button>
            );
          })}
        </div>
      </fieldset>

      {/*
        Los dos bloques que la IA reescribe se bloquean mientras escribe, y es un
        `disabled` de <fieldset> —que el navegador propaga a todo lo de dentro—
        para no repetirlo campo a campo. Sin esto, lo que teclearas durante la
        espera (hasta 45 s) desaparecía sin aviso en cuanto llegaba el borrador:
        `applyDetails` reemplaza las dos listas por la foto que se envió.
      */}
      {/* Ingredientes */}
      <fieldset className="flex flex-col gap-3" disabled={generating}>
        <legend className="mb-1 text-sm font-medium">Ingredientes</legend>
        <ul className="flex flex-col gap-3">
          {rows.map((row) => {
            const resolved = resolveProductId(row);
            const info = resolved
              ? stockInfo(stock[resolved], row.quantity, row.unit)
              : null;
            return (
            <li
              key={row.key}
              className="flex flex-col gap-2 rounded-lg border p-3"
            >
              {/* Etiquetas visibles y no solo placeholder: al escribir, el
                  placeholder desaparece y con él la única pista de qué era cada
                  campo. En text-xs para no engordar una fila que se repite. */}
              <div className="flex items-end gap-2">
                <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                  <Label
                    htmlFor={`ing-${row.key}-name`}
                    className="text-xs text-muted-foreground"
                  >
                    Ingrediente
                  </Label>
                  <ProductAutocomplete
                    id={`ing-${row.key}-name`}
                    products={catalog}
                    value={row.name}
                    onValueChange={(v) =>
                      patchRow(row.key, { name: v, productId: null })
                    }
                    onSelect={(p) =>
                      patchRow(row.key, { name: p.name, productId: p.id })
                    }
                    required={false}
                    inputName="ingredient-name"
                    placeholder="p. ej. Lentejas"
                  />
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Quitar ingrediente"
                  onClick={() => removeRow(row.key)}
                >
                  <Trash aria-hidden />
                </Button>
              </div>
              {info ? (
                <Badge
                  className={cn(
                    "self-start border-transparent",
                    info.tone === "success" && "bg-success/15 text-success",
                    info.tone === "warning" && "bg-warning/15 text-warning",
                    info.tone === "muted" && "bg-muted text-muted-foreground",
                  )}
                >
                  {info.text}
                </Badge>
              ) : null}
              <div className="flex items-end gap-2">
                <div className="flex flex-col gap-1.5">
                  <Label
                    htmlFor={`ing-${row.key}-qty`}
                    className="text-xs text-muted-foreground"
                  >
                    Cantidad
                  </Label>
                  <Input
                    id={`ing-${row.key}-qty`}
                    value={row.quantity}
                    onChange={(e) =>
                      patchRow(row.key, { quantity: e.target.value })
                    }
                    type="number"
                    inputMode="decimal"
                    min={0}
                    /* El tope es el de la columna (`numeric(10, 2)`): más largo
                       que eso no es una cantidad, es un cero de más al teclear, y
                       sin `max` el navegador lo enviaba y reventaba el guardado. */
                    max={MAX_INGREDIENT_QUANTITY}
                    step="any"
                    placeholder="p. ej. 2"
                    className="w-24"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label
                    htmlFor={`ing-${row.key}-unit`}
                    className="text-xs text-muted-foreground"
                  >
                    Unidad
                  </Label>
                  <Select
                    value={row.unit}
                    onValueChange={(v) => patchRow(row.key, { unit: v })}
                  >
                    <SelectTrigger
                      id={`ing-${row.key}-unit`}
                      className="w-32"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NO_UNIT}>Sin unidad</SelectItem>
                      {UNIT_OPTIONS.map((u) => (
                        <SelectItem key={u.value} value={u.value}>
                          {u.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Label
                  className="ml-auto flex h-11 items-center gap-2 text-sm font-normal text-muted-foreground"
                >
                  Opcional
                  <Switch
                    checked={row.optional}
                    onCheckedChange={(v) =>
                      patchRow(row.key, { optional: v })
                    }
                    aria-label="Ingrediente opcional"
                  />
                </Label>
              </div>
            </li>
            );
          })}
        </ul>
        <Button
          type="button"
          variant="outline"
          onClick={addRow}
          className="self-start"
        >
          <Plus aria-hidden /> Añadir ingrediente
        </Button>
      </fieldset>

      {/* Pasos */}
      <fieldset className="flex flex-col gap-3" disabled={generating}>
        <legend className="mb-1 text-sm font-medium">
          Pasos <span className="text-muted-foreground">(opcional)</span>
        </legend>
        <p className="mb-1 text-xs text-muted-foreground">
          Uno por paso, en orden, con las cantidades para {servingsLabel}. Si
          pegas una receta entera, cada línea se convierte en un paso.
        </p>
        <ol
          className="flex flex-col gap-3"
          {...aiProvenanceAttrs(stepsFromAi)}
        >
          {steps.map((step, index) => (
            <li
              key={step.key}
              className="flex flex-col gap-2 rounded-lg border p-3"
            >
              <div className="flex items-start gap-2">
                {/*
                  El número ES la etiqueta del campo: una etiqueta aparte diría
                  «Paso 3» pegada a un 3, y sin ella el campo se queda sin nombre
                  accesible. Lo que se oye es «Paso 3»; lo que se ve, el 3.
                */}
                <Label
                  htmlFor={`recipe-step-${step.key}`}
                  className="mt-2 flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground"
                >
                  <span className="sr-only">Paso </span>
                  {index + 1}
                </Label>
                <Textarea
                  id={`recipe-step-${step.key}`}
                  value={step.text}
                  onChange={(e) => patchStep(step.key, e.target.value)}
                  onPaste={(e) => handleStepPaste(step.key, e)}
                  maxLength={500}
                  className="min-h-20"
                  placeholder="p. ej. Sofríe la cebolla a fuego medio 5 minutos"
                />
              </div>
              <div className="flex gap-1">
                {/*
                  En los extremos van `aria-disabled` y NO `disabled`: con
                  `disabled`, subir un paso hasta el primer puesto apagaba el
                  botón que estabas pulsando en el mismo repintado, el foco se
                  caía a <body> y con teclado había que tabular desde el
                  principio del formulario. `moveStep` ya no hace nada en el
                  borde, así que el botón sigue ahí, anunciado como no
                  disponible, y el foco se queda contigo.
                */}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Subir el paso ${index + 1}`}
                  onClick={() => moveStep(index, -1)}
                  aria-disabled={index === 0}
                  className="aria-disabled:opacity-50"
                >
                  <ChevronUp aria-hidden />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Bajar el paso ${index + 1}`}
                  onClick={() => moveStep(index, 1)}
                  aria-disabled={index === steps.length - 1}
                  className="aria-disabled:opacity-50"
                >
                  <ChevronDown aria-hidden />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Quitar el paso ${index + 1}`}
                  onClick={() => removeStep(step.key)}
                  className="ml-auto"
                >
                  <Trash aria-hidden />
                </Button>
              </div>
            </li>
          ))}
        </ol>
        {/*
          Las dos formas de añadir pasos, en la misma fila y por orden de
          esfuerzo: a mano a la izquierda, con IA a la derecha. `flex-wrap` es la
          red de seguridad —si un día crecen las etiquetas o el usuario tiene el
          tipo de letra grande, el de IA baja debajo en vez de desbordar—.

          El de IA va con la firma de la app: `AiGenerateButton`, cuyo relleno
          late con `--ai-fill` (verde de marca → ámbar). Las etiquetas de los dos
          son cortas a propósito, porque comparten ancho: mientras genera, el
          mensaje de progreso SUSTITUYE a la etiqueta, así que una larga
          ensancharía el botón y partiría la fila a mitad de la espera.
        */}
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" onClick={addStep}>
            <Plus aria-hidden /> Añadir paso
          </Button>
          <AiGenerateButton
            ref={aiButtonRef}
            type="button"
            onClick={generateWithAi}
            loading={generating}
            disabled={pending}
            steps={RECIPE_GENERATION_STEPS}
            busyLabel="Escribiendo la receta con IA"
          >
            {hasSteps ? "Rehacer con IA" : "Escribir con IA"}
          </AiGenerateButton>
        </div>
        <p className="text-xs text-muted-foreground">
          La IA escribe los pasos y completa las cantidades que falten arriba,
          sin tocar los ingredientes que ya hayas puesto. Revísalo antes de
          guardar.
        </p>
      </fieldset>

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <div className="flex flex-col gap-2">
        {/*
          Guardar y eliminar se bloquean mientras la IA escribe: guardar a mitad
          dejaba una versión escrita y, un rato después, el borrador pisando el
          formulario con un «revísala antes de guardar» encima — con el usuario
          convencido de que eso ya lo había guardado.
        */}
        <Button
          type="submit"
          size="lg"
          loading={pending}
          disabled={generating}
        >
          {pending
            ? "Guardando…"
            : isEdit
              ? "Guardar cambios"
              : "Guardar receta"}
        </Button>
        {isEdit ? (
          <Button
            type="button"
            variant="destructive"
            onClick={() => setDeleteOpen(true)}
            disabled={pending || generating}
          >
            <Trash aria-hidden /> Eliminar receta
          </Button>
        ) : null}
        <Button
          type="button"
          variant="ghost"
          onClick={() => router.push("/recetas")}
          disabled={pending}
        >
          Cancelar
        </Button>
      </div>

      {isEdit ? (
        <ResponsiveModal open={deleteOpen} onOpenChange={setDeleteOpen}>
          <ResponsiveModalContent
            // En escritorio el foco inicial debe caer en la acción segura,
            // no en la destructiva (que es el primer focusable del DOM).
            onOpenAutoFocus={(event) => {
              event.preventDefault();
              document.getElementById("recipe-delete-cancel")?.focus();
            }}
          >
            <ResponsiveModalHeader>
              <ResponsiveModalTitle>¿Eliminar esta receta?</ResponsiveModalTitle>
              <ResponsiveModalDescription>
                Se quitará de tu recetario. Los menús que la usaran dejarán ese
                hueco vacío. Esta acción no se puede deshacer.
              </ResponsiveModalDescription>
            </ResponsiveModalHeader>
            <ResponsiveModalFooter className="gap-2">
              <Button
                type="button"
                variant="destructive"
                size="lg"
                onClick={handleDelete}
                loading={deleting}
              >
                {deleting ? "Eliminando…" : "Sí, eliminar"}
              </Button>
              <ResponsiveModalClose asChild>
                <Button id="recipe-delete-cancel" type="button" variant="ghost">
                  Cancelar
                </Button>
              </ResponsiveModalClose>
            </ResponsiveModalFooter>
          </ResponsiveModalContent>
        </ResponsiveModal>
      ) : null}

      {/*
        Puerta de consentimiento bajo demanda: se abre solo si la generación
        vuelve con `needsAiConsent`, y al aceptar reintenta lo que el usuario
        había pedido. Nunca coincide abierta con la de eliminar.
      */}
      <AiConsentModal
        open={aiConsentRetry !== null}
        onOpenChange={(open) => {
          if (!open) setAiConsentRetry(null);
        }}
        onAccepted={() => {
          const retry = aiConsentRetry;
          setAiConsentRetry(null);
          retry?.();
        }}
      />
    </form>
  );
}
