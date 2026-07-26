// @ts-check
import { serwist } from "@serwist/next/config";

// Modo configurador: `serwist build` se ejecuta después de `next build`
// (Turbopack no soporta el plugin webpack clásico de @serwist/next).
export default serwist({
  swSrc: "src/app/sw.ts",
  swDest: "public/sw.js",
  // /styleguide es la única página prerenderizada que NO es pública en
  // `proxy.ts`. El fetch del precache no lleva `Sec-Fetch-Dest: document` ni
  // `Accept: text/html` ni `Next-Url`, así que Clerk no lo trata como petición
  // de página: cae en su rama `notFound()` y devuelve 404. Un 404 en el
  // precache aborta la instalación entera del service worker
  // (`bad-precaching-response`), y sin instalación no hay SW que controle la
  // página: se queda mandando el anterior, o ninguno.
  globIgnores: [".next/server/app/styleguide.html"],
});
