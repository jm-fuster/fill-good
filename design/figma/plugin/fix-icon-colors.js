// fix-icon-colors.js — ARGS.page. Devuelve a cada icono de las instancias de una
// página el color que le da su componente principal (ver fixIconColors en ds-lib).
// Hay que pasarlo después de montar composiciones con instance swap de iconos.
const page = await pageByName(ARGS.page);
const fixed = await fixIconColors(page);
return { page: ARGS.page, fixed };
