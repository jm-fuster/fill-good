import { normalizeName } from "@/lib/normalize";
import { DEFAULT_ICON_SLUG, isKnownIcon } from "./catalog";

/**
 * Auto-asignación y resolución del icono de un producto (L16).
 *
 * El icono efectivo se resuelve por capas, igual que la tienda preferida
 * (manual) vs. inferida: `products.icon` es el override MANUAL; si está vacío se
 * adivina del nombre con un diccionario determinista (mismo resultado para todo
 * el hogar); si tampoco hay match, se usa el icono de la categoría (emoji → slug
 * cuando se reconoce) y por último un genérico. Nada se escribe en la BBDD: la
 * adivinanza se calcula al vuelo.
 */

/** Emojis de categoría (semilla y comunes) mapeados a su icono equivalente. */
const EMOJI_TO_SLUG: Record<string, string> = {
  "🍎": "manzana", "🍏": "manzana-verde", "🍌": "platano", "🥦": "brocoli",
  "🥕": "zanahoria", "🍅": "tomate", "🥩": "carne", "🍗": "pollo",
  "🐟": "pescado", "🦐": "gamba", "🥛": "leche", "🧀": "queso", "🥚": "huevo",
  "🍞": "pan", "🥫": "conserva", "🧊": "hielo", "🥤": "refresco",
  "🍷": "vino", "🍺": "cerveza", "☕": "cafe", "🍫": "chocolate",
  "🍪": "galleta", "🧽": "esponja", "🧴": "bote-spray", "🧼": "jabon",
  "🧹": "escoba", "🚽": "wc", "🐾": "huellas", "🐶": "perro", "🐱": "gato",
  "📦": "paquete",
};

/**
 * Palabra clave (normalizada, singular) → slug. El emparejamiento toma el
 * keyword MÁS LARGO que aparezca al inicio de palabra en el nombre, así las
 * reglas específicas ("pasta de dientes") ganan a las genéricas ("pasta").
 */
