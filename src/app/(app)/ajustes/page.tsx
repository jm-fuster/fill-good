import type { Metadata } from "next";
import Link from "next/link";
import { currentUser } from "@clerk/nextjs/server";
import { UserButton } from "@clerk/nextjs";
import { ChevronRight, Palette } from "lucide-react";

import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { ThemeToggle } from "@/components/theme-toggle";
import { BudgetCard } from "@/features/household/components/budget-card";
import { HouseholdCard } from "@/features/household/components/household-card";
import {
  getCurrentHousehold,
  getHouseholdMembers,
} from "@/features/household/queries";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const metadata: Metadata = { title: "Ajustes" };

export default async function AjustesPage() {
  const [user, household] = await Promise.all([
    currentUser(),
    getCurrentHousehold(),
  ]);
  const displayName =
    user?.firstName ??
    user?.fullName ??
    user?.primaryEmailAddress?.emailAddress ??
    "Tu cuenta";
  const email = user?.primaryEmailAddress?.emailAddress;
  const members = household ? await getHouseholdMembers(household.id) : [];

  return (
    <PageContainer variant="default">
      <PageHeader title="Ajustes" description="Tu hogar y tus preferencias." />
      <div className="flex flex-col gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Cuenta</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{displayName}</p>
              {email ? (
                <p className="truncate text-sm text-muted-foreground">{email}</p>
              ) : null}
            </div>
            <UserButton />
          </CardContent>
        </Card>

        {household ? (
          <HouseholdCard household={household} members={members} />
        ) : null}

        {household ? <BudgetCard budget={household.monthlyBudget} /> : null}

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Palette className="size-4" aria-hidden />
              Apariencia
            </CardTitle>
            <CardDescription>Tema claro, oscuro o automático.</CardDescription>
          </CardHeader>
          <CardContent className="flex items-center justify-between">
            <span className="text-sm">Tema de la aplicación</span>
            <ThemeToggle />
          </CardContent>
        </Card>

        <Link
          href="/styleguide"
          className="flex min-h-11 items-center justify-between rounded-xl border px-4 py-3 text-sm font-medium transition-colors hover:bg-muted"
        >
          Guía de estilo (desarrollo)
          <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
        </Link>
      </div>
    </PageContainer>
  );
}
