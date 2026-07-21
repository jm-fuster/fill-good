import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";

import { scanReceiptAction } from "@/features/receipts/actions";

// Receptor del Web Share Target (M10b): recibe la imagen/PDF compartida desde
// la galería y la mete en el flujo normal de escaneo. Requiere sesión (Clerk);
// sin ella no se puede guardar, así que se redirige a iniciar sesión.
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    // 303: cambia el POST a GET al redirigir.
    return NextResponse.redirect(new URL("/sign-in", request.url), 303);
  }

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.redirect(new URL("/escanear", request.url), 303);
  }

  const fd = new FormData();
  fd.set("file", file);
  const result = await scanReceiptAction({}, fd);

  if (result.error || !result.receiptId) {
    return NextResponse.redirect(new URL("/escanear", request.url), 303);
  }

  return NextResponse.redirect(
    new URL(`/escanear/${result.receiptId}/revisar`, request.url),
    303,
  );
}
