"use client";

import { MoreHorizontal, Printer, Share2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/**
 * Sacar el menú de la app —compartir la imagen o imprimirlo— desde la cabecera
 * de /menus. La página solo las monta cuando la semana tiene platos.
 *
 * Antes eran dos iconos sueltos y a la vista, para no esconder algo que se
 * busca. El problema no era esconderlo: eran dos botones grandes permanentes en
 * la cabecera para dos acciones que se hacen una vez por semana, y sin más pista
 * de lo que hacían que un icono (el nombre solo lo veía un lector de pantalla).
 * Tras el «⋯» las dos acciones se llaman por su nombre, con su icono al lado, y
 * la cabecera vuelve a ser el título.
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

  /*
    `window.print()` bloquea el hilo hasta que se cierra el diálogo del sistema,
    así que llamarlo dentro del `onSelect` congelaría el menú abierto detrás de
    la vista previa. Cediendo un turno, React alcanza a pintar el cierre.
  */
  function print() {
    setTimeout(() => window.print(), 0);
  }

  return (
    // `modal={false}`: sin bloqueo de scroll ni de puntero en el body, que es lo
    // que se enreda cuando esto convive con un bottom sheet.
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="icon" aria-label="Acciones del menú">
          <MoreHorizontal aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      {/* `print:hidden` porque el contenido va en un portal, fuera del envoltorio
          que la página oculta al imprimir: sin esto el propio menú podría salir
          impreso en la hoja. */}
      <DropdownMenuContent align="end" className="w-56 print:hidden">
        <DropdownMenuItem onSelect={share}>
          <Share2 aria-hidden />
          Compartir el menú
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={print}>
          <Printer aria-hidden />
          Imprimir el menú
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
