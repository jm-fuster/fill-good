"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  ResponsiveModal,
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
import { cn } from "@/lib/utils";
import type { DietStyle, MenuGoal, MenuPrefs } from "../queries";
import type { MenuPrefsInput } from "../schemas";
import { saveMenuPrefsAction } from "../actions";

const GOAL_OPTIONS: { value: MenuGoal; label: string; hint: string }[] = [
  { value: "balanced", label: "Equilibrado", hint: "Variado y sano" },
  { value: "light", label: "Ligero", hint: "Platos y cenas suaves" },
  { value: "muscle", label: "Proteico", hint: "Más proteína en cada plato" },
  { value: "gain", label: "Energético", hint: "Raciones contundentes" },
];

const DIET_OPTIONS: { value: DietStyle; label: string }[] = [
  { value: "omnivore", label: "De todo" },
  { value: "vegetarian", label: "Vegetariano" },
  { value: "vegan", label: "Vegano" },
  { value: "gluten_free", label: "Sin gluten" },
];

export type FormState = {
  goal: MenuGoal;
  dietStyle: DietStyle;
  avoidText: string;
  servings: string;
  planBreakfast: boolean;
  checkinEnabled: boolean;
};

/** Defaults del formulario (el onboarding parte de aquí). */
const DEFAULT_FORM: FormState = {
  goal: "balanced",
  dietStyle: "omnivore",
  avoidText: "",
  servings: "2",
  planBreakfast: false,
  checkinEnabled: true,
};

export function toState(prefs: MenuPrefs): FormState {
  return {
    goal: prefs.goal,
    dietStyle: prefs.dietStyle,
    avoidText: prefs.avoidText ?? "",
    servings: String(prefs.servings),
    planBreakfast: prefs.planBreakfast,
    checkinEnabled: prefs.checkinEnabled,
  };
}

export function toInput(s: FormState): MenuPrefsInput {
  return {
    goal: s.goal,
    dietStyle: s.dietStyle,
    avoidText: s.avoidText.trim() || undefined,
    servings: Number(s.servings),
    planBreakfast: s.planBreakfast,
    checkinEnabled: s.checkinEnabled,
  };
}

