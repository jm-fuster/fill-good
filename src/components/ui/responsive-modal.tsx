"use client";

import * as React from "react";

import { cn } from "@/lib/utils";
import { useMediaQuery } from "@/hooks/use-media-query";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";

/**
 * Modal adaptativo (E11). En `< md` se presenta como bottom sheet (`Drawer` de
 * vaul, regla de AGENTS.md para móvil); en `≥ md` como diálogo centrado
 * (`Dialog` de Radix). Misma API de subcomponentes en ambos casos, así las
 * features nunca importan `Drawer`/`Dialog` directamente.
 *
 * La decisión Drawer↔Dialog usa `useMediaQuery`, válido aquí porque los modales
 * solo se abren tras una interacción (post-hidratación): no hay mismatch SSR.
 * El primitivo elegido se comparte por contexto para que Title/Description/Close
 * queden asociados al Root correcto (vaul y Radix tienen contextos distintos).
 */
const DESKTOP_MEDIA_QUERY = "(min-width: 768px)";

const ResponsiveModalContext = React.createContext(false);

function useIsDesktopModal() {
  return React.useContext(ResponsiveModalContext);
}

/**
 * Integra el botón «atrás» del navegador con el bottom sheet en móvil (E11): al
 * abrir un sheet controlado se empuja una entrada de historial; «atrás» la
 * consume y cierra el sheet en vez de navegar fuera. Cuando el sheet se cierra
 * por otra vía (botón, swipe, overlay) y nuestra entrada sigue en el tope, se
 * consume con `history.back()`.
 *
 * Solo actúa en la rama móvil (`enabled`) y solo para modales CONTROLADOS
 * (`open` definido); los no controlados (trigger declarativo) quedan fuera.
 *
 * Robustez frente al router de Next: cada apertura marca su entrada con un id
 * único en `history.state`. Si el usuario navega con el sheet abierto (Next
 * empuja su propio estado), al desmontar el tope ya no es nuestro id y NO se
 * llama a `back()`, así no se deshace la navegación. Limitación asumida: con
 * varios sheets anidados un único «atrás» puede cerrar más de uno (cada
 * instancia escucha `popstate`); es un caso raro y el cierre en cascada es
 * aceptable.
 */
function useHistoryDismiss({
  open,
  onOpenChange,
  enabled,
}: {
  open: boolean | undefined;
  onOpenChange: ((open: boolean) => void) | undefined;
  enabled: boolean;
}) {
  const onOpenChangeRef = React.useRef(onOpenChange);
  // Sincroniza la ref fuera de render (regla react-hooks/refs). Sin array de
  // deps: corre en cada commit, antes del efecto principal declarado debajo.
  React.useEffect(() => {
    onOpenChangeRef.current = onOpenChange;
  });

  React.useEffect(() => {
    if (!enabled || open !== true || typeof window === "undefined") return;

    const id =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `sheet-${performance.now()}`;
    window.history.pushState({ fgSheetId: id }, "");
    let poppedByUser = false;

    const onPop = () => {
      poppedByUser = true;
      onOpenChangeRef.current?.(false);
    };
    window.addEventListener("popstate", onPop);

    return () => {
      window.removeEventListener("popstate", onPop);
      // Cerrado por botón/swipe/overlay: si NUESTRA entrada sigue en el tope, la
      // consumimos. Si el usuario navegó, el tope es otro estado → no tocamos nada.
      if (
        !poppedByUser &&
        (window.history.state as { fgSheetId?: string } | null)?.fgSheetId ===
          id
      ) {
        window.history.back();
      }
    };
  }, [open, enabled]);
}

function ResponsiveModal({
  children,
  ...props
}: React.ComponentProps<typeof Drawer>) {
  const isDesktop = useMediaQuery(DESKTOP_MEDIA_QUERY);

  // Atrás cierra el sheet en móvil (rama Drawer). En escritorio no se toca: Radix
  // Dialog ya cierra con Escape y no debe interferir con el historial.
  useHistoryDismiss({
    open: props.open,
    onOpenChange: props.onOpenChange,
    enabled: !isDesktop,
  });

  if (isDesktop) {
    // Radix Dialog solo consume estas props; las exclusivas de vaul
    // (repositionInputs, direction, dismissible…) se ignoran en esta rama.
    const { open, defaultOpen, onOpenChange, modal } = props;
    return (
      <ResponsiveModalContext.Provider value={true}>
        <Dialog
          open={open}
          defaultOpen={defaultOpen}
          onOpenChange={onOpenChange}
          modal={modal}
        >
          {children}
        </Dialog>
      </ResponsiveModalContext.Provider>
    );
  }

  return (
    <ResponsiveModalContext.Provider value={false}>
      <Drawer {...props}>{children}</Drawer>
    </ResponsiveModalContext.Provider>
  );
}

