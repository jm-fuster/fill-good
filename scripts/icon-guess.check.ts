/**
 * Comprobaciones de qué icono sale para un nombre de producto. Lo ejecuta
 * `npm run check:adivina` (ver `scripts/check-icon-guess.mjs`, que lo empaqueta
 * con esbuild porque esto es TypeScript y tira del alias `@/`).
 *
 * Prueba `guessProductIcon` de `src/lib/product-icons/guess.ts` con NOMBRES
 * REALES: los del catálogo sembrado, los de tickets de Mercadona y Alipende y los
 * que escriben los hogares (medido el 11-oct-2026 contra la tabla `products`).
 *
 * Existe porque cada regla de ese diccionario se rompe en silencio y lejos de
 * donde se escribe: la clave nueva compila, el icono que estropea es el de OTRO
 * producto, y el fallo solo se ve en la lista de alguien. Ya pasó cada vez que se
 * amplió: "cocido" le ganaba a "pulpo" por longitud, "col" se colaba en "lápices de
 * colores" y "sal" en "salmorejo", "pastillas" ponía el icono del medicamento al
 * caldo en pastillas, y "filete" ponía el chuletón a una lubina. Las tres reglas que
 * gobiernan el diccionario, y que estos casos fijan:
 *  · gana la clave MÁS LARGA ya sin conectores ("pasta de dientes" > "pasta");
 *  · las claves de ≤4 letras anclan el final (y admiten el plural español);
 *  · los cortes ("filete", "lomo", "solomillo") son débiles: solo cuentan si el
 *    nombre no dice de qué animal es.
 *
 * Lo que NO se prueba: el icono de la categoría ni el override manual
 * (`resolveProductIcon`), ni el dibujo. Un caso que espera un slug que no existe
 * en el registro FALLA aquí, porque `guessProductIcon` descarta esas reglas: si
 * quitas un icono, esta lista te dice qué productos se quedan sin él.
 */
import { guessProductIcon } from "@/lib/product-icons/guess";
import { isKnownIcon } from "@/lib/product-icons/catalog";

let fallos = 0;
function check(nombre: string, condicion: boolean, extra?: unknown) {
  if (condicion) {
    console.log(`  ok    ${nombre}`);
  } else {
    fallos += 1;
    console.log(
      `  FALLO ${nombre}`,
      extra === undefined ? "" : JSON.stringify(extra),
    );
  }
}

function seccion(titulo: string) {
  console.log(`\n${titulo}`);
}

/** El nombre da exactamente este icono (null = ninguna regla, cae en la categoría). */
function es(nombre: string, slug: string | null) {
  if (slug !== null && !isKnownIcon(slug)) {
    check(`«${nombre}» → ${slug} (el slug no existe en el registro)`, false);
    return;
  }
  const got = guessProductIcon(nombre);
  check(`«${nombre}» → ${slug ?? "nada"}`, got === slug, { sale: got });
}

/** El nombre NO da este icono (para colisiones donde lo correcto es "otra cosa"). */
function noEs(nombre: string, slug: string) {
  const got = guessProductIcon(nombre);
  check(`«${nombre}» no es ${slug}`, got !== slug, { sale: got });
}

seccion("Catálogo sembrado (lo que ve un hogar recién creado)");
es("Plátanos", "platano");
es("Cebollas", "cebolla");
es("Ajos", "ajo");
es("Tomate frito", "conserva");
es("Huevos", "huevo");
es("Pimientos", "pimiento");
es("Calabacines", "calabacin");
es("Guisantes congelados", "guisantes");
es("Pechugas de pollo", "pollo");
es("Jamón serrano", "jamon");
es("Queso rallado", "queso");
es("Pan de molde", "pan");
es("Macarrones", "pasta");
es("Mayonesa", "tarro");
es("Gambas congeladas", "gamba");
es("Carne picada", "carne");
es("Merluza", "pescado");
es("Lentejas", "alubias");
es("Garbanzos cocidos", "alubias");
es("Frutos secos", "cacahuetes");
es("Cacao soluble", "chocolate");
es("Papel de cocina", "papel");
es("Aceite de girasol", "aceite");
es("Harina de trigo", "harina");
es("Azúcar", "harina");
es("Agua embotellada", "agua");
es("Patatas fritas", "patatas-fritas");
es("Bolsas de basura", "papelera");
es("Pasta de dientes", "diente");
es("Gel de ducha", "jabon");
es("Detergente para la ropa", "bote-spray");

