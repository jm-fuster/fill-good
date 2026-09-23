"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, SlidersHorizontal } from "lucide-react";
import { toast } from "sonner";

import { safeAction } from "@/lib/action-error";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
 *
 * Con `onReplaceAll` el icono deja de abrir los ajustes de un toque y abre un
 * menú con las dos acciones. Es un toque más para los ajustes, y se acepta:
 * ambas son cosas de configurar una vez, y a cambio la pantalla se queda sin las
 * dos líneas de texto que «Rehacer todo desde cero» arrastraba bajo el botón de
 * generar.
 *
 * Estado del panel (abierto + borrador de preferencias), guardado en `MenuView`,
 * que no se remonta. El botón va dentro del bloque de generar, que la vista
 * coloca arriba o abajo de la semana según queden huecos libres; activar una
 * regla de «no planificar este hueco» cambia esa cuenta, el bloque cambia de
 * sitio y React lo remonta. Con el panel dentro, se cerraba a mitad de edición
 * y se perdía lo no guardado; por eso el botón y el panel van por separado.
 */
export function useMenuSettingsState(prefs: MenuPrefs) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<FormState>(toState(prefs));
  // Al reabrir, partir de las preferencias del servidor (pueden haber cambiado
  // desde otro dispositivo, o el usuario editó sin guardar y cerró).
  const [lastOpen, setLastOpen] = useState(false);
  if (open !== lastOpen) {
    setLastOpen(open);
    if (open) setState(toState(prefs));
  }
  return { open, setOpen, state, setState };
}

export type MenuSettingsState = ReturnType<typeof useMenuSettingsState>;

/**
 * El BOTÓN de los ajustes (y el desplegable con «rehacer todo»). Puede cambiar
 * de sitio con el bloque de generar; el panel no: vive aparte, en
 * `MenuSettingsPanel`, montado en un sitio fijo de `MenuView`. Remontar un
 * ResponsiveModal abierto no solo perdía el borrador: su desmontaje consume la
 * entrada del historial, y ese «atrás» le llega al modal nuevo, que se cierra.
 */
export function MenuSettings({
  rules,
  onReplaceAll,
  settings,
}: {
  rules: MenuRule[];
  /** Ver `useMenuSettingsState`: lo crea y lo guarda `MenuView`. */
  settings: Pick<MenuSettingsState, "setOpen">;
  /**
   * Abre la confirmación de «rehacer la semana entera», que sigue viviendo en
   * `MenuView` (allí está `generate`). Solo llega cuando hay algo que la
   * regeneración respetuosa conservaría; si no, no hay nada que rehacer y el
   * icono se queda como un botón normal.
   *
   * El disparador tiene que ser este menú y NO una fila dentro del panel de
   * ajustes: un ResponsiveModal que abre otro se cierra solo (el cierre por
   * historial), y el desplegable no toca el historial.
   */
  onReplaceAll?: () => void;
}) {
  const { setOpen } = settings;
  const activeRules = rules.filter((r) => r.active).length;

  const rulesSuffix =
    activeRules > 0
      ? ` (${activeRules} ${activeRules === 1 ? "regla activa" : "reglas activas"})`
      : "";
  // Sin `onClick` cuando es disparador del menú: ahí lo pone Radix vía `asChild`.
  const trigger = (
    <Button
      variant="outline"
      size="icon-lg"
      onClick={onReplaceAll ? undefined : () => setOpen(true)}
      aria-label={
        (onReplaceAll ? "Ajustes y acciones del menú" : "Ajustes del menú") +
        rulesSuffix
      }
    >
      <SlidersHorizontal aria-hidden />
    </Button>
  );

  return onReplaceAll ? (
    // `modal={false}`: sin bloqueo de puntero en el body, que es lo que se
    // enreda cuando de aquí sale un bottom sheet.
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuItem onSelect={() => setOpen(true)}>
          <SlidersHorizontal aria-hidden />
          Ajustes del menú
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {/* El subtítulo es lo que antes decía la línea de debajo del botón
            («completar respeta tus platos fijados y manuales»), dicho en el
            único sitio donde hace falta: al elegir entre las dos. */}
        <DropdownMenuItem variant="destructive" onSelect={onReplaceAll}>
          <RefreshCw aria-hidden />
          <span className="min-w-0 flex-1">
            <span className="block">Rehacer todo desde cero</span>
            {/* Token semántico y no `opacity` sobre el rojo: bajarle la
                opacidad al `destructive` lo acerca al fondo del popover y
                ahí ya no está medido el contraste. */}
            <span className="block text-xs text-muted-foreground">
              Borra también tus platos fijados y manuales
            </span>
          </span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  ) : (
    trigger
  );
}

/** El panel de ajustes, montado en un sitio fijo (ver `MenuSettings`). */
export function MenuSettingsPanel({
  prefs,
  rules,
  recipes,
  settings,
}: {
  prefs: MenuPrefs;
  rules: MenuRule[];
  recipes: SavedRecipe[];
  settings: MenuSettingsState;
}) {
  const router = useRouter();
  const { open, setOpen, state, setState } = settings;
  const [saving, startSave] = useTransition();

  function save() {
    startSave(async () => {
      const r = await safeAction(
        saveMenuPrefsAction(toInput(state)),
        "No se pudieron guardar las preferencias.",
      );
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
          {/*
            Los huecos que se ofrecen salen de las preferencias GUARDADAS, no de
            las que se estén editando arriba: las reglas se guardan solas y no
            deben depender de un desayuno que aún no se ha confirmado.
          */}
          <MenuRulesFields
            rules={rules}
            recipes={recipes}
            planBreakfast={prefs.planBreakfast}
          />
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
