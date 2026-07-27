"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import {
  ArrowLeftRight,
  Check,
  ChevronsUpDown,
  House,
  HousePlus,
} from "lucide-react";
import { toast } from "sonner";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ResponsiveModal,
  ResponsiveModalContent,
  ResponsiveModalDescription,
  ResponsiveModalHeader,
  ResponsiveModalTitle,
} from "@/components/ui/responsive-modal";
import { Button } from "@/components/ui/button";
import { SettingsButtonRow } from "@/features/settings/components/settings-list";
import { cn } from "@/lib/utils";
import type { MemberRole } from "@/lib/supabase/types";

import { switchHouseholdAction } from "../actions";

export type SwitcherHousehold = {
  id: string;
  name: string;
  role: MemberRole;
};

function roleLabel(role: MemberRole) {
  return role === "owner" ? "Propietario" : "Miembro";
}

function useSwitchHousehold() {
  const [pending, startTransition] = useTransition();
  // Qué hogar se pulsó: el spinner va solo en esa fila, no en toda la lista.
  const [targetId, setTargetId] = useState<string | null>(null);

  function switchTo(householdId: string) {
    setTargetId(householdId);
    startTransition(async () => {
      // Éxito: la acción fija la cookie y redirige a /inventario.
      const result = await switchHouseholdAction(householdId);
      if (result?.error) toast.error(result.error);
    });
  }

  return { pending, targetId, switchTo };
}

/**
 * Cuerpo del modal de cambio de hogar. En fichero compartido porque lo abren dos
 * disparadores distintos (la fila de Ajustes y la línea de /perfil) y la lista
 * tiene que ofrecer exactamente las mismas opciones desde ambos.
 */
function HouseholdSwitcherModalBody({
  households,
  activeId,
  onDone,
  showCreateLink,
}: {
  households: SwitcherHousehold[];
  activeId: string;
  onDone: () => void;
  showCreateLink?: boolean;
}) {
  const { pending, targetId, switchTo } = useSwitchHousehold();

  return (
    <>
      <ResponsiveModalHeader>
        <ResponsiveModalTitle>Cambiar de hogar</ResponsiveModalTitle>
        <ResponsiveModalDescription>
          El inventario, la lista y los menús que ves son los del hogar activo.
        </ResponsiveModalDescription>
      </ResponsiveModalHeader>
      <div className="flex flex-col gap-1 p-4 pt-0">
        {households.map((h) => {
          const isActive = h.id === activeId;
          return (
            <Button
              key={h.id}
              variant={isActive ? "secondary" : "ghost"}
              disabled={pending}
              loading={pending && targetId === h.id}
              onClick={() => {
                if (isActive) {
                  onDone();
                  return;
                }
                switchTo(h.id);
              }}
              className="h-auto min-h-12 justify-start"
            >
              <House aria-hidden />
              <span className="min-w-0 flex-1 text-left">
                <span className="block truncate">{h.name}</span>
                <span className="block text-xs font-normal text-muted-foreground">
                  {roleLabel(h.role)}
                </span>
              </span>
              {isActive ? (
                <>
                  <Check aria-hidden />
                  <span className="sr-only">(hogar activo)</span>
                </>
              ) : null}
            </Button>
          );
        })}
        {showCreateLink ? (
          <Button
            asChild
            variant="ghost"
            disabled={pending}
            className="h-auto min-h-12 justify-start text-muted-foreground"
          >
            <Link href="/ajustes/hogar/nuevo">
              <HousePlus aria-hidden />
              Crear o unirse a otro hogar
            </Link>
          </Button>
        ) : null}
      </div>
    </>
  );
}

/**
 * Fila de Ajustes para alternar entre hogares (solo se renderiza con más de
 * uno). Abre un ResponsiveModal (regla E11) con la lista; elegir uno distinto
 * del activo lo convierte en el hogar activo y lleva a su inventario.
 */
