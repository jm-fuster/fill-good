"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ListChecks, Plus, Trash2 } from "lucide-react";
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
import { cn } from "@/lib/utils";
import type { SavedRecipe } from "@/features/recipes/queries";
import type { MenuRule } from "../queries";
import type { MenuRuleInput } from "../schemas";
import {
  createRuleAction,
  deleteRuleAction,
  toggleRuleAction,
} from "../actions";

/** Frase legible de una regla para la lista. */
function describeRule(rule: MenuRule): string {
  if (rule.kind === "free_text") return rule.textRule ?? "";
  const name = rule.recipeName ?? "Receta";
  const freq = rule.kind === "recipe_min_week" ? "al menos" : "como mucho";
  const times = rule.value === 1 ? "vez" : "veces";
  return `${name} · ${freq} ${rule.value} ${times}/semana`;
}

type FreqBound = "recipe_min_week" | "recipe_max_week";
type Mode = "recipe" | "free_text";

export function MenuRules({
  rules,
  recipes,
}: {
  rules: MenuRule[];
  recipes: SavedRecipe[];
}) {
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);

  const activeCount = rules.filter((r) => r.active).length;

  return (
    <section className="rounded-xl border">
      <h2>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls="menu-rules-body"
          className="flex min-h-11 w-full items-center gap-2 p-3 text-left"
        >
          <ListChecks className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          <span className="font-medium">Reglas del menú</span>
          {activeCount > 0 ? (
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
              {activeCount} {activeCount === 1 ? "activa" : "activas"}
            </span>
          ) : null}
          <ChevronDown
            className={cn(
              "ml-auto size-4 shrink-0 text-muted-foreground transition-transform",
              open && "rotate-180",
            )}
            aria-hidden
          />
        </button>
      </h2>

      {open ? (
        <div id="menu-rules-body" className="flex flex-col gap-3 px-3 pb-3">
          <p className="text-xs text-muted-foreground">
            Condicionan cómo se genera el menú con IA: cada cuánto quieres una
            receta o instrucciones libres.
          </p>

          {rules.length === 0 ? (
            <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
              Aún no hay reglas. Añade la primera para guiar tus menús.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {rules.map((rule) => (
                <RuleRow key={rule.id} rule={rule} />
              ))}
            </ul>
          )}

          <Button
            type="button"
            variant="outline"
            onClick={() => setAdding(true)}
            className="self-start"
          >
            <Plus aria-hidden /> Añadir regla
          </Button>
        </div>
      ) : null}

      <AddRuleDrawer
        open={adding}
        recipes={recipes}
        onOpenChange={setAdding}
      />
    </section>
  );
}

function RuleRow({ rule }: { rule: MenuRule }) {
  const router = useRouter();
  const [toggling, startToggle] = useTransition();
  const [deleting, startDelete] = useTransition();

  const label = describeRule(rule);

  function toggle(active: boolean) {
    startToggle(async () => {
      const r = await toggleRuleAction(rule.id, active);
      if (r.error) toast.error(r.error);
      else router.refresh();
    });
  }

  function remove() {
    startDelete(async () => {
      const r = await deleteRuleAction(rule.id);
      if (r.error) toast.error(r.error);
      else {
        toast.success("Regla eliminada");
        router.refresh();
      }
    });
  }

  return (
    <li className="flex items-center gap-2 rounded-lg border p-2">
      <Switch
        checked={rule.active}
        onCheckedChange={toggle}
        disabled={toggling}
        aria-label={
          rule.active ? `Desactivar regla: ${label}` : `Activar regla: ${label}`
        }
      />
      <span
        className={cn(
          "flex-1 text-sm text-balance",
          !rule.active && "text-muted-foreground line-through",
        )}
      >
        {label}
      </span>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={remove}
        disabled={deleting}
        aria-label={`Borrar regla: ${label}`}
      >
        <Trash2 aria-hidden />
      </Button>
    </li>
  );
}

