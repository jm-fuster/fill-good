/**
 * Sustituto vacío de `server-only` para los scripts que corren en Node pelado.
 *
 * `src/features/recipes/seed` abre con `import "server-only"` para que el pack de
 * recetas no pueda acabar en un bundle de cliente. Ese paquete está escrito para
 * lanzar un error cuando se importa sin la condición `react-server`, así que
 * fuera de Next revienta el import. `compare-menu-models.mjs` lo apunta aquí con
 * un alias de esbuild: el script solo LEE el pack, no lo sirve a nadie.
 */
export {};
