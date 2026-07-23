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
  "🍎": "manzana", "🍏": "manzana", "🍌": "platano", "🥦": "brocoli",
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
  manzana: "manzana", platano: "platano", banana: "platano", naranja: "naranja",
  mandarina: "naranja", clementina: "naranja", limon: "limon", lima: "lima",
  fresa: "fresa", freson: "fresa", uva: "uvas", sandia: "sandia", pina: "pina",
  pera: "pera", melocoton: "melocoton", nectarina: "melocoton", cereza: "cerezas",
  ciruela: "ciruela", melon: "melon", kiwi: "kiwi", mango: "mango", coco: "coco",
  arandano: "arandanos", frambuesa: "frambuesa", mora: "frambuesa",
  aguacate: "aguacate", guacamole: "aguacate",
  // Verdura
  zanahoria: "zanahoria", tomate: "tomate", "tomate frito": "conserva",
  patata: "patata", "patatas fritas": "patatas-fritas", cebolla: "cebolla",
  ajo: "ajo", puerro: "puerro", pimiento: "pimiento", guindilla: "guindilla",
  chile: "guindilla", brocoli: "brocoli", coliflor: "brocoli", col: "col",
  repollo: "col", lombarda: "col", alcachofa: "alcachofa", maiz: "maiz",
  guisante: "guisantes", "judias verdes": "guisantes", pepino: "pepino",
  calabacin: "calabaza", calabaza: "calabaza", lechuga: "lechuga",
  espinaca: "lechuga", acelga: "lechuga", esparrago: "esparragos",
  trigueros: "esparragos", berenjena: "berenjena", remolacha: "remolacha",
  champinon: "champinon", seta: "champinon", aceituna: "aceituna",
  jengibre: "jengibre",
  // Carne
  carne: "carne", ternera: "carne", cerdo: "carne", "carne picada": "carne",
  filete: "carne", solomillo: "carne", lomo: "carne", pollo: "pollo",
  pavo: "pollo", pechuga: "pollo", costilla: "costilla", chuleta: "costilla",
  cordero: "costilla", bacon: "bacon", panceta: "bacon", salchicha: "perrito",
  chorizo: "perrito", embutido: "perrito", jamon: "bacon", fuet: "perrito",
  // Pescado y marisco
  pescado: "pescado", salmon: "pescado", merluza: "pescado", atun: "pescado",
  sardina: "pescado", bacalao: "pescado", lubina: "pescado", dorada: "pescado",
  boqueron: "pescado", gamba: "gamba", langostino: "gamba", marisco: "gamba",
  cangrejo: "cangrejo", langosta: "langosta", calamar: "calamar",
  sepia: "calamar", pulpo: "calamar", mejillon: "ostra", almeja: "ostra",
  ostra: "ostra",
  // Lácteos y huevos
  leche: "leche", yogur: "leche", yogurt: "leche", nata: "leche",
  batido: "leche", queso: "queso", huevo: "huevo", mantequilla: "mantequilla",
  margarina: "mantequilla", helado: "helado",
  // Panadería y cereales
  pan: "pan", "pan de molde": "pan", "pan rallado": "conserva", hogaza: "pan",
  baguette: "baguette", croissant: "croissant", bagel: "bagel",
  pretzel: "pretzel", tortita: "tortitas", gofre: "gofre", pita: "pan-plano",
  arroz: "arroz", pasta: "pasta", macarron: "pasta", espagueti: "pasta",
  fideo: "pasta", tallarin: "pasta", harina: "conserva", cereales: "conserva",
  // Despensa
  conserva: "conserva", lata: "conserva", garbanzo: "alubias", lenteja: "alubias",
  alubia: "alubias", judia: "alubias", legumbre: "alubias", tarro: "tarro",
  mermelada: "tarro", salsa: "tarro", mayonesa: "tarro", ketchup: "tarro",
  miel: "miel", sal: "sal", azucar: "conserva", vinagre: "tarro",
  aceite: "aceituna", cafe: "cafe", cacao: "chocolate", colacao: "chocolate",
  caldo: "sopa", "frutos secos": "cacahuetes", cacahuete: "cacahuetes",
  nuez: "cacahuetes", almendra: "cacahuetes",
  // Dulces
  chocolate: "chocolate", galleta: "galleta", caramelo: "caramelo",
  chuche: "caramelo", piruleta: "piruleta", donut: "donut", tarta: "tarta",
  cupcake: "cupcake", magdalena: "cupcake", bizcocho: "tarta", pastel: "pastel",
  flan: "flan", natilla: "flan", palomita: "palomitas",
  // Bebidas
  te: "tetera", infusion: "tetera", mate: "mate", refresco: "refresco",
  cola: "refresco", zumo: "refresco", agua: "refresco", vino: "vino",
  cerveza: "cerveza", birra: "cerveza", coctel: "coctel", champan: "champan",
  cava: "champan", sidra: "champan",
  // Platos preparados
  pizza: "pizza", hamburguesa: "hamburguesa", sandwich: "sandwich",
  taco: "taco", burrito: "burrito", sushi: "sushi", ensalada: "ensalada",
  // Limpieza e higiene
  esponja: "esponja", estropajo: "esponja", detergente: "bote-spray",
  suavizante: "bote-spray", lavavajillas: "bote-spray", lejia: "bote-spray",
  limpiador: "bote-spray", limpiacristales: "bote-spray", amoniaco: "bote-spray",
  friegasuelos: "bote-spray", spray: "bote-spray", ambientador: "bote-spray",
  jabon: "jabon", gel: "jabon", champu: "bote-spray", acondicionador: "bote-spray",
  desodorante: "bote-spray", colonia: "bote-spray", perfume: "bote-spray",
  "papel higienico": "papel", "papel de cocina": "papel", papel: "papel",
  servilleta: "papel", "bolsa de basura": "papelera", basura: "papelera",
  fregona: "escoba", escoba: "escoba", bayeta: "esponja",
  "pasta de dientes": "diente", dentifrico: "diente",
  "cepillo de dientes": "cepillo-dientes", cuchilla: "maquinilla",
  maquinilla: "maquinilla", "maquinilla de afeitar": "maquinilla",
  tijeras: "tijeras", desatascador: "desatascador", compresa: "papel",
  panuelo: "papel", "papel aluminio": "bolsas", "papel film": "bolsas",
  "bolsa de congelacion": "bolsas", "bolsa de plastico": "bolsas",
  pintalabios: "pintalabios", maquillaje: "pintalabios", labial: "pintalabios",
  // Salud y farmacia
  medicamento: "pastilla", medicina: "pastilla", pastillas: "pastilla",
  ibuprofeno: "pastilla", paracetamol: "pastilla", aspirina: "pastilla",
  vitamina: "pastilla", analgesico: "pastilla", tirita: "tirita",
  aposito: "tirita", venda: "tirita", botiquin: "tirita", gasa: "tirita",
  jeringa: "jeringa", jeringuilla: "jeringa", termometro: "termometro",
  // Cocina / despensa extra
  sarten: "sarten", especias: "hierbas", especia: "hierbas", oregano: "hierbas",
  pimienta: "hierbas", comino: "hierbas", laurel: "hierbas", perejil: "hierbas",
  albahaca: "hierbas", condimento: "hierbas", castana: "castana",
  tetrabrik: "brik", "tetra brik": "brik",
  // Bebé y mascotas
  biberon: "biberon", papilla: "biberon", panal: "biberon", pienso: "huellas",
  gato: "gato", perro: "perro", mascota: "huellas", juguete: "peluche",
  peluche: "peluche", muneco: "peluche",
  // Otros / hogar
  bombilla: "bombilla", pila: "pila", bateria: "pila", hielo: "hielo",
  vela: "vela", velas: "vela", llave: "llave", llaves: "llave",
  martillo: "martillo", herramienta: "martillo", clavo: "martillo",
  tornillo: "martillo", destornillador: "martillo", bricolaje: "martillo",
};

const RULES: Array<[RegExp, string]> = Object.entries(KEYWORD_TO_SLUG)
  .filter(([, slug]) => isKnownIcon(slug))
  .sort((a, b) => b[0].length - a[0].length)
  .map(([kw, slug]) => [
    new RegExp("(^|[^a-z])" + kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
    slug,
  ]);

/**
 * Adivina el slug de icono a partir del nombre del producto, o null si no hay
 * ninguna regla que encaje. Determinista: mismo nombre → mismo icono siempre.
 */
export function guessProductIcon(name: string | null | undefined): string | null {
  if (!name) return null;
  const n = normalizeName(name);
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
