import type { Metadata } from "next";
import Link from "next/link";
import { currentUser } from "@clerk/nextjs/server";
import { UserButton } from "@clerk/nextjs";
import { ChevronRight, Info, ListOrdered, Palette } from "lucide-react";

import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { ThemeToggle } from "@/components/theme-toggle";
import { BudgetCard } from "@/features/household/components/budget-card";
import { HouseholdCard } from "@/features/household/components/household-card";
import { PushCard } from "@/features/push/components/push-card";
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

        <PushCard />

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
          href="/ajustes/orden-tienda"
          className="flex min-h-11 items-center gap-3 rounded-xl border px-4 py-3 text-sm font-medium transition-colors hover:bg-muted"
        >
          <ListOrdered className="size-4 text-muted-foreground" aria-hidden />
          <span className="flex-1">
            Orden de la tienda
            <span className="block text-xs font-normal text-muted-foreground">
              Ordena los pasillos según tu supermercado
            </span>
          </span>
          <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
        </Link>

        {process.env.NODE_ENV !== "production" ? (
          <Link
            href="/styleguide"
            className="flex min-h-11 items-center justify-between rounded-xl border px-4 py-3 text-sm font-medium transition-colors hover:bg-muted"
          >
            Guía de estilo (desarrollo)
            <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
          </Link>
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Info className="size-4" aria-hidden />
              Créditos
            </CardTitle>
            <CardDescription>Iconos de producto de estos proyectos.</CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            <ul className="flex flex-col gap-1">
              <li>
                <a
                  href="https://github.com/microsoft/fluentui-emoji"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline underline-offset-4 hover:text-foreground"
                >
                  Fluent Emoji
                </a>{" "}
                de Microsoft (licencia MIT).
              </li>
              <li>
                <a
                  href="https://game-icons.net"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline underline-offset-4 hover:text-foreground"
                >
                  Game-icons.net
                </a>{" "}
                y sus autores (licencia{" "}
                <a
                  href="https://creativecommons.org/licenses/by/3.0/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline underline-offset-4 hover:text-foreground"
                >
                  CC BY 3.0
                </a>
                ).
              </li>
            </ul>
          </CardContent>
        </Card>
      </div>
    </PageContainer>
  );
}
