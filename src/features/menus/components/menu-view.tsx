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

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import type { MissingCandidate } from "../missing";
import {
  addMenuEntryAction,
  computeMissingForMenuAction,
  confirmMissingToListAction,
  generateMenuAction,
  removeMenuEntryAction,
  toggleEntryCookedAction,
  updateMenuEntryAction,
} from "../actions";

/** ISO local (YYYY-MM-DD) de hoy, para comparar con la fecha de la entrada. */
function todayISO(): string {
  return format(new Date(), "yyyy-MM-dd");
}

const SLOTS = [
  { key: "lunch", label: "Comida" },
  { key: "dinner", label: "Cena" },
] as const;

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
};

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
  const [editing, setEditing] = useState<Editing | null>(null);
  const [missing, setMissing] = useState<MissingCandidate[] | null>(null);

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

  function openAdd(date: string, slot: (typeof SLOTS)[number]) {
    setEditing({
      entryId: null,
      date,
      slot: slot.key,
      label: `${slot.label} · ${format(parseISO(date), "EEEE", { locale: es })}`,
      current: "",
      recipeId: null,
      canSaveToRecipes: false,
      cookedAt: null,
    });
  }

  function openEdit(
    date: string,
    slot: (typeof SLOTS)[number],
    entry: MenuEntry,
  ) {
    setEditing({
      entryId: entry.id,
      date,
      slot: slot.key,
      label: `${slot.label} · ${format(parseISO(date), "EEEE", { locale: es })}`,
      current: entry.recipeName ?? entry.freeText ?? "",
      recipeId: entry.recipeId,
      canSaveToRecipes: Boolean(entry.recipeId && entry.recipeIsSaved === false),
      cookedAt: entry.cookedAt,
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
            <div className="grid grid-cols-2 items-start gap-2">
              {SLOTS.map((slot) => {
                const slotEntries = bySlot.get(`${date}|${slot.key}`) ?? [];
                return (
                  <div key={slot.key} className="flex flex-col gap-1.5">
                    <span className="text-xs font-medium text-muted-foreground">
                      {slot.label}
                    </span>
                    {slotEntries.map((entry) => {
                      const text = entry.recipeName ?? entry.freeText ?? "";
                      return (
                        <button
                          key={entry.id}
                          type="button"
                          onClick={() => openEdit(date, slot, entry)}
                          className="flex min-h-11 items-start gap-1.5 rounded-lg border p-2 text-left text-sm transition-colors hover:bg-muted"
                        >
                          {entry.cookedAt ? (
                            <Check
                              className="mt-0.5 size-3.5 shrink-0 text-success"
                              aria-label="Cocinado"
                            />
                          ) : null}
                          <span className="line-clamp-2">{text}</span>
                        </button>
                      );
                    })}
                    <button
                      type="button"
                      onClick={() => openAdd(date, slot)}
                      className={cn(
                        "flex min-h-11 items-center gap-1 rounded-lg border border-dashed p-2 text-left text-sm text-muted-foreground transition-colors hover:bg-muted",
                      )}
                    >
                      <Plus className="size-3.5" aria-hidden /> Añadir plato
                    </button>
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
          disabled={addingList}
        >
          {addingList ? "Calculando…" : "Añadir a la lista lo que falte"}
        </Button>
      ) : null}

      <MissingReviewDrawer
        menuId={menuId}
        candidates={missing}
        onClose={() => setMissing(null)}
      />

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
  editing: Editing | null;
  weekStart: string;
  onClose: () => void;
  onSaved: () => void;
  onCookedChange: (cookedAt: string | null) => void;
}) {
  const [value, setValue] = useState("");
  const [pending, startTransition] = useTransition();
  const [savingRecipe, startSaveRecipe] = useTransition();
  const [cooking, startCooking] = useTransition();

  const isNew = editing?.entryId == null;
  const cooked = Boolean(editing?.cookedAt);
  // "Lo cocinamos" solo tiene sentido en entradas ya guardadas y de hoy/pasado.
  const canMarkCooked = Boolean(editing?.entryId && editing.date <= todayISO());

  // Sincroniza el input al abrir con un plato distinto (o al pasar a "añadir").
  const [lastKey, setLastKey] = useState<string | null>(null);
  const key = editing
    ? (editing.entryId ?? `add:${editing.date}|${editing.slot}`)
    : null;
  if (key !== lastKey) {
    setLastKey(key);
    setValue(editing?.current ?? "");
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
            <DrawerDescription>
              {isNew ? "Añade un plato a este hueco." : "Edita o quita este plato."}
            </DrawerDescription>
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
              <Button
                type="submit"
                size="lg"
                disabled={pending || !value.trim()}
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
              {!isNew ? (
                <Button
                  type="button"
                  variant="destructive"
                  onClick={remove}
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
    <Drawer open={candidates !== null} onOpenChange={(o) => !o && onClose()}>
      <DrawerContent>
        <div className="mx-auto flex w-full max-w-md flex-col">
          <DrawerHeader>
            <DrawerTitle>Añadir a la lista</DrawerTitle>
            <DrawerDescription>
              Revisa lo que falta para el menú. Desmarca lo que no quieras.
            </DrawerDescription>
          </DrawerHeader>

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

          <DrawerFooter className="gap-2">
            <Button
              type="button"
              size="lg"
              onClick={confirm}
              disabled={pending || count === 0}
            >
              <Check aria-hidden />
              {pending
                ? "Añadiendo…"
                : count === 1
                  ? "Añadir 1 a la lista"
                  : `Añadir ${count} a la lista`}
            </Button>
            <DrawerClose asChild>
              <Button type="button" variant="ghost">
                Cancelar
              </Button>
            </DrawerClose>
          </DrawerFooter>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
