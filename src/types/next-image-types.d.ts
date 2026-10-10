// Tipos de las importaciones estáticas de imágenes (`import sprite from
// "./sprite.svg"`). Los trae `next-env.d.ts`, pero ese archivo lo genera
// `next build` y está en .gitignore: el `tsc` del CI corre antes de ningún
// build y, sin esta referencia, no sabe qué es un `.svg`. Es la misma línea que
// escribe Next, así que en local, con `next-env.d.ts` presente, no choca.
/// <reference types="next/image-types/global" />
