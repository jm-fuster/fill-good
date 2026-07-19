// @ts-check
import { serwist } from "@serwist/next/config";

// Modo configurador: `serwist build` se ejecuta después de `next build`
// (Turbopack no soporta el plugin webpack clásico de @serwist/next).
export default serwist({
  swSrc: "src/app/sw.ts",
  swDest: "public/sw.js",
});
