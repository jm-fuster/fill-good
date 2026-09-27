# Avisos de terceros

El contenido de este repositorio no tiene licencia de uso: todos los derechos
reservados (ver LICENSE). Dentro van piezas de terceros con su propia licencia,
que exige conservar su aviso en cualquier copia. En la app desplegada, el
resumen está en /terminos#creditos.

Además de las dos de abajo, el bundle incluye los iconos de interfaz de
[Lucide](https://lucide.dev) (licencia ISC, © Lucide Contributors; derivados
de Feather, MIT) y la tipografía [Geist](https://github.com/vercel/geist-font)
(SIL Open Font License 1.1, © Vercel, que viaja con su aviso dentro de los
propios ficheros de fuente). Las demás dependencias viven en `node_modules`
con sus licencias.

**Historial.** Entre el 23 y el 26 de julio de 2026 (commits 5a88258 a
7eadea5) el registro de iconos incluía 8 iconos de
[Game Icons](https://game-icons.net) (licencia CC BY 3.0: ciruela, calabaza,
espárragos, col, remolacha, frambuesa, alcachofa y puerro), con su atribución
en Ajustes. Ya no está ninguno en el código actual.

## Fluent Emoji, de Microsoft

Los iconos de producto de `src/lib/product-icons/registry.ts` son la variante
Flat de [Fluent Emoji](https://github.com/microsoft/fluentui-emoji), obtenida a
través de [Iconify](https://icon-sets.iconify.design/fluent-emoji-flat/), y
algunos van recoloreados. Los 14 dibujos de `assets/product-icons/` son
propios.

```text
MIT License

Copyright (c) Microsoft Corporation.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE
```

## shadcn/ui

Los componentes de `src/components/ui/` y el hook `src/hooks/use-mobile.ts`
salen de [shadcn/ui](https://github.com/shadcn-ui/ui), algunos con ajustes: el
tamaño táctil de `button.tsx` e `input.tsx`, o `use-mobile`, reescrito con
`useSyncExternalStore`. `responsive-modal.tsx` es propio.

```text
MIT License

Copyright (c) 2023 shadcn

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
