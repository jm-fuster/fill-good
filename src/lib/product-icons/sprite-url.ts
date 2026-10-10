import sprite from "./sprite.svg";

/**
 * URL del sprite de iconos de producto. Como es una importación estática, Next
 * la sirve con hash en el nombre (caché inmutable) y el service worker la
 * precachea con el resto de `_next/static`.
 *
 * En un módulo aparte, sin nada más, porque la importa también el shell de la
 * app (`ProductIconSpriteWarmup`): desde `components/product-icon.tsx` arrastraba
 * el catálogo y las reglas de adivinar iconos (~8 KB gz) a TODAS las pantallas.
 */
export const PRODUCT_ICON_SPRITE_URL: string = sprite.src;
