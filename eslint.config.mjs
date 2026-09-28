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
  // Iconos de Lucide: un solo nombre por icono, el canónico (el del archivo del
  // icono, p. ej. `trash` → `Trash`). Lucide exporta además alias antiguos
  // (Trash2, Loader2, Home…) y el sufijo `…Icon` que genera shadcn: llegó a
  // haber hasta tres nombres para el mismo dibujo (AlertTriangle, TriangleAlert
  // y TriangleAlertIcon). Los alias se retiran entre versiones mayores de
  // Lucide, y en el design system de Figma cada icono es UN componente con el
  // nombre del archivo. Un `shadcn add` vuelve a traer el sufijo: esto lo para.
  {
    name: "fillgood/lucide-nombres-canonicos",
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "lucide-react",
              importNames: ["Trash2", "Loader2", "History", "LineChart", "BarChart3", "Home", "MoreHorizontal", "AlertTriangle"],
              message:
                "Alias antiguo de Lucide: usa el nombre canónico (Trash, LoaderCircle, RotateCcwClock, ChartLine, ChartColumn, House, Ellipsis, TriangleAlert).",
            },
          ],
          patterns: [
            {
              group: ["lucide-react"],
              importNamePattern: "^(?!Lucide).+Icon$",
              message:
                "Sin sufijo «Icon»: importa el icono con su nombre canónico (Check, no CheckIcon). Es lo que añade shadcn al generar componentes.",
            },
          ],
        },
      ],
    },
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
