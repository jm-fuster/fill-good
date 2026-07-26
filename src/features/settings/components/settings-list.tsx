import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Piezas del índice de Ajustes: grupos con título y filas de altura táctil, al
 * estilo de los ajustes del sistema. La pantalla raíz es una lista escaneable y
 * lo denso (hogar, notificaciones, créditos) vive en subpáginas.
 *
 * Sin `"use client"` a propósito: el índice es un Server Component (usa
 * `SettingsLinkRow`/`SettingsControlRow`) y las filas con `onClick`
 * (`SettingsButtonRow`) se importan desde componentes cliente, que las
 * arrastran al bundle de cliente sin necesidad de marcar el módulo entero.
 *
 * El contenedor NO lleva `overflow-hidden` (a diferencia de Card): el foco
 * global es `outline` con `outline-offset`, y recortarlo dejaría las filas sin
 * foco visible. Las esquinas se redondean fila a fila con `first:`/`last:`.
 */

const ROW_BASE =
  "flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left text-sm font-medium first:rounded-t-xl last:rounded-b-xl";
const ROW_INTERACTIVE = "transition-colors hover:bg-muted";

export function SettingsGroup({
  title,
  children,
  className,
}: {
  title?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("flex flex-col gap-2", className)}>
      {title ? (
        <h2 className="px-1 text-sm font-medium text-muted-foreground">
          {title}
        </h2>
      ) : null}
      <div className="divide-y rounded-xl bg-card ring-1 ring-foreground/10">
        {children}
      </div>
    </section>
  );
}

type RowContent = {
  icon?: LucideIcon;
  label: string;
  /** Segunda línea explicativa; opcional para no engordar las filas obvias. */
  hint?: string;
  /** Estado actual a la derecha ("Activadas", "400,00 €"…). */
  value?: React.ReactNode;
  destructive?: boolean;
};

function RowBody({ icon: Icon, label, hint, value, destructive }: RowContent) {
  return (
    <>
      {Icon ? (
        <Icon
          className={cn(
            "size-5 shrink-0",
            destructive ? "text-destructive" : "text-muted-foreground",
          )}
          aria-hidden
        />
      ) : null}
      <span className="min-w-0 flex-1">
        <span className={cn("block truncate", destructive && "text-destructive")}>
          {label}
        </span>
        {hint ? (
          <span className="block text-xs font-normal text-pretty text-muted-foreground">
            {hint}
          </span>
        ) : null}
      </span>
      {value ? (
        <span className="shrink-0 text-sm font-normal text-muted-foreground">
          {value}
        </span>
      ) : null}
    </>
  );
}

/** Fila que navega a una subpágina. */
export function SettingsLinkRow({
  href,
  ...content
}: RowContent & { href: string }) {
  return (
    <Link href={href} className={cn(ROW_BASE, ROW_INTERACTIVE)}>
      <RowBody {...content} />
      <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
    </Link>
  );
}

/** Fila que dispara una acción del cliente (abrir un modal, cerrar sesión…). */
export function SettingsButtonRow({
  onClick,
  disabled,
  ...content
}: RowContent & { onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(ROW_BASE, ROW_INTERACTIVE, "disabled:opacity-50")}
    >
      <RowBody {...content} />
    </button>
  );
}

/** Fila con un control propio a la derecha (toggle de tema, switch…). */
export function SettingsControlRow({
  control,
  ...content
}: RowContent & { control: React.ReactNode }) {
  return (
    <div className={ROW_BASE}>
      <RowBody {...content} />
      <div className="shrink-0">{control}</div>
    </div>
  );
}
