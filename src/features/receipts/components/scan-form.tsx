"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, Loader2, Upload } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { compressImage } from "@/lib/image";
import { scanReceiptAction } from "../actions";

/** ¿Es un archivo que la IA puede leer (imagen o PDF)? */
function isSupported(file: File) {
  return file.type.startsWith("image/") || file.type === "application/pdf";
}

export function ScanForm() {
  const router = useRouter();
  const cameraRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState(false);
  const [dragActive, setDragActive] = useState(false);

  const handleFile = useCallback(
    async (file: File) => {
      setPending(true);
      try {
        let payload: Blob = file;
        let filename = file.name || "ticket";
        if (file.type.startsWith("image/")) {
          payload = await compressImage(file);
          filename = "ticket.jpg";
        }
        const fd = new FormData();
        fd.append(
          "file",
          new File([payload], filename, { type: payload.type || file.type }),
        );
        const result = await scanReceiptAction({}, fd);
        if (result.error) {
          toast.error(result.error);
          setPending(false);
          return;
        }
        result.warnings?.forEach((w) => toast.warning(w));
        router.push(`/escanear/${result.receiptId}/revisar`);
      } catch {
        toast.error("No se pudo procesar el archivo.");
        setPending(false);
      }
    },
    [router],
  );

  // Pegar (Ctrl/Cmd+V) una imagen del portapapeles: en escritorio es lo natural
  // cuando el ticket llega por email y se hace una captura. Solo actúa si hay un
  // archivo válido y no hay ya un análisis en curso.
  useEffect(() => {
    function onPaste(event: ClipboardEvent) {
      if (pending) return;
      const file = Array.from(event.clipboardData?.files ?? []).find(isSupported);
      if (!file) return;
      event.preventDefault();
      void handleFile(file);
    }
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  }, [pending, handleFile]);

  function handleDrop(event: React.DragEvent) {
    event.preventDefault();
    setDragActive(false);
    if (pending) return;
    const files = Array.from(event.dataTransfer.files);
    const file = files.find(isSupported);
    if (file) void handleFile(file);
    else if (files.length > 0)
      toast.error("Formato no válido. Arrastra una imagen o un PDF.");
  }

  if (pending) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed px-6 py-16 text-center">
        <Loader2 className="size-8 animate-spin text-primary" aria-hidden />
        <p className="mt-4 font-medium">Analizando el ticket…</p>
        <p className="mt-1 text-sm text-muted-foreground">
          La IA está leyendo los productos y precios. Puede tardar unos
          segundos.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
        }}
      />
      <input
        ref={fileRef}
        type="file"
        accept="image/*,application/pdf"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
        }}
      />

      {/* Móvil (< md): la cámara trasera es la vía natural, como acción primaria. */}
      <div className="flex flex-col gap-3 md:hidden">
        <Button size="lg" onClick={() => cameraRef.current?.click()}>
          <Camera aria-hidden />
          Hacer foto al ticket
        </Button>
        <Button
          size="lg"
          variant="outline"
          onClick={() => fileRef.current?.click()}
        >
          <Upload aria-hidden />
          Subir imagen o PDF
        </Button>
      </div>

      {/* Escritorio (≥ md): arrastrar y soltar, clic o pegar. No se ofrece "hacer
          foto" porque la webcam del portátil no aporta y `capture` degrada a un
          selector de archivos igual que "subir". */}
      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragActive(true);
        }}
        onDragLeave={() => setDragActive(false)}
        onDrop={handleDrop}
        aria-label="Subir imagen o PDF del ticket"
        className={cn(
          "hidden min-h-56 flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors md:flex",
          "hover:border-primary/60 hover:bg-muted/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
          dragActive ? "border-primary bg-primary/5" : "border-border",
        )}
      >
        <Upload className="size-8 text-muted-foreground" aria-hidden />
        <span className="font-medium">
          Arrastra aquí una imagen o PDF, o haz clic para elegir
        </span>
        <span className="text-sm text-muted-foreground">
          También puedes pegar una captura con Ctrl/Cmd + V
        </span>
      </button>

      <p className="text-sm text-muted-foreground">
        Si el ticket es largo o está arrugado, súbelo escaneado en PDF: se lee
        mejor.
      </p>
    </div>
  );
}