seccion("Gana la clave más larga, sin conectores");
es("Pasta dientes", "diente");
es("Papel de aluminio", "bolsas");
es("Papel aluminio", "bolsas");
es("Paella de marisco", "paella");
es("Pan de cereales", "pan");
es("Pan de hamburguesa", "pan");
es("Tortillas de trigo", "pan-plano");
es("Tortilla de patatas", "tortilla");
es("Tortitas fajitas", "pan-plano");
es("Manzanas golden", "manzana-verde");
es("Manzana", "manzana");
es("Leche de avena", "brik");
es("Buey de mar", "cangrejo");
es("Crema catalana", "flan");
es("Pulpo cocido", "pulpo");
es("Caldo de pollo", "sopa");
es("Caldo en pastillas Knorr 12 unidades", "sopa");
es("Caldo casero Gallina Blanca", "sopa");
es("Uva moscatel", "uvas");

seccion("Las claves cortas anclan el final");
es("Lápices de colores", null);
noEs("Salmorejo", "sal");
noEs("Tequila", "tetera");
es("Gelatina", "harina");
es("Verduras salteadas", "brocoli");
es("Coles de Bruselas", "col");
es("Sal", "sal");

seccion("Los cortes son débiles: manda el animal");
es("Filete de pollo", "pollo");
es("Filete de pavo", "pollo");
es("Filete de contra de pollo Alipende", "pollo");
es("Lubina en filete 180g con piel", "pescado");
es("Filete de ternera", "carne");
es("Lomo de cerdo", "carne");
es("Lomo adobado", "carne");
es("Cabeza de lomo", "carne");
es("Solomillo de cerdo", "carne");
es("Lomo Duroc taco Artysan 400g", "carne");
es("Tacos de ternera", "carne");
es("Tacos", "taco");

seccion("Iconos de L16g: lo que antes salía con un icono prestado");
es("Salmón", "salmon");
es("Salmón ahumado Alipende 100g", "salmon");
es("Lomo de salmón", "salmon");
es("Merluza", "pescado");
es("Atún en lata", "atun");
es("Atún claro Alipende pack 3", "atun");
es("Bonito del norte", "atun");
es("Atún fresco", "pescado");
es("Lomos de atún", "pescado");
es("Chorizo", "chorizo");
es("Fuet", "chorizo");
es("Txistorra", "chorizo");
es("Lomo embuchado", "chorizo");
es("Salchichas", "perrito");
es("Jamón cocido", "fiambre");
es("Jamón York", "fiambre");
es("Pavo en lonchas", "fiambre");
es("Mortadela con aceitunas", "fiambre");
es("Jamón serrano", "jamon");
es("Pechuga de pavo", "pollo");
es("Albóndigas", "albondigas");
es("Pimiento rojo", "pimiento-rojo");
es("Pimientos del piquillo", "pimiento-rojo");
es("Pimiento morrón", "pimiento-rojo");
es("Pimientos asados", "pimiento-rojo");
es("Pimiento italiano", "pimiento");

seccion("Nombres reales que caían en la categoría");
es("Carrilleras", "carne");
es("Entrecot de añojo", "carne");
es("Ensaladilla Alipende 1kg", "ensalada");
es("Espirales Alipende 500g", "pasta");
es("Regañás Alipende 200g", "pan");
es("Cogollos 3 unidades", "lechuga");
es("Danacol", "yogur");
es("Bicarbonato de sodio", "harina");
es("Pedro Ximénez", "vino");
es("Piparras Gurutxe 125g", "guindilla");
es("Pan rallado", "harina");
es("Mejillones", "ostra");

console.log(
  fallos === 0
    ? "\nIconos por nombre: todo en orden.\n"
    : `\nIconos por nombre: ${fallos} fallo(s).\n`,
);
process.exit(fallos === 0 ? 0 : 1);
