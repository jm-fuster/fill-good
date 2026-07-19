import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, Palette, Users } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const metadata: Metadata = { title: "Ajustes" };

export default function AjustesPage() {
  return (
    <>
      <PageHeader title="Ajustes" description="Tu hogar y tus preferencias." />
      <div className="flex flex-col gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="size-4" aria-hidden />
              Hogar
            </CardTitle>
            <CardDescription>
              Miembros y código de invitación (disponible en la Fase 1, con el
              inicio de sesión).
            </CardDescription>
          </CardHeader>
        </Card>

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
    </>
  );
}
