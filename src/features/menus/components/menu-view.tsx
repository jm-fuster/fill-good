"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  BookmarkPlus,
  Check,
  ChefHat,
  ChevronLeft,
  ChevronRight,
  Plus,
  Sparkles,
} from "lucide-react";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getWeekDays, shiftWeek } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { saveGeneratedRecipeAction } from "@/features/recipes/actions";
import type { MenuEntry } from "../queries";
import {
  addMissingToListAction,
  generateMenuAction,
  setMenuEntryAction,
  toggleEntryCookedAction,
} from "../actions";

/** ISO local (YYYY-MM-DD) de hoy, para comparar con la fecha de la entrada. */
function todayISO(): string {
  return format(new Date(), "yyyy-MM-dd");
}

const SLOTS = [
  { key: "lunch", label: "Comida" },
  { key: "dinner", label: "Cena" },
] as const;

export function MenuView({
  weekStart,
  menuId,
  entries,
}: {
  weekStart: string;
  menuId: string | null;
  entries: MenuEntry[];
}) {
  const router = useRouter();
  const [generating, startGenerate] = useTransition();
  const [addingList, startAddList] = useTransition();
  const [editing, setEditing] = useState<{
    entryId: string | null;
    date: string;
    slot: string;
    label: string;
    current: string;
    recipeId: string | null;
    canSaveToRecipes: boolean;
    cookedAt: string | null;
  } | null>(null);

  const days = getWeekDays(weekStart);
  const byKey = new Map(entries.map((e) => [`${e.date}|${e.slot}`, e]));
  const hasRecipes = entries.some((e) => e.recipeId);

  function generate() {
    startGenerate(async () => {
      const r = await generateMenuAction(weekStart);
      if (r.error) toast.error(r.error);
      else {
        toast.success("Menú generado");
        router.refresh();
      }
    });
  }

  function addMissing() {
    if (!menuId) return;
    startAddList(async () => {
      const r = await addMissingToListAction(menuId);
      if (r.error) toast.error(r.error);
      else if (r.added === 0) toast.info("Ya tienes todos los ingredientes");
      else toast.success(`${r.added} ingredientes añadidos a la lista`);
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="icon" asChild aria-label="Semana anterior">
          <Link href={`/menus?week=${shiftWeek(weekStart, -1)}`}>
            <ChevronLeft aria-hidden />
          </Link>
        </Button>
        <p className="text-sm font-medium">
          Semana del{" "}
          {format(parseISO(weekStart), "d 'de' MMMM", { locale: es })}
        </p>
        <Button variant="ghost" size="icon" asChild aria-label="Semana siguiente">
          <Link href={`/menus?week=${shiftWeek(weekStart, 1)}`}>
            <ChevronRight aria-hidden />
          </Link>
        </Button>
      </div>

      <Button onClick={generate} disabled={generating} size="lg">
        <Sparkles aria-hidden />
        {generating ? "Generando menú…" : "Generar menú con IA"}
      </Button>

      <div className="flex flex-col gap-3">
        {days.map((date) => (
          <div key={date} className="rounded-xl border p-3">
            <p className="mb-2 text-sm font-semibold capitalize">
              {format(parseISO(date), "EEEE d", { locale: es })}
            </p>
            <div className="grid grid-cols-2 gap-2">
              {SLOTS.map((slot) => {
                const entry = byKey.get(`${date}|${slot.key}`);
                const text = entry?.recipeName ?? entry?.freeText ?? null;
                return (
                  <button
                    key={slot.key}
                    type="button"
                    onClick={() =>
                      setEditing({
                        entryId: entry?.id ?? null,
                        date,
                        slot: slot.key,
                        label: `${slot.label} · ${format(parseISO(date), "EEEE", { locale: es })}`,
                        current: text ?? "",
                        recipeId: entry?.recipeId ?? null,
                        canSaveToRecipes: Boolean(
                          entry?.recipeId && entry.recipeIsSaved === false,
                        ),
                        cookedAt: entry?.cookedAt ?? null,
                      })
                    }
                    className={cn(
                      "flex min-h-16 flex-col gap-1 rounded-lg border border-dashed p-2 text-left text-sm transition-colors hover:bg-muted",
                      text && "border-solid",
                    )}
                  >
                    <span className="text-xs font-medium text-muted-foreground">
                      {slot.label}
                    </span>
                    {text ? (
                      <span className="line-clamp-2">{text}</span>
                    ) : (
                      <span className="flex items-center gap-1 text-muted-foreground">
                        <Plus className="size-3.5" aria-hidden /> Añadir
                      </span>
                    )}
                  </button>
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
          onClick={addMissing}
          disabled={addingList}
        >
          {addingList ? "Añadiendo…" : "Añadir a la lista lo que falte"}
        </Button>
      ) : null}

      <EditEntryDrawer
        editing={editing}
        weekStart={weekStart}
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
      />
    </div>
  );
}

function EditEntryDrawer({
  editing,
  weekStart,
  onClose,
  onSaved,
  onCookedChange,
}: {
  editing: {
    entryId: string | null;
    date: string;
    slot: string;
    label: string;
    current: string;
    recipeId: string | null;
    canSaveToRecipes: boolean;
    cookedAt: string | null;
  } | null;
  weekStart: string;
  onClose: () => void;
  onSaved: () => void;
  onCookedChange: (cookedAt: string | null) => void;
}) {
  const [value, setValue] = useState("");
  const [pending, startTransition] = useTransition();
  const [savingRecipe, startSaveRecipe] = useTransition();
  const [cooking, startCooking] = useTransition();

  const cooked = Boolean(editing?.cookedAt);
  // "Lo cocinamos" solo tiene sentido en entradas ya guardadas y de hoy/pasado.
  const canMarkCooked = Boolean(
    editing?.entryId && editing.date <= todayISO(),
  );

  // Sincroniza el input al abrir con una entrada distinta.
  const [lastKey, setLastKey] = useState<string | null>(null);
  const key = editing ? `${editing.date}|${editing.slot}` : null;
  if (key !== lastKey) {
    setLastKey(key);
    setValue(editing?.current ?? "");
  }

  function save(text: string) {
    if (!editing) return;
    startTransition(async () => {
      const r = await setMenuEntryAction(
        weekStart,
        editing.date,
        editing.slot,
        text,
      );
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
    startCooking(async () => {
      const r = await toggleEntryCookedAction(editing.entryId!, next);
      if (r.error) toast.error(r.error);
      else {
        toast.success(next ? "Marcado como cocinado" : "Ya no está cocinado");
        onCookedChange(next ? editing.date : null);
      }
    });
  }

  return (
    <Drawer open={editing !== null} onOpenChange={(o) => !o && onClose()}>
      <DrawerContent>
        <div className="mx-auto w-full max-w-md">
          <DrawerHeader>
            <DrawerTitle className="capitalize">{editing?.label}</DrawerTitle>
            <DrawerDescription>¿Qué toca ese día?</DrawerDescription>
          </DrawerHeader>
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
            <DrawerFooter className="gap-2 px-0">
              <Button type="submit" size="lg" disabled={pending}>
                {pending ? "Guardando…" : "Guardar"}
              </Button>
              {canMarkCooked ? (
                <Button
                  type="button"
                  variant={cooked ? "secondary" : "outline"}
                  onClick={toggleCooked}
                  disabled={cooking}
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
              {editing?.canSaveToRecipes ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={saveToRecipes}
                  disabled={savingRecipe}
                >
                  <BookmarkPlus aria-hidden />
                  {savingRecipe ? "Guardando…" : "Guardar en mi recetario"}
                </Button>
              ) : null}
              {editing?.current ? (
                <Button
                  type="button"
                  variant="destructive"
                  onClick={() => save("")}
                  disabled={pending}
                >
                  Quitar del menú
                </Button>
              ) : null}
              <DrawerClose asChild>
                <Button type="button" variant="ghost">
                  Cancelar
                </Button>
              </DrawerClose>
            </DrawerFooter>
          </form>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
