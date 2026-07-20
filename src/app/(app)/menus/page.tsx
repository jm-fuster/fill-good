import type { Metadata } from "next";
import Link from "next/link";
import { BookOpen } from "lucide-react";

import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/layout/page-header";
import { MenuView } from "@/features/menus/components/menu-view";
import { getMenuEntries, getWeekMenu } from "@/features/menus/queries";
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
  const entries = menu ? await getMenuEntries(menu.id) : [];

  return (
    <>
      <PageHeader
        title="Menús"
        description="Planifica la semana con lo que tienes en casa."
        action={
          <Button asChild variant="outline">
            <Link href="/recetas">
              <BookOpen aria-hidden /> Mis recetas
            </Link>
          </Button>
        }
      />
      <MenuView
        weekStart={weekStart}
        menuId={menu?.id ?? null}
        entries={entries}
      />
    </>
  );
}
