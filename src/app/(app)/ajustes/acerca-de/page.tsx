import type { Metadata } from "next";
import { FileText, Shield } from "lucide-react";

import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import {
  SettingsGroup,
  SettingsLinkRow,
} from "@/features/settings/components/settings-list";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const metadata: Metadata = { title: "Acerca de" };

export default function AcercaDePage() {
  return (
    <PageContainer>
      <PageHeader
        title="Acerca de Fill Good"
        description="Compra lo justo, ahorra más."
        backHref="/ajustes"
        backLabel="Ajustes"
      />
      <div className="flex flex-col gap-6">
        <SettingsGroup title="Legal">
          <SettingsLinkRow
            href="/privacidad"
            icon={Shield}
            label="Política de privacidad"
          />
          <SettingsLinkRow
            href="/terminos"
            icon={FileText}
            label="Términos de uso"
          />
        </SettingsGroup>

        <Card>
          <CardHeader>
            <CardTitle>Créditos</CardTitle>
            <CardDescription>De dónde salen los iconos de producto.</CardDescription>
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
                de Microsoft, variante Flat (licencia MIT).
              </li>
              <li>
                Seis iconos (calabaza, col, puerro, espárragos, remolacha y
                cerillas) están dibujados para Fill Good, porque no existen a
                color en ninguna librería abierta.
              </li>
            </ul>
          </CardContent>
        </Card>
      </div>
    </PageContainer>
  );
}