/** Campos compartidos por el onboarding y «Ajustes del menú». */
export function PrefsFields({
  state,
  onChange,
}: {
  state: FormState;
  onChange: (next: FormState) => void;
}) {
  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    onChange({ ...state, [key]: value });

  return (
    <div className="flex flex-col gap-4">
      {/* Objetivo (radio-cards) */}
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium">Objetivo del menú</legend>
        <div className="grid grid-cols-2 gap-2">
          {GOAL_OPTIONS.map((opt) => {
            const active = state.goal === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                aria-pressed={active}
                onClick={() => set("goal", opt.value)}
                className={cn(
                  "flex min-h-11 flex-col items-start gap-0.5 rounded-lg border p-3 text-left transition-colors",
                  active
                    ? "border-primary bg-primary/5 ring-1 ring-primary"
                    : "hover:bg-muted",
                )}
              >
                <span className="text-sm font-medium">{opt.label}</span>
                <span className="text-xs text-muted-foreground">{opt.hint}</span>
              </button>
            );
          })}
        </div>
      </fieldset>

      {/* Estilo de dieta */}
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium">Estilo de dieta</legend>
        <div className="grid grid-cols-2 gap-2">
          {DIET_OPTIONS.map((opt) => {
            const active = state.dietStyle === opt.value;
            return (
              <Button
                key={opt.value}
                type="button"
                variant={active ? "default" : "outline"}
                aria-pressed={active}
                onClick={() => set("dietStyle", opt.value)}
              >
                {opt.label}
              </Button>
            );
          })}
        </div>
      </fieldset>

      {/* Raciones */}
      <div className="flex flex-col gap-2">
        <Label htmlFor="prefs-servings">Raciones por plato</Label>
        <Input
          id="prefs-servings"
          type="number"
          inputMode="numeric"
          min={1}
          max={12}
          step={1}
          value={state.servings}
          onChange={(e) => set("servings", e.target.value)}
          className="w-24"
        />
      </div>

      {/* Desayuno */}
      <div className="flex items-center justify-between gap-3">
        <Label htmlFor="prefs-breakfast" className="flex-1">
          Planificar también el desayuno
        </Label>
        <Switch
          id="prefs-breakfast"
          checked={state.planBreakfast}
          onCheckedChange={(v) => set("planBreakfast", v)}
        />
      </div>

      {/*
        Repaso de platos pasados (R3). El apagador vive aquí y NO en Ajustes >
        Notificaciones: esa página promete avisos en el dispositivo sin abrir la
        app y guarda sus preferencias por suscripción push; esto es una
        preferencia del hogar sobre lo que ocurre DENTRO de la app.
      */}
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between gap-3">
          <Label htmlFor="prefs-checkin" className="flex-1">
            Repaso de platos pasados
          </Label>
          <Switch
            id="prefs-checkin"
            checked={state.checkinEnabled}
            onCheckedChange={(v) => set("checkinEnabled", v)}
          />
        </div>
        <p className="text-xs text-muted-foreground">
          Te preguntamos si llegaste a cocinar lo planificado cuando vuelvas a la
          app. Marcar un plato como cocinado descuenta sus ingredientes del
          inventario.
        </p>
      </div>

      {/* Evitar ingredientes */}
      <div className="flex flex-col gap-2">
        <Label htmlFor="prefs-avoid">Evitar ingredientes</Label>
        <Textarea
          id="prefs-avoid"
          value={state.avoidText}
          onChange={(e) => set("avoidText", e.target.value)}
          maxLength={300}
          placeholder="p. ej. cilantro, marisco, hígado"
        />
        <p className="text-xs text-muted-foreground">
          Es una preferencia para los menús generados, no una garantía frente a
          alergias o intolerancias.
        </p>
      </div>
    </div>
  );
}

/**
 * Onboarding de 1 pantalla, saltable (N3). Se muestra al entrar a /menus sin
 * fila de preferencias. "Ahora no" crea la fila con defaults y no vuelve a
 * aparecer; nunca bloquea la generación.
 */
export function MenuPrefsOnboarding() {
  const router = useRouter();
  const [open, setOpen] = useState(true);
  const [state, setState] = useState<FormState>(DEFAULT_FORM);
  const [saving, startSave] = useTransition();

  function save(input: MenuPrefsInput, done: string) {
    startSave(async () => {
      const r = await saveMenuPrefsAction(input);
      if (r.error) {
        toast.error(r.error);
        return;
      }
      toast.success(done);
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <ResponsiveModal open={open} onOpenChange={setOpen}>
      <ResponsiveModalContent>
        <ResponsiveModalHeader>
          <ResponsiveModalTitle>Configura tu menú</ResponsiveModalTitle>
          <ResponsiveModalDescription>
            Cuéntanos qué busca tu hogar y la IA lo tendrá en cuenta al generar
            los menús. Podrás cambiarlo cuando quieras.
          </ResponsiveModalDescription>
        </ResponsiveModalHeader>

        <div className="max-h-[65vh] overflow-y-auto px-4">
          <PrefsFields state={state} onChange={setState} />
        </div>

        <ResponsiveModalFooter className="gap-2">
          <Button
            type="button"
            size="lg"
            onClick={() => save(toInput(state), "Preferencias guardadas")}
            loading={saving}
          >
            {saving ? "Guardando…" : "Guardar preferencias"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => save(toInput(DEFAULT_FORM), "Listo")}
            disabled={saving}
          >
            Ahora no
          </Button>
        </ResponsiveModalFooter>
      </ResponsiveModalContent>
    </ResponsiveModal>
  );
}
