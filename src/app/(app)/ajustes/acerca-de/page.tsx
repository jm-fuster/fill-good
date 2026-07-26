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
    <PageContainer variant="narrow">
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
            <CardDescription>
              Iconos de producto de estos proyectos.
            </CardDescription>
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
