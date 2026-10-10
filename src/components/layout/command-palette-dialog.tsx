"use client";

import { useRouter } from "next/navigation";
import {
  BookOpen,
  CalendarDays,
  ChartLine,
  CircleUser,
  Package,
  Plus,
  RotateCcwClock,
  ScanLine,
  Settings,
  ShoppingCart,
  Sparkles,
  Store,
  type LucideIcon,
} from "lucide-react";

import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";

type PaletteItem = { label: string; href: string; icon: LucideIcon };

/** Secciones navegables. */
const NAV: readonly PaletteItem[] = [
  { label: "Inventario", href: "/inventario", icon: Package },
  { label: "Lista de la compra", href: "/lista", icon: ShoppingCart },
  { label: "Menús", href: "/menus", icon: CalendarDays },
  { label: "Mis recetas", href: "/recetas", icon: BookOpen },
  { label: "Perfil", href: "/perfil", icon: CircleUser },
  { label: "Precios", href: "/precios", icon: ChartLine },
  { label: "Resumen del mes", href: "/resumen", icon: Sparkles },
  { label: "Historial de inventario", href: "/inventario/historial", icon: RotateCcwClock },
  { label: "Ajustes", href: "/ajustes", icon: Settings },
];

/** Acciones rápidas (flujos de creación / modos). */
const ACTIONS: readonly PaletteItem[] = [
  { label: "Añadir ticket", href: "/escanear", icon: ScanLine },
  { label: "Nueva receta", href: "/recetas/nueva", icon: Plus },
  { label: "Modo compra", href: "/lista/compra", icon: Store },
];

/**
 * El diálogo de la paleta de comandos (⌘/Ctrl+K). Vive aparte del botón que lo
 * abre (`command-palette.tsx`) para cargarse diferido: ver allí por qué.
 */
export function CommandPaletteDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();

  function go(href: string) {
    onOpenChange(false);
    router.push(href);
  }

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Buscar"
      description="Ir a una sección o ejecutar una acción rápida"
    >
      <Command>
        <CommandInput placeholder="Ir a una sección o acción…" />
        <CommandList>
          <CommandEmpty>Sin resultados.</CommandEmpty>
          <CommandGroup heading="Ir a">
            {NAV.map((item) => {
              const Icon = item.icon;
              return (
                <CommandItem
                  key={item.href}
                  value={item.label}
                  onSelect={() => go(item.href)}
                >
                  <Icon aria-hidden />
                  {item.label}
                </CommandItem>
              );
            })}
          </CommandGroup>
          <CommandGroup heading="Acciones rápidas">
            {ACTIONS.map((item) => {
              const Icon = item.icon;
              return (
                <CommandItem
                  key={item.href}
                  value={item.label}
                  onSelect={() => go(item.href)}
                >
                  <Icon aria-hidden />
                  {item.label}
                </CommandItem>
              );
            })}
          </CommandGroup>
        </CommandList>
      </Command>
    </CommandDialog>
  );
}
