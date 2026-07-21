import type { Metadata } from "next";

import { PageHeader } from "@/components/layout/page-header";
import { MenuSectionTabs } from "@/components/layout/menu-section-tabs";
import { MenuView } from "@/features/menus/components/menu-view";
import { MenuRules } from "@/features/menus/components/menu-rules";
import { getMenuEntries, getMenuRules, getWeekMenu } from "@/features/menus/queries";
import { getSavedRecipes } from "@/features/recipes/queries";
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

  return (
    <>
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
        />
        <div className="print:hidden">
          <MenuRules rules={rules} recipes={recipes} />
        </div>
      </div>
    </>
  );
}
