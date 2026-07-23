import type { Metadata } from "next";

import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { MenuSectionTabs } from "@/components/layout/menu-section-tabs";
import { MenuView } from "@/features/menus/components/menu-view";
import { MenuRules } from "@/features/menus/components/menu-rules";
import {
  MenuPrefs,
  MenuPrefsOnboarding,
} from "@/features/menus/components/menu-prefs";
import {
  getMenuPrefs,
  getMenuRules,
  getWeekMenusWithEntries,
} from "@/features/menus/queries";
import { activeSlots } from "@/features/menus/slots";
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
  const [menusByWeek, rules, recipes, prefs] = await Promise.all([
    getWeekMenusWithEntries([weekStart, prevWeekStart]),
    getMenuRules(),
    getSavedRecipes(),
    getMenuPrefs(),
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

  return (
    <PageContainer variant="wide">
      <PageHeader
        title="Menús"
        description="Planifica la semana con lo que tienes en casa."
      />
      <div className="flex flex-col gap-4">
        <div className="print:hidden">
          <MenuSectionTabs active="semana" />
        </div>
        <MenuView
          weekStart={weekStart}
          menuId={menu?.id ?? null}
          entries={entries}
          weekCost={weekCost}
          slots={slots}
          canCopyPrevious={canCopyPrevious}
        />
        <div className="flex flex-col gap-4 print:hidden">
          <MenuPrefs prefs={prefs} />
          <MenuRules rules={rules} recipes={recipes} />
        </div>
      </div>
      {!prefs.configured ? <MenuPrefsOnboarding /> : null}
    </PageContainer>
  );
}