function AddRuleDrawer({
  open,
  recipes,
  onOpenChange,
}: {
  open: boolean;
  recipes: SavedRecipe[];
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [mode, setMode] = useState<Mode>("recipe");
  const [recipeId, setRecipeId] = useState("");
  const [bound, setBound] = useState<FreqBound>("recipe_min_week");
  const [times, setTimes] = useState("1");
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);

  const noRecipes = recipes.length === 0;

  function reset() {
    setMode(noRecipes ? "free_text" : "recipe");
    setRecipeId("");
    setBound("recipe_min_week");
    setTimes("1");
    setText("");
    setError(null);
  }

  function handleOpenChange(next: boolean) {
    if (next) reset();
    onOpenChange(next);
  }

  function submit() {
    setError(null);
    let input: MenuRuleInput;
    if (mode === "free_text") {
      const trimmed = text.trim();
      if (!trimmed) {
        setError("Escribe la regla.");
        return;
      }
      input = { kind: "free_text", textRule: trimmed };
    } else {
      if (!recipeId) {
        setError("Elige una receta.");
        return;
      }
      const value = Number(times);
      if (!Number.isInteger(value) || value < 1 || value > 7) {
        setError("Indica entre 1 y 7 veces por semana.");
        return;
      }
      input = { kind: bound, recipeId, value };
    }

    startTransition(async () => {
      const r = await createRuleAction(input);
      if (r.error) {
        setError(r.error);
        return;
      }
      toast.success("Regla añadida");
      onOpenChange(false);
      router.refresh();
    });
  }

  return (
    <ResponsiveModal open={open} onOpenChange={handleOpenChange}>
      <ResponsiveModalContent>
        <ResponsiveModalHeader>
          <ResponsiveModalTitle>Nueva regla del menú</ResponsiveModalTitle>
          <ResponsiveModalDescription>
            Elige la frecuencia de una receta o escribe una instrucción libre.
          </ResponsiveModalDescription>
        </ResponsiveModalHeader>

        <div className="flex flex-col gap-4 px-4">
          {/* Selector de modo */}
          <div role="group" aria-label="Tipo de regla" className="flex gap-2">
            <Button
              type="button"
              variant={mode === "recipe" ? "default" : "outline"}
              aria-pressed={mode === "recipe"}
              onClick={() => setMode("recipe")}
              disabled={noRecipes}
              className="flex-1"
            >
              Frecuencia de receta
            </Button>
            <Button
              type="button"
              variant={mode === "free_text" ? "default" : "outline"}
              aria-pressed={mode === "free_text"}
              onClick={() => setMode("free_text")}
              className="flex-1"
            >
              Regla libre
            </Button>
          </div>

          {mode === "recipe" ? (
            noRecipes ? (
              <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
                Guarda alguna receta en tu recetario para crear reglas de
                frecuencia.
              </p>
            ) : (
              <>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="rule-recipe">Receta</Label>
                  <Select value={recipeId} onValueChange={setRecipeId}>
                    <SelectTrigger id="rule-recipe">
                      <SelectValue placeholder="Elige una receta" />
                    </SelectTrigger>
                    <SelectContent>
                      {recipes.map((r) => (
                        <SelectItem key={r.id} value={r.id}>
                          {r.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <fieldset className="flex flex-col gap-2">
                  <legend className="mb-1 text-sm font-medium">
                    Frecuencia
                  </legend>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant={
                        bound === "recipe_min_week" ? "default" : "outline"
                      }
                      aria-pressed={bound === "recipe_min_week"}
                      onClick={() => setBound("recipe_min_week")}
                      className="flex-1"
                    >
                      Al menos
                    </Button>
                    <Button
                      type="button"
                      variant={
                        bound === "recipe_max_week" ? "default" : "outline"
                      }
                      aria-pressed={bound === "recipe_max_week"}
                      onClick={() => setBound("recipe_max_week")}
                      className="flex-1"
                    >
                      Como mucho
                    </Button>
                  </div>
                </fieldset>

                <div className="flex flex-col gap-2">
                  <Label htmlFor="rule-times">Veces por semana</Label>
                  <Input
                    id="rule-times"
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={7}
                    step={1}
                    value={times}
                    onChange={(e) => setTimes(e.target.value)}
                    className="w-24"
                  />
                </div>
              </>
            )
          ) : (
            <div className="flex flex-col gap-2">
              <Label htmlFor="rule-text">Regla</Label>
              <Textarea
                id="rule-text"
                value={text}
                onChange={(e) => setText(e.target.value)}
                maxLength={300}
                placeholder="p. ej. Los viernes cena de picoteo"
              />
            </div>
          )}

          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
        </div>

        <ResponsiveModalFooter className="gap-2">
          <Button
            type="button"
            size="lg"
            onClick={submit}
            disabled={pending || (mode === "recipe" && noRecipes)}
          >
            {pending ? "Guardando…" : "Añadir regla"}
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
