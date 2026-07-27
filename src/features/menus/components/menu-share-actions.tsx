"use client";

import { Printer, Share2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

/**
 * Compartir e imprimir el menú de la semana, en la cabecera de /menus (mismo
 * patrón que el icono de Ajustes en /perfil). Van arriba y a la vista, no tras
 * un «⋯»: sacar el menú de la app es algo que se busca, y esconderlo obligaba a
 * descubrirlo. La página solo las monta cuando la semana tiene platos.
 */
export function MenuShareActions({ menuId }: { menuId: string }) {
  async function share() {
    try {
      const res = await fetch(`/api/menus/${menuId}/imagen`);
      if (!res.ok) throw new Error("fetch failed");
      const blob = await res.blob();
      const file = new File([blob], "menu-semanal.png", { type: "image/png" });

      if (
        typeof navigator.canShare === "function" &&
        navigator.canShare({ files: [file] })
      ) {
        await navigator.share({ files: [file], title: "Menú semanal" });
        return;
      }

      // Fallback (escritorio): descarga directa de la imagen.
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "menu-semanal.png";
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      // El usuario cancela el diálogo nativo → no es un error.
      if (err instanceof DOMException && err.name === "AbortError") return;
      toast.error("No se pudo generar la imagen del menú.");
    }
  }

  return (
    <div className="flex items-center gap-1 print:hidden">
      <Button
        variant="outline"
        size="icon"
        onClick={share}
        aria-label="Compartir el menú"
      >
        <Share2 aria-hidden />
      </Button>
      <Button
        variant="outline"
        size="icon"
        onClick={() => window.print()}
        aria-label="Imprimir el menú"
      >
        <Printer aria-hidden />
      </Button>
    </div>
  );
}
