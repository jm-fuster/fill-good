import type { Metadata } from "next";
import { currentUser } from "@clerk/nextjs/server";
import { UserButton } from "@clerk/nextjs";
import { Home, Info, ListOrdered, Palette, Store } from "lucide-react";

import { AlexaIcon } from "@/components/icons/alexa-icon";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { ThemeToggle } from "@/components/theme-toggle";
import { getAlexaLinks } from "@/features/alexa/queries";
import { DeleteAccountRow } from "@/features/account/components/delete-account-row";
import { ExportDataRow } from "@/features/account/components/export-data-row";
import { LogoutRow } from "@/features/account/components/logout-row";
import { AiConsentSettingRow } from "@/features/ai-consent/components/ai-consent-setting-row";
import { getAiConsent } from "@/features/ai-consent/queries";
import { BudgetRow } from "@/features/household/components/budget-row";
import { PantryReviewSettingRow } from "@/features/inventory/components/pantry-review-setting-row";
import { getPantryReviewPrefs } from "@/features/inventory/queries";
import { PushStatusRow } from "@/features/push/components/push-status-row";
import { UsageOptOutRow } from "@/features/usage/components/usage-opt-out-row";
import { getUsageOptOut } from "@/features/usage/queries";
import {
  SettingsControlRow,
  SettingsGroup,
  SettingsLinkRow,
} from "@/features/settings/components/settings-list";
import {
  getCurrentHousehold,
  getHouseholdChains,
  getHouseholdMembers,
  type HouseholdChains,
} from "@/features/household/queries";

export const metadata: Metadata = { title: "Ajustes" };

/**
 * Estado de "Tus supermercados" en una palabra. Deducidas de los tickets se
 * anuncian como tal: enseñar "2 tiendas" cuando el hogar no ha elegido nada
 * haría creer que ya lo configuró.
 */
function storeChainsValue({ chains, source }: HouseholdChains): string {
  if (chains.length === 0) return "Sin definir";
  if (source === "receipts") return "Según tus tickets";
  return chains.length === 1 ? "1 tienda" : `${chains.length} tiendas`;
}

/**
 * Estado de la vinculación con Alexa. «Sin vincular» y no «0 altavoces»: la fila
 * la lee alguien que quizá no sabe todavía que esto se puede vincular.
 */
function alexaValue(count: number): string {
  if (count === 0) return "Sin vincular";
  return count === 1 ? "1 altavoz" : `${count} altavoces`;
}

/**
 * Índice de Ajustes: lista escaneable de grupos, con lo denso en subpáginas
 * (/hogar, /notificaciones, /orden-tienda, /acerca-de). Solo se queda inline lo
 * que se resuelve de un toque (tema) o en un modal corto (objetivo de gasto).
 */
export default async function AjustesPage() {
  const [user, household, aiConsent, pantryReview, usageOptOut] =
    await Promise.all([
      currentUser(),
      getCurrentHousehold(),
      getAiConsent(),
      getPantryReviewPrefs(),
      getUsageOptOut(),
    ]);
  const email = user?.primaryEmailAddress?.emailAddress;
  const [members, storeChains, alexaLinks] = household
    ? await Promise.all([
        getHouseholdMembers(household.id),
        getHouseholdChains(),
        getAlexaLinks(household.id),
      ])
    : [[], { chains: [], source: "manual" as const }, []];
  const alexaLinkCount = alexaLinks.length;
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
          {/*
            Sin la sección de borrar cuenta de Clerk: borraría el usuario sin
            pasar por `delete_account()`, y quedaría su fila de propietario en
            el hogar (nadie podría gestionarlo), su vínculo de Alexa vivo y sus
            datos sin borrar, contra lo que promete /privacidad. Borrar la
            cuenta es la fila de abajo, que sí limpia. La sección solo sale si la
            instancia de Clerk permite el auto-borrado (lo hace por defecto); con
            el ajuste apagado en el dashboard, esto no cambia nada. Su «Cerrar
            sesión» lo cubre `SessionEndCleanup` en el layout raíz.
          */}
          <UserButton
            userProfileProps={{
              appearance: {
                elements: { profileSection__danger: { display: "none" } },
              },
            }}
          />
        </div>

        {household ? (
          <SettingsGroup title="Hogar">
            <SettingsLinkRow
              href="/ajustes/hogar"
              icon={Home}
              label={household.name}
              hint="Invitaciones, miembros y cambio de hogar"
              value={
                members.length === 1 ? "1 miembro" : `${members.length} miembros`
              }
            />
            <BudgetRow
              householdId={household.id}
              budget={household.monthlyBudget}
            />
            <SettingsLinkRow
              href="/ajustes/tiendas"
              icon={Store}
              label="Tus supermercados"
              hint="Dónde soléis comprar"
              value={storeChainsValue(storeChains)}
            />
            <SettingsLinkRow
              href="/ajustes/orden-tienda"
              icon={ListOrdered}
              label="Orden de la tienda"
              hint="Ordena los pasillos según tu supermercado"
            />
          </SettingsGroup>
        ) : null}

        <SettingsGroup title="Preferencias">
          <PushStatusRow />
          {household ? (
            <SettingsLinkRow
              href="/ajustes/alexa"
              icon={AlexaIcon}
              label="Alexa"
              hint="Maneja el inventario y la lista por voz"
              value={alexaValue(alexaLinkCount)}
            />
          ) : null}
          <AiConsentSettingRow consented={aiConsent.consented} />
          <UsageOptOutRow optedOut={usageOptOut} />
          {household ? (
            <PantryReviewSettingRow enabled={pantryReview.enabled} />
          ) : null}
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
          <ExportDataRow />
          <LogoutRow />
          <DeleteAccountRow />
        </SettingsGroup>
      </div>
    </PageContainer>
  );
}
