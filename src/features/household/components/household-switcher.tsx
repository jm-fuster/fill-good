"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { ArrowLeftRight, Check, House, HousePlus } from "lucide-react";
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

  function switchTo(householdId: string) {
    startTransition(async () => {
      // Éxito: la acción fija la cookie y redirige a /inventario.
      const result = await switchHouseholdAction(householdId);
      if (result?.error) toast.error(result.error);
    });
  }

  return { pending, switchTo };
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
  const { pending, switchTo } = useSwitchHousehold();

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
        <ResponsiveModalHeader>
          <ResponsiveModalTitle>Cambiar de hogar</ResponsiveModalTitle>
          <ResponsiveModalDescription>
            El inventario, la lista y los menús que ves son los del hogar
            activo.
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
                onClick={() => {
                  if (isActive) {
                    setOpen(false);
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
        </div>
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