function ResponsiveModalTrigger(
  props: React.ComponentProps<typeof DrawerTrigger>,
) {
  const isDesktop = useIsDesktopModal();
  const Comp = isDesktop ? DialogTrigger : DrawerTrigger;
  return <Comp {...props} />;
}

function ResponsiveModalClose(props: React.ComponentProps<typeof DrawerClose>) {
  const isDesktop = useIsDesktopModal();
  const Comp = isDesktop ? DialogClose : DrawerClose;
  return <Comp {...props} />;
}

function ResponsiveModalContent({
  className,
  overlayClassName,
  children,
  onOpenAutoFocus,
}: {
  className?: string;
  /**
   * Ajusta el overlay del modal. Necesario cuando el modal se abre sobre un
   * contenedor a pantalla completa con z-index propio (p. ej. el modo compra),
   * para elevar overlay y contenido por encima de él.
   */
  overlayClassName?: string;
  children?: React.ReactNode;
  /** Útil en confirmaciones destructivas para enfocar la acción segura. */
  onOpenAutoFocus?: (event: Event) => void;
}) {
  const isDesktop = useIsDesktopModal();

  if (isDesktop) {
    // El ancho lo da DialogContent; p-0 para que header/form/footer controlen
    // el padding igual que en la rama Drawer, y scroll interno si es alto.
    return (
      <DialogContent
        className={cn(
          "flex max-h-[85vh] flex-col gap-0 overflow-y-auto p-0 sm:max-w-lg",
          className,
        )}
        overlayClassName={overlayClassName}
        onOpenAutoFocus={onOpenAutoFocus}
      >
        {children}
      </DialogContent>
    );
  }

  return (
    <DrawerContent
      className={className}
      overlayClassName={overlayClassName}
      onOpenAutoFocus={onOpenAutoFocus}
    >
      <div className="mx-auto flex max-h-[85vh] w-full max-w-md flex-col overflow-y-auto">
        {children}
      </div>
    </DrawerContent>
  );
}

function ResponsiveModalHeader({
  className,
  ...props
}: React.ComponentProps<"div">) {
  const isDesktop = useIsDesktopModal();
  // En móvil se conserva el DrawerHeader (centrado en el bottom sheet); en
  // escritorio, cabecera alineada a la izquierda como un diálogo.
  if (isDesktop) {
    return (
      <div
        data-slot="responsive-modal-header"
        className={cn("flex flex-col gap-1 p-4 text-left", className)}
        {...props}
      />
    );
  }
  return <DrawerHeader className={className} {...props} />;
}

function ResponsiveModalFooter({
  className,
  ...props
}: React.ComponentProps<"div">) {
  // Mismo layout apilado en ambos (botones a ancho completo, táctiles).
  return (
    <div
      data-slot="responsive-modal-footer"
      className={cn("mt-auto flex flex-col gap-2 p-4", className)}
      {...props}
    />
  );
}

function ResponsiveModalTitle(
  props: React.ComponentProps<typeof DrawerTitle>,
) {
  const isDesktop = useIsDesktopModal();
  const Comp = isDesktop ? DialogTitle : DrawerTitle;
  return <Comp {...props} />;
}

function ResponsiveModalDescription(
  props: React.ComponentProps<typeof DrawerDescription>,
) {
  const isDesktop = useIsDesktopModal();
  const Comp = isDesktop ? DialogDescription : DrawerDescription;
  return <Comp {...props} />;
}

export {
  ResponsiveModal,
  ResponsiveModalTrigger,
  ResponsiveModalContent,
  ResponsiveModalHeader,
  ResponsiveModalFooter,
  ResponsiveModalTitle,
  ResponsiveModalDescription,
  ResponsiveModalClose,
};
