import type { Metadata } from "next";

import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { MenuSectionTabs } from "@/components/layout/menu-section-tabs";
import { MenuView } from "@/features/menus/components/menu-view";
import { MenuSettings } from "@/features/menus/components/menu-settings";
import { MenuShareActions } from "@/features/menus/components/menu-share-actions";
import { MenuPrefsOnboarding } from "@/features/menus/components/menu-prefs";
import {
  getMenuPrefs,
  getMenuRules,
  getPendingCheckinEntries,
  getWeekMenusWithEntries,
} from "@/features/menus/queries";
import { activeSlots } from "@/features/menus/slots";
import { assessWeekBudget } from "@/features/menus/week-budget";
import { getCurrentHousehold } from "@/features/household/queries";
import { getRecipeCostsForIds, getSavedRecipes } from "@/features/recipes/queries";
import { getWeekStart, shiftWeek } from "@/lib/dates";

export const metadata: Metadata = { title: "Menús" };

export default async function MenusPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  const sp = await searchParams;
  const weekStart =
    sp.week && /^\d{4}-\d{2}-\d{2}$/.test(sp.week)
      ? getWeekStart(new Date(`${sp.week}T00:00:00`))
      : getWeekStart();

  // Ambas semanas (visible y anterior) en una sola tanda; getMenuRules/recipes/
  // prefs van en paralelo. Antes: getWeekMenu → entradas → (si vacío) menú
  // anterior → sus entradas, hasta 5 tandas secuenciales.
  const prevWeekStart = shiftWeek(weekStart, -1);
  // `getCurrentHousehold` va en `cache()` y las otras queries ya lo llaman: es
  // gratis en este request y da el nombre del hogar para la hoja impresa.
  const [menusByWeek, rules, recipes, prefs, household, pendingCheckin] =
    await Promise.all([
      getWeekMenusWithEntries([weekStart, prevWeekStart]),
      getMenuRules(),
      getSavedRecipes(),
      getMenuPrefs(),
      getCurrentHousehold(),
      // Pendientes de repaso (R2): van en la misma tanda, no añaden latencia.
      // El rango cruza semanas, así que no se derivan de `entries`.
      getPendingCheckinEntries(),
    ]);
  const menu = menusByWeek.get(weekStart)?.menu ?? null;
  const entries = menusByWeek.get(weekStart)?.entries ?? [];
  const slots = activeSlots(prefs.planBreakfast);

  // "Copiar la semana anterior" (N5): solo si la visible está vacía y la
  // anterior tiene platos. Se decide en memoria con lo ya cargado.
  const canCopyPrevious =
    entries.length === 0 &&
    (menusByWeek.get(prevWeekStart)?.entries.length ?? 0) > 0;

  // Coste estimado de la semana (M7): suma de los platos con receta. Es parcial
  // si algún plato no tiene precio de todos sus ingredientes o no tiene receta.
  const recipeIds = entries
    .map((e) => e.recipeId)
    .filter((id): id is string => Boolean(id));
  const costMap = await getRecipeCostsForIds(recipeIds);
  let weekCostTotal = 0;
  let weekCostComplete = true;
  let weekCostAny = false;
  for (const e of entries) {
    if (!e.recipeId) {
      weekCostComplete = false; // texto libre: sin coste conocido
      continue;
    }
    const c = costMap.get(e.recipeId);
    if (c && c.pricedCount > 0) {
      weekCostTotal += c.total;
      weekCostAny = true;
      if (!c.complete) weekCostComplete = false;
    } else {
      weekCostComplete = false;
    }
  }
  const weekCost = weekCostAny
    ? { total: weekCostTotal, complete: weekCostComplete }
    : null;

  // La suma la hace la app, nunca la IA: el prompt lleva el objetivo como guía,
  // pero quien dice si la semana se pasa es esta cuenta, con los precios reales
  // del histórico. Solo avisa cuando se pasa; ver `week-budget.ts`.
  const budgetWarning = assessWeekBudget(
    weekCost,
    household?.monthlyBudget ?? null,
  );

  return (
    <PageContainer>
      {/* Al imprimir, la cabecera de la hoja la pone MenuView (D5). */}
      <div className="print:hidden">
        <PageHeader
          title="Menús"
          action={
            menu && entries.length > 0 ? (
              <MenuShareActions menuId={menu.id} />
            ) : undefined
          }
        />
      </div>
      <div className="flex flex-col gap-4">
        <div className="print:hidden">
          <MenuSectionTabs active="semana" />
        </div>
        <MenuView
          weekStart={weekStart}
          menuId={menu?.id ?? null}
          entries={entries}
          pendingCheckin={pendingCheckin}
          weekCost={weekCost}
          budgetWarning={budgetWarning}
          slots={slots}
          canCopyPrevious={canCopyPrevious}
          // El mismo recetario que usan las reglas: sirve al buscador del «+».
          recipes={recipes}
          householdName={household?.name ?? null}
          // Preferencias y reglas ya no son dos secciones al final de la página:
          // viajan con el botón de generar, que es lo que condicionan.
          settingsSlot={
            <MenuSettings prefs={prefs} rules={rules} recipes={recipes} />
          }
        />
      </div>
      {!prefs.configured ? <MenuPrefsOnboarding /> : null}
    </PageContainer>
  );
}
