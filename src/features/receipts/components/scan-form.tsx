"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, Loader2, Upload } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { compressImage } from "@/lib/image";
import { scanReceiptAction } from "../actions";

export function ScanForm() {
  const router = useRouter();
  const cameraRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState(false);

  async function handleFile(file: File) {
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
  );
}
