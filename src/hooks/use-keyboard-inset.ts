import * as React from "react";

/**
 * Publica la geometría del teclado virtual en dos custom properties sobre
 * `<html>`, para que un bottom sheet pueda quedarse SIEMPRE dentro de la zona
 * visible mientras se escribe:
 *
 * - `--fg-kb-inset`: alto en px que el teclado tapa por abajo. El sheet lo usa
 *   como `bottom`, así se apoya justo encima del teclado en vez de quedarse
 *   debajo (los elementos `fixed` se posicionan contra el viewport de layout,
 *   que el teclado NO encoge en iOS ni en Chrome por defecto).
 * - `--fg-vv-h`: alto en px de la zona visible, para acotar el `max-height`.
 *
 * Solo se publican mientras hay teclado; al cerrarse se borran y el CSS vuelve
 * a sus valores estáticos, así esta capa no existe cuando no hace falta.
 *
 * ¿Por qué a mano y no con `repositionInputs` de vaul (desactivado en
 * `ResponsiveModal`)? Porque vaul escribe `height` y `bottom` en línea sobre el
 * sheet y eso rompe de dos maneras:
 *
 * 1. El alto en px se queda pegado: lo repone al cerrarse el teclado desde una
 *    medida vieja y nunca lo limpia, así que el sheet deja de seguir a su
 *    contenido y aparece cortado. Basta con que su heurística del teclado se
 *    despiste — y se despista con cualquier cambio de ~60px del visual viewport,
 *    como la barra del navegador al aparecer, o al mover el foco de un campo a
 *    un selector.
 * 2. Ignora `visualViewport.offsetTop`, el desplazamiento que el navegador aplica
 *    al enfocar un campo. Ese offset sube en pantalla todo lo posicionado en el
 *    viewport de layout, y sumado al alza que ya hacía vaul dejaba la parte de
 *    arriba del sheet —donde está el nombre del artículo— fuera de la pantalla.
 *
 * Aquí se mide una sola cosa (qué parte de abajo NO se ve) y se mide entera,
 * offset incluido.
 */

/**
 * Por debajo de esto no hay teclado. En el navegador (no en la PWA instalada)
 * las barras de Safari/Chrome ya recortan el visual viewport unas decenas de px
 * sin teclado alguno, y subir el sheet por eso dejaría un hueco raro abajo.
 */
const KEYBOARD_MIN_HEIGHT = 120;

/** Tipos de `input` que no abren teclado. */
const NON_TEXT_INPUT_TYPES = new Set([
  "button",
  "checkbox",
  "color",
  "file",
  "image",
  "radio",
  "range",
  "reset",
  "submit",
]);

function isTextField(element: Element | null): element is HTMLElement {
  if (element instanceof HTMLTextAreaElement) return true;
  if (element instanceof HTMLInputElement)
    return !NON_TEXT_INPUT_TYPES.has(element.type);
  return element instanceof HTMLElement && element.isContentEditable;
}

export function useKeyboardInset() {
  React.useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;

    const root = document.documentElement;
    let frame = 0;

    const clear = () => {
      root.style.removeProperty("--fg-kb-inset");
      root.style.removeProperty("--fg-vv-h");
    };

    const measure = () => {
      frame = 0;
      // Con pinch-zoom el visual viewport habla del zoom, no del teclado.
      const inset =
        viewport.scale > 1.02
          ? 0
          : window.innerHeight - viewport.height - viewport.offsetTop;
      if (inset < KEYBOARD_MIN_HEIGHT) {
        clear();
        return;
      }
      root.style.setProperty("--fg-kb-inset", `${Math.round(inset)}px`);
      root.style.setProperty("--fg-vv-h", `${Math.round(viewport.height)}px`);
      // El sheet acaba de cambiar de alto y de sitio: el campo que se está
      // editando tiene que seguir viéndose. `nearest` no hace nada si ya se ve,
      // y el único contenedor con scroll por encima es el del propio sheet
      // (la página está bloqueada mientras el modal está abierto).
      if (isTextField(document.activeElement)) {
        document.activeElement.scrollIntoView({ block: "nearest" });
      }
    };

    const schedule = () => {
      // Coalesce: al abrirse el teclado llegan varios resize/scroll seguidos.
      if (!frame) frame = requestAnimationFrame(measure);
    };

    viewport.addEventListener("resize", schedule);
    // `scroll` es imprescindible: el navegador desplaza el visual viewport al
    // enfocar un campo, y sin escucharlo el sheet se queda descolocado.
    viewport.addEventListener("scroll", schedule);
    schedule();

    return () => {
      if (frame) cancelAnimationFrame(frame);
      viewport.removeEventListener("resize", schedule);
      viewport.removeEventListener("scroll", schedule);
      clear();
    };
  }, []);
}
