import type { Metadata } from "next";
import { currentUser } from "@clerk/nextjs/server";
import { UserButton } from "@clerk/nextjs";
import { Home, HousePlus, Info, ListOrdered, Palette } from "lucide-react";

import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { ThemeToggle } from "@/components/theme-toggle";
import { DeleteAccountRow } from "@/features/account/components/delete-account-row";
import { LogoutRow } from "@/features/account/components/logout-row";
import { BudgetRow } from "@/features/household/components/budget-row";
import { HouseholdSwitcherRow } from "@/features/household/components/household-switcher";
import { PushStatusRow } from "@/features/push/components/push-status-row";
import {
  SettingsControlRow,
  SettingsGroup,
  SettingsLinkRow,
} from "@/features/settings/components/settings-list";
import {
  getCurrentHousehold,
  getHouseholdMembers,
  getUserHouseholds,
} from "@/features/household/queries";

export const metadata: Metadata = { title: "Ajustes" };

/**
 * Índice de Ajustes: lista escaneable de grupos, con lo denso en subpáginas
 * (/hogar, /notificaciones, /orden-tienda, /acerca-de). Solo se queda inline lo
 * que se resuelve de un toque (tema) o en un modal corto (objetivo de gasto).
 */
export default async function AjustesPage() {
  const [user, household, households] = await Promise.all([
    currentUser(),
    getCurrentHousehold(),
    getUserHouseholds(),
  ]);
  const email = user?.primaryEmailAddress?.emailAddress;
  const members = household ? await getHouseholdMembers(household.id) : [];
  // Mismo orden de preferencia que /perfil (el nombre del hogar manda): son la
  // misma persona y verse con dos nombres según la pantalla resulta inquietante.
  const displayName =
    members.find((m) => m.isCurrentUser)?.displayName ??
    user?.firstName ??
    user?.fullName ??
    email ??
    "Tu cuenta";

  return (
    <PageContainer>
      {/* Ajustes ya no tiene pestaña propia: cuelga del engranaje de /perfil, así
          que en móvil este enlace es la única salida hacia atrás. */}
      <PageHeader
        title="Ajustes"
        description="Tu hogar y tus preferencias."
        backHref="/perfil"
        backLabel="Perfil"
      />
      <div className="flex flex-col gap-6">
        <div className="flex min-h-14 items-center justify-between gap-3 rounded-xl bg-card px-4 py-3 ring-1 ring-foreground/10">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{displayName}</p>
            {email ? (
              <p className="truncate text-sm text-muted-foreground">{email}</p>
            ) : null}
          </div>
          <UserButton />
        </div>

        {household ? (
          <SettingsGroup title="Hogar">
            <SettingsLinkRow
              href="/ajustes/hogar"
              icon={Home}
              label={household.name}
              hint="Invitaciones, miembros y propiedad"
              value={
                members.length === 1 ? "1 miembro" : `${members.length} miembros`
              }
            />
            <HouseholdSwitcherRow
              households={households.map((h) => ({
                id: h.id,
                name: h.name,
                role: h.role,
              }))}
              activeId={household.id}
            />
            <BudgetRow budget={household.monthlyBudget} />
            <SettingsLinkRow
              href="/ajustes/orden-tienda"
              icon={ListOrdered}
              label="Orden de la tienda"
              hint="Ordena los pasillos según tu supermercado"
            />
            <SettingsLinkRow
              href="/ajustes/hogar/nuevo"
              icon={HousePlus}
              label="Crear o unirse a otro hogar"
              hint="Una segunda residencia, la casa de vacaciones…"
            />
          </SettingsGroup>
        ) : null}

        <SettingsGroup title="Preferencias">
          <PushStatusRow />
          <SettingsControlRow
            icon={Palette}
            label="Tema"
            hint="Claro, oscuro o automático"
            control={<ThemeToggle />}
          />
        </SettingsGroup>

        <SettingsGroup title="Información">
          <SettingsLinkRow
            href="/ajustes/acerca-de"
            icon={Info}
            label="Acerca de Fill Good"
            hint="Créditos y textos legales"
          />
        </SettingsGroup>

        <SettingsGroup title="Cuenta">
          <LogoutRow />
          <DeleteAccountRow />
        </SettingsGroup>
      </div>
    </PageContainer>
  );
}
