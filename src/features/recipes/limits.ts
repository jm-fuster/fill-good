/**
 * Topes de la receta. Los hace cumplir el schema (`schemas.ts`), y los leen
 * también el formulario y la mezcla de lo generado por IA (`ai-draft.ts`), para
 * no pasarse y dejar un borrador que el propio guardado rechazaría.
 *
 * En un módulo propio, sin zod, porque esos dos llegan al navegador: leyendo
 * las constantes de `schemas.ts`, el formulario arrastraba el módulo entero, y
 * con él zod (~95 KB gz con sus dependencias), al JS de /recetas/[id] y
 * /recetas/nueva. Importa los topes desde aquí, nunca desde `schemas.ts`.
 */
export const MAX_RECIPE_STEPS = 30;
export const MAX_RECIPE_INGREDIENTS = 50;
/**
 * Tope del NOMBRE de un ingrediente. Se exporta porque es el único de esta
 * validación sin `.catch()`: pasarse no ajusta el valor, tumba el guardado
 * entero con el mensaje por defecto de zod (en inglés y sin decir qué fila). Un
 * modelo que escribe «Caldo de pollo o, en su defecto, una pastilla de
 * concentrado disuelta en agua templada» se lo come, así que la mezcla lo recorta
 * antes de que llegue aquí.
 */
export const MAX_RECIPE_INGREDIENT_NAME = 120;
/**
 * Tope de la CANTIDAD de un ingrediente: `numeric(10, 2)` son 8 dígitos
 * enteros, así que 99999999,99 es el techo real de la columna.
 *
 * No es una cota de cordura, es la de la base. Pasarse no da un dato raro: da
 * `numeric field overflow`, un error de ESCRITURA que llega cuando el guardado
 * ya ha empezado. Al editar una receta eso significaba quedarse sin ningún
 * ingrediente (ver `updateRecipeAction`), y basta una errata de un dedo —un
 * cero de más repetido al teclear los gramos— para provocarlo.
 */
export const MAX_INGREDIENT_QUANTITY = 99_999_999;