const KEYWORD_TO_SLUG: Record<string, string> = {
  // Fruta
  manzana: "manzana",
  // Ojo: gana el keyword MÁS LARGO, así que estas reglas deben superar en
  // longitud a "manzana" (7) para que la verde no caiga en la roja. Por eso
  // "granny smith" y no "granny", y el plural va aparte del singular.
  "manzana verde": "manzana-verde", "manzanas verdes": "manzana-verde",
  "granny smith": "manzana-verde", "manzana golden": "manzana-verde",
  "manzanas golden": "manzana-verde",
  platano: "platano", banana: "platano", naranja: "naranja",
  mandarina: "naranja", clementina: "naranja", pomelo: "naranja",
  limon: "limon", lima: "lima",
  fresa: "fresa", freson: "fresa", uva: "uvas", sandia: "sandia", pina: "pina",
  pera: "pera", melocoton: "melocoton", nectarina: "melocoton",
  albaricoque: "melocoton", nispero: "melocoton", paraguayo: "melocoton",
  cereza: "cerezas", picota: "cerezas",
  ciruela: "ciruela", melon: "melon", kiwi: "kiwi", mango: "mango", coco: "coco",
  papaya: "mango", maracuya: "mango", caqui: "melocoton",
  arandano: "arandanos", frambuesa: "frambuesa", mora: "frambuesa",
  grosella: "frambuesa", granada: "frambuesa",
  higo: "uvas", datil: "castana", chirimoya: "pera", membrillo: "pera",
  aguacate: "aguacate", guacamole: "aguacate",
  // Verdura
  zanahoria: "zanahoria", tomate: "tomate", "tomate frito": "conserva",
  patata: "patata", "patatas fritas": "patatas-fritas", boniato: "boniato",
  batata: "boniato", cebolla: "cebolla", cebolleta: "cebolla",
  chalota: "cebolla",
  ajo: "ajo", puerro: "puerro", pimiento: "pimiento", guindilla: "guindilla",
  chile: "guindilla", brocoli: "brocoli", coliflor: "coliflor", col: "col",
  // Genéricos: "verduras salteadas/congeladas", "menestra". Antes caían en `sal`
  // porque la clave corta se colaba en "salteadas".
  verdura: "brocoli", menestra: "brocoli",
  repollo: "col", lombarda: "col", maiz: "maiz",
  // Sin icono propio: no existe alcachofa a color en ninguna librería abierta y
  // dibujarla salía peor que no tenerla. Cae en la hoja verde, que es lo más
  // cercano de verdad. Si algún día aparece una, basta añadirla al registro.
  alcachofa: "lechuga",
  guisante: "guisantes", "judias verdes": "guisantes", pepino: "pepino",
  pepinillo: "pepino",
  calabacin: "calabacin", calabaza: "calabaza", lechuga: "lechuga",
  canonigos: "lechuga", rucula: "lechuga", endivia: "lechuga",
  escarola: "lechuga", berros: "lechuga", apio: "lechuga", hinojo: "lechuga",
  espinaca: "lechuga", acelga: "lechuga", esparrago: "esparragos",
  trigueros: "esparragos", berenjena: "berenjena", remolacha: "remolacha",
  nabo: "zanahoria", chirivia: "zanahoria", rabano: "zanahoria",
  champinon: "champinon", seta: "champinon", portobello: "champinon",
  shiitake: "champinon", boletus: "champinon",
  aceituna: "aceituna", alcaparra: "aceituna", encurtido: "aceituna",
  jengibre: "jengibre",
  // Carne
  carne: "carne", ternera: "carne", cerdo: "carne", "carne picada": "carne",
  filete: "carne", solomillo: "carne", lomo: "carne", conejo: "carne",
  albondiga: "carne", tofu: "carne", seitan: "carne",
  pollo: "pollo",
  pavo: "pollo", pechuga: "pollo", muslo: "pollo", alitas: "pollo",
  costilla: "costilla", chuleta: "costilla",
  cordero: "costilla", bacon: "bacon", panceta: "bacon", salchicha: "perrito",
  chorizo: "perrito", embutido: "perrito", fuet: "perrito",
  salchichon: "perrito", mortadela: "perrito", longaniza: "perrito",
  butifarra: "perrito", morcilla: "perrito", sobrasada: "perrito",
  chistorra: "perrito", lacon: "perrito",
  jamon: "jamon", paleta: "jamon", serrano: "jamon",
  // Pescado y marisco
  pescado: "pescado", salmon: "pescado", merluza: "pescado", atun: "pescado",
  sardina: "pescado", bacalao: "pescado", lubina: "pescado", dorada: "pescado",
  boqueron: "pescado", anchoa: "pescado", rape: "pescado", rodaballo: "pescado",
  trucha: "pescado", caballa: "pescado", panga: "pescado", perca: "pescado",
  gamba: "gamba", langostino: "gamba", marisco: "gamba", quisquilla: "gamba",
  // "buey" a secas es carne; solo el buey DE MAR es marisco.
  cangrejo: "cangrejo", necora: "cangrejo", "buey de mar": "cangrejo",
  langosta: "langosta", bogavante: "langosta", cigala: "langosta",
  calamar: "calamar", sepia: "calamar", chipiron: "calamar", pulpo: "pulpo",
  // Todos los bivalvos comparten la concha de 'ostra'. El mejillón llegó a tener
  // dibujo propio y se retiró: ver la nota del generador (siempre salía un ojo).
  ostra: "ostra", mejillon: "ostra", berberecho: "ostra", almeja: "ostra",
  navaja: "ostra", vieira: "ostra", zamburina: "ostra", percebe: "ostra",
  surimi: "surimi", "palitos de cangrejo": "surimi",
  // Lácteos y huevos
  leche: "leche", yogur: "yogur", yogurt: "yogur", kefir: "yogur",
  cuajada: "yogur", nata: "leche", batido: "leche",
  queso: "queso", requeson: "queso", mascarpone: "queso", mozzarella: "queso",
  huevo: "huevo", mantequilla: "mantequilla",
  margarina: "mantequilla", helado: "helado",
  // Panadería y cereales
  pan: "pan", "pan de molde": "pan", "pan rallado": "conserva", hogaza: "pan",
  // Sigue siendo pan: sin esta regla gana "cereales" (8) sobre "pan" (3).
  "pan de cereales": "pan",
  baguette: "baguette", croissant: "croissant", bagel: "bagel",
  pretzel: "pretzel", tortita: "tortitas", gofre: "gofre", pita: "pan-plano",
  // Las tortillas de trigo/maíz son pan plano, no la tortilla de patatas. Ganan
  // por longitud a la regla "tortilla" de más abajo.
  "tortilla de trigo": "pan-plano", "tortillas de trigo": "pan-plano",
  "tortilla de maiz": "pan-plano", "tortillas de maiz": "pan-plano",
  arroz: "arroz", pasta: "pasta", macarron: "pasta", espagueti: "pasta",
  fideo: "pasta", tallarin: "pasta", harina: "harina",
  cuscus: "arroz", quinoa: "arroz", bulgur: "arroz",
  cereales: "cereales", cereal: "cereales", muesli: "cereales",
  granola: "cereales", avena: "cereales",
  tostada: "pan", biscote: "pan", picos: "pan", colines: "pan",
  // Despensa
  conserva: "conserva", lata: "conserva", garbanzo: "alubias", lenteja: "alubias",
  alubia: "alubias", judia: "alubias", legumbre: "alubias", tarro: "tarro",
  mermelada: "tarro", salsa: "tarro", mayonesa: "tarro", ketchup: "tarro",
  mostaza: "tarro", tabasco: "tarro", hummus: "tarro", pate: "tarro",
  foie: "tarro", soja: "tarro", pisto: "conserva",
  miel: "miel", sal: "sal", azucar: "harina", levadura: "harina",
  gelatina: "harina", vinagre: "tarro",
  aceite: "aceite", cafe: "cafe", cacao: "chocolate", colacao: "chocolate",
  // Nada de "cocido" a secas: es un adjetivo ("pulpo cocido", "jamón cocido") y le
  // ganaba por longitud al producto de verdad.
  caldo: "sopa", sopa: "sopa", potaje: "sopa", "cocido madrileno": "sopa",
  // "crema" sola es un guiso (de calabacín, de verduras). Las excepciones dulces
  // y la cosmética ganan por longitud, pero la catalana necesita regla propia.
  crema: "sopa", "crema catalana": "flan",
  "frutos secos": "cacahuetes", cacahuete: "cacahuetes",
  nuez: "cacahuetes", almendra: "cacahuetes", avellana: "cacahuetes",
  pistacho: "cacahuetes",
  // Dulces
  chocolate: "chocolate", galleta: "galleta", caramelo: "caramelo",
  chuche: "caramelo", piruleta: "piruleta", donut: "donut", tarta: "tarta",
  cupcake: "cupcake", magdalena: "cupcake", bizcocho: "tarta", pastel: "pastel",
  flan: "flan", natilla: "flan", palomita: "palomitas",
  // Bebidas
  te: "tetera", infusion: "tetera", mate: "mate", refresco: "refresco",
  cola: "refresco", tonica: "refresco", bitter: "refresco",
  isotonica: "refresco", "bebida energetica": "refresco", kombucha: "refresco",
  agua: "agua", vino: "vino",
  // El vaso de whisky de Fluent vale para cualquier licor.
  whisky: "vaso", ron: "vaso", ginebra: "vaso", vodka: "vaso",
  vermut: "vaso", licor: "vaso", brandy: "vaso", orujo: "vaso",
  horchata: "brik",
  // El brik (🧃) ES un zumo, así que lo que viene en cartón va aquí y no al vaso
  // de refresco. Ojo: "zumo de naranja" cae antes en "naranja", que es más largo.
  zumo: "brik", gazpacho: "brik", "bebida vegetal": "brik",
  "bebida de avena": "brik", "bebida de soja": "brik",
  "bebida de arroz": "brik", "bebida de almendra": "brik",
  "leche de avena": "brik", "leche de soja": "brik",
  cerveza: "cerveza", birra: "cerveza", coctel: "coctel", champan: "champan",
  cava: "champan", sidra: "champan",
  // Platos preparados
  pizza: "pizza", hamburguesa: "hamburguesa", sandwich: "sandwich",
  taco: "taco", burrito: "burrito", sushi: "sushi", ensalada: "ensalada",
  paella: "paella",
  // "marisco" (7) le gana por longitud a "paella" (6), así que la variante más
  // vendida necesita su propia regla o la paella sale con una gamba.
  "paella de marisco": "paella", "paella de mariscos": "paella",
  tortilla: "tortilla", empanadilla: "empanadilla",
  empanada: "empanadilla", gyoza: "empanadilla",
  // Limpieza e higiene
  esponja: "esponja", estropajo: "esponja", detergente: "bote-spray",
  suavizante: "bote-spray", lavavajillas: "bote-spray", lejia: "bote-spray",
  limpiador: "bote-spray", limpiacristales: "bote-spray", amoniaco: "bote-spray",
  friegasuelos: "bote-spray", spray: "bote-spray", ambientador: "bote-spray",
  quitamanchas: "bote-spray", antical: "bote-spray", insecticida: "bote-spray",
  desinfectante: "bote-spray", abrillantador: "bote-spray",
  jabon: "jabon", gel: "jabon", champu: "bote-spray", acondicionador: "bote-spray",
  desodorante: "bote-spray", colonia: "bote-spray", perfume: "bote-spray",
  // "crema" a secas NO vale: chocaría con crema de leche, crema catalana o crema
  // de cacao. Solo la cosmética, que siempre lleva apellido.
  hidratante: "bote-spray", "protector solar": "bote-spray",
  "crema de manos": "bote-spray", "crema corporal": "bote-spray",
  "espuma de afeitar": "bote-spray", "after shave": "bote-spray",
  "papel higienico": "papel", "papel de cocina": "papel", papel: "papel",
  servilleta: "papel", "bolsa de basura": "papelera", basura: "papelera",
  fregona: "escoba", escoba: "escoba", bayeta: "esponja",
  toallita: "papel", tampon: "papel",
  "pasta de dientes": "diente", dentifrico: "diente", enjuague: "diente",
  "cepillo de dientes": "cepillo-dientes", cuchilla: "maquinilla",
  maquinilla: "maquinilla", "maquinilla de afeitar": "maquinilla",
  "navaja de afeitar": "maquinilla",
  tijeras: "tijeras", desatascador: "desatascador", compresa: "papel",
  panuelo: "papel", "papel aluminio": "bolsas", "papel film": "bolsas",
  film: "bolsas", "papel de horno": "bolsas",
  "bolsa de congelacion": "bolsas", "bolsa de plastico": "bolsas",
  pintalabios: "pintalabios", maquillaje: "pintalabios", labial: "pintalabios",
  // Salud y farmacia
  medicamento: "pastilla", medicina: "pastilla", pastillas: "pastilla",
  ibuprofeno: "pastilla", paracetamol: "pastilla", aspirina: "pastilla",
  vitamina: "pastilla", analgesico: "pastilla", tirita: "tirita",
  aposito: "tirita", venda: "tirita", botiquin: "tirita", gasa: "tirita",
  alcohol: "tirita", "agua oxigenada": "tirita", algodon: "tirita",
  bastoncillo: "tirita", mascarilla: "tirita", betadine: "tirita",
  jeringa: "jeringa", jeringuilla: "jeringa", termometro: "termometro",
  // Cocina / despensa extra
  sarten: "sarten", especias: "hierbas", especia: "hierbas", oregano: "hierbas",
  pimienta: "hierbas", comino: "hierbas", laurel: "hierbas", perejil: "hierbas",
  albahaca: "hierbas", condimento: "hierbas", curry: "hierbas",
  pimenton: "hierbas", azafran: "hierbas", canela: "hierbas",
  romero: "hierbas", tomillo: "hierbas", castana: "castana",
  tetrabrik: "brik", "tetra brik": "brik",
  // Bebé y mascotas
  biberon: "biberon", papilla: "biberon", panal: "biberon", pienso: "huellas",
  gato: "gato", perro: "perro", mascota: "huellas", juguete: "peluche",
  peluche: "peluche", muneco: "peluche",
  // Otros / hogar
  bombilla: "bombilla", pila: "pila", bateria: "pila", hielo: "hielo",
  vela: "vela", velas: "vela", cerilla: "cerilla", fosforo: "cerilla",
  mechero: "cerilla", llave: "llave", llaves: "llave",
  martillo: "martillo", herramienta: "martillo", clavo: "martillo",
  tornillo: "martillo", destornillador: "martillo", bricolaje: "martillo",
  guante: "guantes",
  // Sin icono nuevo: reaprovechan uno que ya existe. Nada de `botella` a secas:
  // le ganaría a "vino" y una botella de vino saldría como agua.
  "botella reutilizable": "agua", cantimplora: "agua",
  turron: "chocolate", polvoron: "galleta", mazapan: "galleta",
};

