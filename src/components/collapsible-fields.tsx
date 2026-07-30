"use client";

import { useEffect, useId, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Sección plegable para los campos secundarios de un formulario largo. Los
 * básicos quedan a la vista y el resto vive aquí, para que las acciones del
 * panel (guardar, eliminar) se lean sin scroll.
 *
 * Dos decisiones que no son de estilo:
 *
 * 1. El contenido SIEMPRE está montado y solo se oculta con CSS. Las Server
 *    Actions de guardado leen el FormData completo y tratan un campo ausente
 *    como «déjalo vacío», así que desmontarlo borraría el mínimo de stock, el
 *    pack o el contenido por unidad al guardar con la sección cerrada.
 * 2. Se oculta con la clase `hidden`, no con el atributo `hidden`: el atributo
 *    vive en la hoja de estilos del navegador y cualquier clase de display
 *    (`flex`) le gana, así que el panel «cerrado» seguiría viéndose.
 */
export function CollapsibleFields({
  title,
  hint,
  badge,
  defaultOpen = false,
  children,
}: {
  title: string;
  /** Qué hay dentro. Sin esto, lo plegado deja de existir para el usuario. */
  hint?: string;
  /** Aviso sobre el contenido oculto (p. ej. nombres de ticket repetidos). */
  badge?: React.ReactNode;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const contentId = useId();
  const contentRef = useRef<HTMLDivElement>(null);

  // Si al enviar hay un campo inválido AQUÍ DENTRO (una fecha a medio teclear,
  // «1.2.3» en un número), el navegador bloquea el envío e intenta enfocarlo;
  // oculto no puede, así que el botón Guardar se quedaría muerto y sin mensaje.
  // Abrimos la sección para que el aviso nativo tenga dónde salir.
  //
  // Dos detalles: el evento `invalid` no burbujea, de ahí el listener nativo en
  // fase de captura; y `flushSync` porque el navegador enfoca en el mismo turno,
  // así que el desplegado tiene que estar aplicado ya al volver de aquí.
  useEffect(() => {
    const node = contentRef.current;
    if (!node) return;
    const onInvalid = () => {
      flushSync(() => setOpen(true));
    };
    node.addEventListener("invalid", onInvalid, true);
    return () => node.removeEventListener("invalid", onInvalid, true);
  }, []);

  return (
    <div className="rounded-xl border">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={contentId}
        className="flex w-full items-center justify-between gap-3 rounded-xl p-3 text-left transition-colors hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="flex flex-wrap items-center gap-2 font-medium">
            {title}
            {badge}
          </span>
          {hint ? (
            <span className="text-sm text-muted-foreground">{hint}</span>
          ) : null}
        </span>
        <ChevronDown
          aria-hidden
          className={cn(
            "size-5 shrink-0 text-muted-foreground transition-transform duration-150 motion-reduce:transition-none",
            open && "rotate-180",
          )}
        />
      </button>
      <div
        id={contentId}
        ref={contentRef}
        className={cn(
          "flex-col gap-4 border-t p-3",
          open ? "flex" : "hidden",
        )}
      >
        {children}
      </div>
    </div>
  );
}
