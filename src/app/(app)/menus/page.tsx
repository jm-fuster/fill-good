import type { Metadata } from "next";

import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { MenuSectionTabs } from "@/components/layout/menu-section-tabs";
import { MenuView } from "@/features/menus/components/menu-view";
import { MenuRules } from "@/features/menus/components/menu-rules";
import { getMenuEntries, getMenuRules, getWeekMenu } from "@/features/menus/queries";
import { getRecipeCostsForIds, getSavedRecipes } from "@/features/recipes/queries";
import { getWeekStart } from "@/lib/dates";

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

  const menu = await getWeekMenu(weekStart);
  const [entries, rules, recipes] = await Promise.all([
    menu ? getMenuEntries(menu.id) : Promise.resolve([]),
    getMenuRules(),
    getSavedRecipes(),
  ]);

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
        />
        <div className="print:hidden">
          <MenuRules rules={rules} recipes={recipes} />
        </div>
      </div>
    </PageContainer>
  );
}
