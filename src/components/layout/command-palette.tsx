"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import {
  BookOpen,
  CalendarDays,
  History,
  LineChart,
  Package,
  Plus,
  ScanLine,
  Search,
  Settings,
  ShoppingCart,
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
  { label: "Precios", href: "/precios", icon: LineChart },
  { label: "Historial de inventario", href: "/inventario/historial", icon: History },
  { label: "Ajustes", href: "/ajustes", icon: Settings },
];

/** Acciones rápidas (flujos de creación / modos). */
const ACTIONS: readonly PaletteItem[] = [
  { label: "Añadir ticket", href: "/escanear", icon: ScanLine },
  { label: "Nueva receta", href: "/recetas/nueva", icon: Plus },
  { label: "Modo compra", href: "/lista/compra", icon: Store },
];

/**
 * Paleta de comandos (⌘/Ctrl+K) para navegar y lanzar acciones desde el
 * teclado en escritorio. Se monta en el header del shell (oculto en móvil vía
 * CSS): el botón "Buscar…" solo se ve en escritorio, pero el atajo funciona
 * siempre que esté montado. El diálogo se porta al body (posición en el árbol
 * indiferente).
 */
export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  // Solo en cliente (evita desajuste de hidratación): en el servidor "Ctrl".
  const isMac = useSyncExternalStore(
    () => () => {},
    () => /mac/i.test(navigator.platform),
    () => false,
  );

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setOpen((prev) => !prev);
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  function go(href: string) {
    setOpen(false);
    router.push(href);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-9 items-center gap-2 rounded-lg border border-input bg-input/30 px-3 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
      >
        <Search className="size-4" aria-hidden />
        <span>Buscar…</span>
        <kbd className="ml-6 rounded border bg-background px-1.5 py-0.5 font-sans text-[10px] font-medium text-muted-foreground">
          {isMac ? "⌘" : "Ctrl"} K
        </kbd>
      </button>

      <CommandDialog
        open={open}
        onOpenChange={setOpen}
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
    </>
  );
}
