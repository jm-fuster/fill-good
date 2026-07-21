"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

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
import { UNIT_OPTIONS } from "@/lib/units";
import type { UnitType } from "@/lib/supabase/types";
import type { RecipeForEdit, MealTypeValue, SeasonValue } from "../queries";
import type { RecipeInput } from "../schemas";
import { MEAL_TYPE_OPTIONS, SEASON_OPTIONS, seasonsToChoice } from "../constants";
import {
  createRecipeAction,
  deleteRecipeAction,
  updateRecipeAction,
} from "../actions";

type IngredientRow = {
  key: number;
  name: string;
  quantity: string;
  unit: string; // "none" o UnitType
  optional: boolean;
};

const NO_UNIT = "none";

function emptyRow(key: number): IngredientRow {
  return { key, name: "", quantity: "", unit: NO_UNIT, optional: false };
}

export function RecipeForm({ recipe }: { recipe?: RecipeForEdit }) {
  const router = useRouter();
  const isEdit = Boolean(recipe);

  const [name, setName] = useState(recipe?.name ?? "");
  const [description, setDescription] = useState(recipe?.description ?? "");
  const [servings, setServings] = useState(String(recipe?.servings ?? 2));
  const [prepMinutes, setPrepMinutes] = useState(
    recipe?.prepMinutes != null ? String(recipe.prepMinutes) : "",
  );
  const [instructions, setInstructions] = useState(recipe?.instructions ?? "");
  const [mealTypes, setMealTypes] = useState<MealTypeValue[]>(
    (recipe?.mealTypes ?? ["lunch"]).filter(
      (m): m is MealTypeValue => m === "lunch" || m === "dinner",
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
        }))
      : [emptyRow(0)];
  const [rows, setRows] = useState<IngredientRow[]>(initialRows);
  const nextKey = useRef(initialRows.length);

  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

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

  function buildInput(): RecipeInput {
    return {
      name: name.trim(),
      description: description.trim() || null,
      servings: Number(servings) || 2,
      prepMinutes: prepMinutes.trim() ? Number(prepMinutes) : null,
      mealTypes,
      seasons: [season],
      instructions: instructions.trim() || null,
      ingredients: rows
        .filter((r) => r.name.trim())
        .map((r) => ({
          name: r.name.trim(),
          quantity: r.quantity.trim()
            ? Number(r.quantity.replace(",", "."))
            : null,
          unit: r.unit === NO_UNIT ? null : (r.unit as UnitType),
          optional: r.optional,
        })),
    };
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError("Escribe el nombre de la receta.");
      return;
    }
    if (mealTypes.length === 0) {
      setError("Marca si es para comida, cena o ambas.");
      return;
    }

    setPending(true);
    const input = buildInput();
    const result =
      recipe != null
        ? await updateRecipeAction(recipe.id, input)
        : await createRecipeAction(input);
    setPending(false);

    if (result.error) {
      setError(result.error);
      return;
    }
    toast.success(isEdit ? "Receta actualizada" : "Receta guardada");
    router.push("/recetas");
    router.refresh();
  }

  async function handleDelete() {
    if (!recipe) return;
    setDeleting(true);
    const result = await deleteRecipeAction(recipe.id);
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
          Puedes marcar comida, cena o ambas.
        </p>
        <div className="flex gap-2">
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

      {/* Ingredientes */}
      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1 text-sm font-medium">Ingredientes</legend>
        <ul className="flex flex-col gap-3">
          {rows.map((row) => (
            <li
              key={row.key}
              className="flex flex-col gap-2 rounded-lg border p-3"
            >
              <div className="flex items-start gap-2">
                <Input
                  value={row.name}
                  onChange={(e) => patchRow(row.key, { name: e.target.value })}
                  maxLength={120}
                  autoComplete="off"
                  aria-label="Nombre del ingrediente"
                  placeholder="Ingrediente"
                  className="flex-1"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Quitar ingrediente"
                  onClick={() => removeRow(row.key)}
                >
                  <Trash2 aria-hidden />
                </Button>
              </div>
              <div className="flex items-center gap-2">
                <Input
                  value={row.quantity}
                  onChange={(e) =>
                    patchRow(row.key, { quantity: e.target.value })
                  }
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="any"
                  aria-label="Cantidad"
                  placeholder="Cant."
                  className="w-24"
                />
                <Select
                  value={row.unit}
                  onValueChange={(v) => patchRow(row.key, { unit: v })}
                >
                  <SelectTrigger
                    aria-label="Unidad"
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
                <Label
                  className="ml-auto flex items-center gap-2 text-sm font-normal text-muted-foreground"
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
          ))}
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

      {/* Instrucciones */}
      <div className="flex flex-col gap-2">
        <Label htmlFor="recipe-instructions">
          Instrucciones <span className="text-muted-foreground">(opcional)</span>
        </Label>
        <Textarea
          id="recipe-instructions"
          value={instructions}
          onChange={(e) => setInstructions(e.target.value)}
          maxLength={4000}
          className="min-h-32"
          placeholder="Pasos de preparación"
        />
      </div>

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <div className="flex flex-col gap-2">
        <Button type="submit" size="lg" disabled={pending}>
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
            disabled={pending}
          >
            <Trash2 aria-hidden /> Eliminar receta
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
                disabled={deleting}
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
    </form>
  );
}
