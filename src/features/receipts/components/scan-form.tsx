"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { Camera, Loader2, ScanLine, Upload } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { compressImage } from "@/lib/image";
import { scanReceiptAction } from "../actions";

// El escáner solo se descarga cuando alguien lo abre: arrastra el visor, la
// detección de bordes y la rectificación, que no hacen falta para subir un PDF.
const DocumentScanner = dynamic(
  () => import("./document-scanner").then((mod) => mod.DocumentScanner),
  { ssr: false },
);

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
  const [scannerOpen, setScannerOpen] = useState(false);
  // La cámara falló (permiso denegado, sin cámara…): se ofrece la foto normal.
  const [cameraBlocked, setCameraBlocked] = useState(false);

  const submit = useCallback(
    async (payload: Blob, filename: string, type: string) => {
      setPending(true);
      try {
        const fd = new FormData();
        fd.append("file", new File([payload], filename, { type }));
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

  const handleFile = useCallback(
    async (file: File) => {
      setPending(true);
      try {
        if (file.type.startsWith("image/")) {
          const compressed = await compressImage(file);
          await submit(compressed, "ticket.jpg", compressed.type || file.type);
          return;
        }
        await submit(file, file.name || "ticket", file.type);
      } catch {
        toast.error("No se pudo procesar el archivo.");
        setPending(false);
      }
    },
    [submit],
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

  const handleScannerCapture = useCallback(
    (file: File) => {
      setScannerOpen(false);
      // El recorte ya sale enderezado y con el lado mayor a 1600 px, igual que
      // `compressImage`. Pasarlo otra vez por ahí solo añadiría una segunda
      // compresión JPEG, y lo que se pierde son los bordes del texto — justo lo
      // que la IA tiene que leer.
      void submit(file, file.name, file.type);
    },
    [submit],
  );

  const handleScannerUnavailable = useCallback((reason: string) => {
    setScannerOpen(false);
    setCameraBlocked(true);
    toast.info(reason);
  }, []);

  const handleScannerError = useCallback((message: string) => {
    toast.error(message);
  }, []);

  const handleScannerCancel = useCallback(() => setScannerOpen(false), []);

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

      {/* Móvil (< md): el escáner es la vía natural. Recorta y endereza el
          ticket antes de subirlo, que es lo que mejora la lectura de la IA. Si
          la cámara no está disponible se cae a la foto del sistema. */}
      <div className="flex flex-col gap-3 md:hidden">
        {cameraBlocked ? (
          <Button size="lg" onClick={() => cameraRef.current?.click()}>
            <Camera aria-hidden />
            Hacer foto al ticket
          </Button>
        ) : (
          <Button size="lg" onClick={() => setScannerOpen(true)}>
            <ScanLine aria-hidden />
            Escanear ticket
          </Button>
        )}
        <Button
          size="lg"
          variant="outline"
          onClick={() => fileRef.current?.click()}
        >
          <Upload aria-hidden />
          Subir imagen o PDF
        </Button>
      </div>

      {/* Escritorio (≥ md): arrastrar y soltar, clic o pegar. No se ofrece el
          escáner porque la webcam de un portátil no encuadra un ticket con
          dignidad, y `capture` degrada a un selector de archivos igual que
          "subir". */}
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

      {scannerOpen ? (
        <DocumentScanner
          onCapture={handleScannerCapture}
          onCancel={handleScannerCancel}
          onUnavailable={handleScannerUnavailable}
          onError={handleScannerError}
        />
      ) : null}
    </div>
  );
}
