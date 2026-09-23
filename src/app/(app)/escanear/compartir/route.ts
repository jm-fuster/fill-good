import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";

import { scanReceiptAction } from "@/features/receipts/actions";
import { SHARE_ERROR_COOKIE } from "@/lib/share-target";

// Receptor del Web Share Target (M10b): recibe la imagen/PDF compartida desde
// la galería y la mete en el flujo normal de escaneo. Requiere sesión (Clerk);
// sin ella no se puede guardar, así que se redirige a iniciar sesión.
//
// Es la RESERVA: con el service worker activo, el POST lo recoge `app/sw.ts`
// y el archivo se comprime en el navegador (ver allí por qué). Aquí solo se
// llega sin service worker.
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  // Un Route Handler no trae la protección CSRF de las Server Actions. El Web
  // Share Target siempre navega desde el propio origen (Sec-Fetch-Site
  // same-origin o none); rechazamos cualquier POST cross-site, que sería un
  // envío forjado desde otro sitio. Si la cabecera no existe, se permite
  // (navegadores antiguos) para no romper el share target legítimo.
  const site = request.headers.get("sec-fetch-site");
  if (site && site !== "same-origin" && site !== "none") {
    return new NextResponse("Origen no permitido", { status: 403 });
  }

  const { userId } = await auth();
  if (!userId) {
    // 303: cambia el POST a GET al redirigir.
    return NextResponse.redirect(new URL("/sign-in", request.url), 303);
  }

  // Volver a /escanear sin decir nada era un fallo mudo: el usuario compartía
  // el ticket y aparecía la pantalla vacía, sin saber si se había leído. El
  // motivo viaja en una cookie de un minuto que `ScanForm` enseña y borra (no
  // en la URL: es texto de error, y ahí se quedaría en el historial).
  const volverConError = (message: string) => {
    const res = NextResponse.redirect(new URL("/escanear", request.url), 303);
    res.cookies.set(SHARE_ERROR_COOKIE, encodeURIComponent(message), {
      path: "/escanear",
      maxAge: 60,
      sameSite: "lax",
    });
    return res;
  };

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return volverConError("No llegó ningún archivo al compartir. Súbelo desde aquí.");
  }

  const fd = new FormData();
  fd.set("file", file);
  const result = await scanReceiptAction({}, fd);

  if (result.error || !result.receiptId) {
    return volverConError(result.error ?? "No se pudo leer el ticket compartido.");
  }

  return NextResponse.redirect(
    new URL(`/escanear/${result.receiptId}/revisar`, request.url),
    303,
  );
}