/**
 * Conectores que se tiran antes de emparejar. Las reglas de varias palabras eran
 * literales, así que un "de" de más las rompía: quien escribía "papel de aluminio"
 * no encontraba la regla `papel aluminio` y acababa con el rollo de papel
 * higiénico, y "pasta dientes" (sin el "de") caía en los espaguetis, justo el caso
 * que la regla de «gana la más larga» existe para evitar. Se aplica IGUAL al
 * nombre y a las claves, así que da lo mismo cómo se escriba.
 *
 * OJO: esto NO toca `normalizeName`, que alimenta el
 * unique(household_id, normalized_name) de la BBDD. Es solo para emparejar.
 */
const CONNECTORS = /(^|\s)(?:de|del|la|el|los|las|al|a|en|con|para|y)(?=\s)/g;

function forMatching(normalized: string): string {
  return normalized.replace(CONNECTORS, "$1").replace(/\s+/g, " ").trim();
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Construye el patrón de una clave ya sin conectores. Las palabras que NO son la
 * última toleran el plural (`bolsa(s) congelacion`), y a todas se les quita la `s`
 * final: como el patrón no ancla el final, la última empareja por prefijo, que es
 * lo que ya hacía que "pepino" cubriera "pepinos".
 *
 * EXCEPCIÓN: las claves de una sola palabra CORTA sí anclan el final. Emparejar
 * por prefijo con 3-4 letras mete el icono dentro de cualquier palabra que empiece
 * igual: `col` se colaba en "lápices de COLores", y por el mismo motivo `sal`
 * caería en "salmorejo", `te` en "tequila" y `gel` en "gelatina". Hasta ahora eso
 * se tapaba a base de añadir la palabra larga (`salmon`, `salsa`, `gelatina`…),
 * que es una lista infinita. Con el ancla basta permitir el plural español —`-s`
 * tras vocal y `-es` tras consonante— para que "col"/"coles" sigan valiendo.
 */
const SHORT_KEYWORD = 4;

function keywordPattern(kw: string): RegExp {
  const words = kw.split(" ");
  if (words.length === 1 && kw.length <= SHORT_KEYWORD) {
    return new RegExp("(^|[^a-z])" + escapeRe(kw) + "(e?s)?(?![a-z])");
  }
  const body = words
    .map((w, i) => {
      const stem = escapeRe(w.replace(/s$/, ""));
      return i === words.length - 1 ? stem : stem + "s?";
    })
    .join(" ");
  return new RegExp("(^|[^a-z])" + body);
}

const RULES: Array<[RegExp, string]> = Object.entries(KEYWORD_TO_SLUG)
  .filter(([, slug]) => isKnownIcon(slug))
  .map(([kw, slug]): [string, string] => [forMatching(normalizeName(kw)), slug])
  // Gana la clave MÁS LARGA ya sin conectores, que es la que de verdad se compara.
  .sort((a, b) => b[0].length - a[0].length)
  .map(([kw, slug]) => [keywordPattern(kw), slug]);

/**
 * Adivina el slug de icono a partir del nombre del producto, o null si no hay
 * ninguna regla que encaje. Determinista: mismo nombre → mismo icono siempre.
 */
export function guessProductIcon(name: string | null | undefined): string | null {
  if (!name) return null;
  const n = forMatching(normalizeName(name));
  if (!n) return null;
  for (const [re, slug] of RULES) {
    if (re.test(n)) return slug;
  }
  return null;
}

export type ResolvedIcon =
  | { kind: "slug"; slug: string }
  | { kind: "emoji"; emoji: string };

/**
 * Resuelve el icono efectivo: override manual → adivinado del nombre → icono de
 * la categoría (emoji reconocido a slug, o el emoji tal cual si es personalizado)
 * → genérico. Siempre devuelve algo renderizable.
 */
export function resolveProductIcon(opts: {
  icon?: string | null;
  name?: string | null;
  categoryIcon?: string | null;
}): ResolvedIcon {
  const { icon, name, categoryIcon } = opts;
  if (icon && isKnownIcon(icon)) return { kind: "slug", slug: icon };

  const guessed = guessProductIcon(name);
  if (guessed) return { kind: "slug", slug: guessed };

  return resolveCategoryIcon(categoryIcon);
}

/** Resuelve solo el icono de una categoría (para cabeceras de grupo). */
export function resolveCategoryIcon(categoryIcon: string | null | undefined): ResolvedIcon {
  if (categoryIcon) {
    const trimmed = categoryIcon.trim();
    if (isKnownIcon(trimmed)) return { kind: "slug", slug: trimmed };
    const mapped = EMOJI_TO_SLUG[trimmed];
    if (mapped) return { kind: "slug", slug: mapped };
    // Emoji personalizado por el hogar: se respeta tal cual (no lo perdemos).
    return { kind: "emoji", emoji: categoryIcon };
  }
  return { kind: "slug", slug: DEFAULT_ICON_SLUG };
}
