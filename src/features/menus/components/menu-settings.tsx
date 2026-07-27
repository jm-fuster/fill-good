"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { SlidersHorizontal } from "lucide-react";
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
import { Separator } from "@/components/ui/separator";
import type { SavedRecipe } from "@/features/recipes/queries";
import type { MenuPrefs, MenuRule } from "../queries";
import { saveMenuPrefsAction } from "../actions";
import { PrefsFields, toInput, toState, type FormState } from "./menu-prefs";
import { MenuRulesFields } from "./menu-rules";

/**
 * «Ajustes del menú»: único punto de entrada a todo lo que condiciona a la IA
 * —preferencias del hogar y reglas—, tras el icono que acompaña al botón de
 * generar. Antes eran dos secciones colapsables al final de /menus; juntas
 * sumaban dos cabeceras más y le robaban protagonismo al menú.
 *
 * Las reglas se guardan solas (cada toggle/alta/borrado es su propia acción);
 * el botón del pie solo confirma las preferencias.
 */
export function MenuSettings({
  prefs,
  rules,
  recipes,
}: {
  prefs: MenuPrefs;
  rules: MenuRule[];
  recipes: SavedRecipe[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<FormState>(toState(prefs));
  const [saving, startSave] = useTransition();

  // Al reabrir, partir de las preferencias del servidor (pueden haber cambiado
  // desde otro dispositivo, o el usuario editó sin guardar y cerró).
  const [lastOpen, setLastOpen] = useState(false);
  if (open !== lastOpen) {
    setLastOpen(open);
    if (open) setState(toState(prefs));
  }

  const activeRules = rules.filter((r) => r.active).length;

  function save() {
    startSave(async () => {
      const r = await saveMenuPrefsAction(toInput(state));
      if (r.error) {
        toast.error(r.error);
        return;
      }
      toast.success("Preferencias guardadas");
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <ResponsiveModal open={open} onOpenChange={setOpen}>
      <Button
        variant="outline"
        size="icon-lg"
        onClick={() => setOpen(true)}
        aria-label={
          activeRules > 0
            ? `Ajustes del menú (${activeRules} ${activeRules === 1 ? "regla activa" : "reglas activas"})`
            : "Ajustes del menú"
        }
      >
        <SlidersHorizontal aria-hidden />
      </Button>

      <ResponsiveModalContent>
        <ResponsiveModalHeader>
          <ResponsiveModalTitle>Ajustes del menú</ResponsiveModalTitle>
          <ResponsiveModalDescription>
            Lo que la IA tiene en cuenta al generar tus menús.
          </ResponsiveModalDescription>
        </ResponsiveModalHeader>

        <div className="flex flex-col gap-4 px-4">
          <PrefsFields state={state} onChange={setState} />
          <Separator />
          <MenuRulesFields rules={rules} recipes={recipes} />
        </div>

        <ResponsiveModalFooter className="gap-2">
          <Button type="button" size="lg" onClick={save} loading={saving}>
            {saving ? "Guardando…" : "Guardar preferencias"}
          </Button>
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