export function HouseholdSwitcherRow({
  households,
  activeId,
}: {
  households: SwitcherHousehold[];
  activeId: string;
}) {
  const [open, setOpen] = useState(false);

  if (households.length < 2) return null;

  return (
    <ResponsiveModal open={open} onOpenChange={setOpen}>
      <SettingsButtonRow
        icon={ArrowLeftRight}
        label="Cambiar de hogar"
        hint="Alterna entre tus hogares"
        value={`${households.length} hogares`}
        onClick={() => setOpen(true)}
      />
      <ResponsiveModalContent>
        {/* Sin enlace de "crear o unirse": en Ajustes ya hay una fila propia
            para eso dos posiciones más abajo. */}
        <HouseholdSwitcherModalBody
          households={households}
          activeId={activeId}
          onDone={() => setOpen(false)}
        />
      </ResponsiveModalContent>
    </ResponsiveModal>
  );
}

/**
 * Línea de hogar de /perfil ("Casa de Jorge"), pulsable para cambiar de hogar
 * sin pasar por Ajustes. En móvil era el único camino: el desplegable de
 * hogares vive en el header de escritorio, que está oculto en `< md`.
 *
 * Con un solo hogar degrada a texto plano en vez de desaparecer: la línea es la
 * descripción de la cabecera, y perderla dejaría el nombre del usuario suelto
 * sin decir de qué hogar se está hablando.
 */
export function HouseholdSwitcherInline({
  households,
  activeId,
  label,
}: {
  households: SwitcherHousehold[];
  activeId: string;
  /** Texto completo de la línea, p. ej. "Casa de Jorge". */
  label: string;
}) {
  const [open, setOpen] = useState(false);

  if (households.length < 2) {
    return <span className="text-sm text-muted-foreground">{label}</span>;
  }

  return (
    <ResponsiveModal open={open} onOpenChange={setOpen}>
      <button
        type="button"
        onClick={() => setOpen(true)}
        // -mx-2 px-2: el área táctil se ensancha hacia los lados sin desalinear
        // el texto respecto al título que tiene encima.
        className="-mx-2 -my-1 inline-flex min-h-11 items-center gap-1 rounded-lg px-2 py-1 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        <span className="truncate">{label}</span>
        <ChevronsUpDown className="size-3.5 shrink-0" aria-hidden />
        <span className="sr-only">(cambiar de hogar)</span>
      </button>
      <ResponsiveModalContent>
        <HouseholdSwitcherModalBody
          households={households}
          activeId={activeId}
          onDone={() => setOpen(false)}
          showCreateLink
        />
      </ResponsiveModalContent>
    </ResponsiveModal>
  );
}

/**
 * Selector compacto para el header de escritorio (el header ya es
 * `hidden md:flex`, así que no hace falta ocultarlo aquí). Muestra el hogar
 * activo y permite cambiarlo sin pasar por Ajustes; con un solo hogar no
 * aporta nada y no se renderiza.
 */
export function HouseholdSwitcherMenu({
  households,
  activeId,
}: {
  households: SwitcherHousehold[];
  activeId: string;
}) {
  const { pending, switchTo } = useSwitchHousehold();

  if (households.length < 2) return null;

  const active = households.find((h) => h.id === activeId);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          disabled={pending}
          className={cn("max-w-56 font-normal", pending && "opacity-70")}
        >
          <House aria-hidden className="text-muted-foreground" />
          <span className="truncate">{active?.name ?? "Hogar"}</span>
          <span className="sr-only">(hogar activo; cambiar de hogar)</span>
        </Button>
      </DropdownMenuTrigger>
      {/* Anclado al borde derecho del header: alinear el menú por el final. */}
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuRadioGroup
          value={activeId}
          onValueChange={(id) => {
            if (id !== activeId) switchTo(id);
          }}
        >
          {households.map((h) => (
            <DropdownMenuRadioItem key={h.id} value={h.id}>
              <span className="min-w-0 flex-1">
                <span className="block truncate">{h.name}</span>
                <span className="block text-xs text-muted-foreground">
                  {roleLabel(h.role)}
                </span>
              </span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/ajustes/hogar/nuevo">
            <HousePlus aria-hidden />
            Crear o unirse a otro hogar
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
