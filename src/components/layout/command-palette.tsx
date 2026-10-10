"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import dynamic from "next/dynamic";
import { Search } from "lucide-react";

// Diferido: el botón vive en el header del shell, o sea en TODAS las rutas, y
// el diálogo arrastra cmdk y el Dialog (~17 KB gz) al JS de entrada de cada
// pantalla, también en móvil, donde el botón ni se ve. Aquí solo queda lo que
// se pinta y el atajo; el diálogo se descarga en reposo en escritorio (ver
// abajo) o, como muy tarde, al abrirlo.
const loadDialog = () =>
  import("./command-palette-dialog").then((m) => m.CommandPaletteDialog);
const CommandPaletteDialog = dynamic(loadDialog, { ssr: false });

/** Media query del shell de escritorio, el único que enseña el botón. */
const DESKTOP_QUERY = "(min-width: 768px)";

/**
 * Paleta de comandos (⌘/Ctrl+K) para navegar y lanzar acciones desde el
 * teclado en escritorio. Se monta en el header del shell (oculto en móvil vía
 * CSS): el botón "Buscar…" solo se ve en escritorio, pero el atajo funciona
 * siempre que esté montado. El diálogo se porta al body (posición en el árbol
 * indiferente).
 */
export function CommandPalette() {
  const [open, setOpen] = useState(false);
  // El diálogo se monta al abrirlo por primera vez y ya se queda montado: así
  // la animación de cierre sigue funcionando igual que antes.
  const [mounted, setMounted] = useState(false);
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
        setMounted(true);
        setOpen((prev) => !prev);
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  // En escritorio, el diálogo se descarga en cuanto el navegador está libre,
  // para que el primer ⌘K abra al instante. En móvil no: nadie lo va a abrir.
  useEffect(() => {
    if (!window.matchMedia(DESKTOP_QUERY).matches) return;
    const preload = () => void loadDialog();
    if ("requestIdleCallback" in window) {
      const id = window.requestIdleCallback(preload, { timeout: 5000 });
      return () => window.cancelIdleCallback(id);
    }
    const id = setTimeout(preload, 2000);
    return () => clearTimeout(id);
  }, []);

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setMounted(true);
          setOpen(true);
        }}
        // Por si el reposo aún no llegó: el gesto de ir a pulsarlo ya basta.
        onPointerEnter={() => void loadDialog()}
        onFocus={() => void loadDialog()}
        className="inline-flex h-9 items-center gap-2 rounded-lg border border-input bg-input/30 px-3 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
      >
        <Search className="size-4" aria-hidden />
        <span>Buscar…</span>
        <kbd className="ml-6 rounded border bg-background px-1.5 py-0.5 font-sans text-[10px] font-medium text-muted-foreground">
          {isMac ? "⌘" : "Ctrl"} K
        </kbd>
      </button>

      {mounted ? (
        <CommandPaletteDialog open={open} onOpenChange={setOpen} />
      ) : null}
    </>
  );
}
