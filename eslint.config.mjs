import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import jsxA11y from "eslint-plugin-jsx-a11y";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Capa 1 de vigilancia de accesibilidad: eslint-config-next solo activa un
  // subconjunto de jsx-a11y. Aquí subimos al preset `strict` (31 reglas en
  // `error`) para que las regresiones WCAG rompan el lint en cada cambio.
  // Solo aplicamos las reglas: el plugin `jsx-a11y` ya lo registra nextVitals,
  // así que redeclararlo daría un error de "plugin ya definido".
  {
    name: "fillgood/a11y-strict",
    rules: jsxA11y.flatConfigs.strict.rules,
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Service worker generado por Serwist (artefacto de build)
    "public/sw*",
    // Código que ejecuta el plugin de Figma como CUERPO de función (await y
    // return de primer nivel, `figma` y `ARGS` como parámetros): no es un módulo
    // y el parser lo rechazaría. Los scripts de Node de design/figma sí se lintan.
    "design/figma/plugin/**",
  ]),
]);

export default eslintConfig;
