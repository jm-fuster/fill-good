import { ICON_VIEWBOXES } from "./slugs";

/**
 * Catálogo de iconos de producto (L16). Presenta los slugs del registro agrupados
 * en secciones legibles para el selector, con etiqueta en español y palabras clave
 * para el buscador. El registro (`ICON_BODIES`) es la fuente de verdad de qué
 * iconos existen; este archivo solo los ordena y nombra para la UI. Lo consulta a
 * través de `slugs.ts`, que se genera del registro, porque este módulo llega al
 * navegador y el registro no debe (ver `scripts/gen-product-icon-sprite.mjs`).
 *
 * Estilo propio: iconos a color plano de Fluent Emoji Flat (MIT) más catorce
 * dibujados para la app en la misma gramática visual. Cada SVG trae sus propios
 * rellenos, así que el color no depende del tema: es lo que permite distinguir de un
 * vistazo un tomate de una manzana.
 */

/** Icono genérico de reserva cuando no hay slug ni categoría reconocibles. */
export const DEFAULT_ICON_SLUG = "paquete";

export type IconSection = { title: string; slugs: string[] };

export const ICON_SECTIONS: IconSection[] = [
  {
    title: "Fruta",
    slugs: [
      "manzana", "manzana-verde", "platano", "naranja", "limon", "lima", "fresa", "frambuesa",
      "uvas", "sandia", "pina", "pera", "melocoton", "ciruela", "cerezas",
      "melon", "kiwi", "mango", "coco", "arandanos", "aguacate",
    ],
  },
  {
    title: "Verdura",
    slugs: [
      "zanahoria", "tomate", "patata", "boniato", "cebolla", "ajo", "puerro", "pimiento",
      "guindilla", "brocoli", "coliflor", "col", "maiz", "guisantes",
      "pepino", "calabacin", "calabaza", "lechuga", "esparragos", "berenjena", "remolacha",
      "champinon", "aceituna", "jengibre",
    ],
  },
  {
    title: "Carne",
    slugs: ["carne", "pollo", "costilla", "bacon", "jamon", "perrito"],
  },
  {
    title: "Pescado y marisco",
    slugs: [
      "pescado", "gamba", "cangrejo", "langosta", "calamar", "pulpo",
      "ostra", "surimi",
    ],
  },
  {
    title: "Lácteos y huevos",
    slugs: ["leche", "yogur", "queso", "huevo", "mantequilla", "helado", "helado-cucurucho"],
  },
  {
    title: "Panadería",
    slugs: ["pan", "pan-plano", "baguette", "croissant", "bagel", "pretzel", "tortitas", "gofre"],
  },
  {
    title: "Despensa",
    slugs: [
      "arroz", "pasta", "cereales", "conserva", "tarro", "aceite", "miel", "sal", "sarten",
      "hierbas", "harina", "cacahuetes", "castana", "alubias",
    ],
  },
  {
    title: "Dulces",
    slugs: [
      "chocolate", "galleta", "caramelo", "piruleta", "donut", "tarta",
      "cupcake", "pastel", "flan", "palomitas", "dango",
    ],
  },
  {
    title: "Bebidas",
    slugs: [
      "agua", "cafe", "tetera", "mate", "refresco", "brik", "te-burbujas", "vaso",
      "vino", "cerveza", "copas", "coctel", "champan",
    ],
  },
  {
    title: "Platos preparados",
    slugs: [
      "pizza", "hamburguesa", "patatas-fritas", "sandwich", "taco",
      "burrito", "sushi", "sopa", "fideos", "ensalada",
      "paella", "tortilla", "empanadilla",
    ],
  },
  {
    title: "Limpieza e higiene",
    slugs: [
      "esponja", "jabon", "cubo", "papelera", "escoba", "desatascador",
      "papel", "bote-spray", "burbujas", "wc", "bolsas", "cesta", "guantes",
      "cepillo-dientes", "diente", "maquinilla", "tijeras", "pintalabios",
    ],
  },
  {
    title: "Salud y farmacia",
    slugs: ["pastilla", "tirita", "jeringa", "termometro"],
  },
  {
    title: "Bebé y mascotas",
    slugs: ["biberon", "peluche", "huellas", "hueso", "perro", "gato"],
  },
  {
    title: "Otros",
    slugs: [
      "hielo", "vela", "cerilla", "llave", "martillo", "carrito", "paquete",
      "bombilla", "pila", "aguja", "regalo",
    ],
  },
];

/** Etiqueta legible de cada slug (para aria-label y tooltip del selector). */
export const ICON_LABELS: Record<string, string> = {
  manzana: "Manzana", "manzana-verde": "Manzana verde", platano: "Plátano",
  naranja: "Naranja", limon: "Limón", fresa: "Fresa", uvas: "Uvas",
  sandia: "Sandía", pina: "Piña", pera: "Pera", melocoton: "Melocotón",
  cerezas: "Cerezas", melon: "Melón", kiwi: "Kiwi", mango: "Mango",
  coco: "Coco", arandanos: "Arándanos", aguacate: "Aguacate",
  zanahoria: "Zanahoria", tomate: "Tomate", patata: "Patata",
  cebolla: "Cebolla", ajo: "Ajo", pimiento: "Pimiento", guindilla: "Guindilla",
  brocoli: "Brócoli", maiz: "Maíz", pepino: "Pepino", lechuga: "Lechuga",
  berenjena: "Berenjena", champinon: "Champiñón", aceituna: "Aceituna",
  jengibre: "Jengibre",
  carne: "Carne", pollo: "Pollo", costilla: "Costilla", bacon: "Bacon",
  perrito: "Salchicha",
  pescado: "Pescado", gamba: "Gamba", cangrejo: "Cangrejo", langosta: "Langosta",
  calamar: "Calamar", ostra: "Ostra",
  leche: "Leche", queso: "Queso", huevo: "Huevo", mantequilla: "Mantequilla",
  helado: "Helado", "helado-cucurucho": "Cucurucho",
  pan: "Pan", "pan-plano": "Pan de pita", baguette: "Baguette",
  croissant: "Croissant", bagel: "Bagel", pretzel: "Pretzel",
  tortitas: "Tortitas", gofre: "Gofre",
  arroz: "Arroz", pasta: "Pasta", conserva: "Conserva", tarro: "Tarro",
  miel: "Miel", sal: "Sal", cacahuetes: "Frutos secos", alubias: "Legumbres",
  chocolate: "Chocolate", galleta: "Galleta", caramelo: "Caramelo",
  piruleta: "Piruleta", donut: "Donut", tarta: "Tarta", cupcake: "Cupcake",
  pastel: "Pastel", flan: "Flan", palomitas: "Palomitas", dango: "Brocheta dulce",
  cafe: "Café", tetera: "Té", mate: "Mate", refresco: "Refresco",
  "te-burbujas": "Té con burbujas", vaso: "Vaso", vino: "Vino",
  cerveza: "Cerveza", copas: "Brindis", coctel: "Cóctel", champan: "Champán",
  pizza: "Pizza", hamburguesa: "Hamburguesa", "patatas-fritas": "Patatas fritas",
  sandwich: "Sándwich", taco: "Taco", burrito: "Burrito", sushi: "Sushi",
  sopa: "Guiso", fideos: "Fideos", ensalada: "Ensalada",
  esponja: "Esponja", jabon: "Jabón", cubo: "Cubo", escoba: "Escoba",
  papel: "Papel", "bote-spray": "Detergente", burbujas: "Burbujas",
  wc: "Baño", cesta: "Cesta", "cepillo-dientes": "Cepillo de dientes",
  diente: "Dentífrico",
  biberon: "Biberón", huellas: "Mascotas", hueso: "Hueso", perro: "Perro",
  gato: "Gato",
  hielo: "Hielo", paquete: "Genérico", bombilla: "Bombilla", pila: "Pila",
  aguja: "Costura", regalo: "Regalo",
  // Ampliación L16b
  sarten: "Sartén", hierbas: "Especias", castana: "Castaña", brik: "Brik",
  papelera: "Basura", desatascador: "Desatascador", bolsas: "Bolsas",
  maquinilla: "Maquinilla", tijeras: "Tijeras", pintalabios: "Cosmética",
  pastilla: "Medicamento", tirita: "Tirita", jeringa: "Jeringa",
  termometro: "Termómetro", peluche: "Juguete", vela: "Vela", llave: "Llave",
  martillo: "Herramientas", carrito: "Carrito", cerilla: "Cerillas",
  // Ampliación L16c (fruta/verdura)
  lima: "Lima", frambuesa: "Frambuesa", ciruela: "Ciruela", guisantes: "Guisantes",
  puerro: "Puerro", col: "Col", calabaza: "Calabaza",
  esparragos: "Espárragos", remolacha: "Remolacha",
  // Ampliación L16d
  yogur: "Yogur", agua: "Agua", aceite: "Aceite", harina: "Harina y azúcar",
  jamon: "Jamón", tortilla: "Tortilla", calabacin: "Calabacín",
  coliflor: "Coliflor", boniato: "Boniato", paella: "Paella", pulpo: "Pulpo",
  surimi: "Surimi", empanadilla: "Empanadilla", cereales: "Cereales",
  // Ampliación L16f
  guantes: "Guantes",
};

/** Sinónimos de búsqueda por slug (además de la etiqueta). Normalizados aparte. */
export const ICON_KEYWORDS: Record<string, string> = {
  "manzana-verde": "manzana verde granny smith golden",
  platano: "banana", naranja: "mandarina clementina", uvas: "uva racimo",
  cacahuetes: "cacahuete nueces almendras frutos secos",
  alubias: "judias lentejas garbanzos legumbre",
  perrito: "salchicha chorizo frankfurt embutido",
  carne: "filete ternera cerdo picada solomillo",
  pollo: "muslo ave pavo",
  costilla: "chuleta cordero",
  leche: "nata lacteo batido",
  queso: "quesos lonchas rallado",
  pescado: "salmon merluza atun sardina lubina dorada",
  gamba: "gambas langostinos marisco",
  pan: "hogaza barra molde",
  arroz: "arroz risotto",
  pasta: "macarrones espaguetis fideos tallarines",
  conserva: "lata bote atun tomate frito maiz",
  tarro: "bote mermelada salsa mayonesa mostaza ketchup pate hummus encurtidos",
  cafe: "te infusion cafe",
  refresco: "cola bebida vaso",
  vino: "tinto blanco copa",
  cerveza: "birra cerveza",
  "patatas-fritas": "chips aperitivo",
  "bote-spray": "detergente lavavajillas suavizante lejia limpiador desodorante gel champu spray limpieza",
  jabon: "jabon gel pastilla",
  papel: "papel higienico cocina rollo servilletas",
  cubo: "basura fregona cubo",
  "cepillo-dientes": "cepillo dental",
  diente: "pasta dentifrico dientes",
  huellas: "mascota perro gato pienso",
  aguacate: "guacamole",
  chocolate: "cacao colacao tableta bombones",
  paquete: "otros generico caja producto",
  sarten: "cocina cacerola olla freir",
  hierbas: "especias especia oregano pimienta comino laurel perejil albahaca romero sal condimento curry pimenton azafran canela",
  castana: "castanas frutos secos nuez",
  brik: "tetrabrik carton zumo caldo leche",
  papelera: "basura residuos bolsa cubo",
  desatascador: "atasco desatascar",
  bolsas: "bolsa plastico congelacion zip",
  maquinilla: "cuchilla afeitar afeitado rasuradora",
  tijeras: "tijera cortar",
  pintalabios: "cosmetica maquillaje labial rimel",
  pastilla: "medicamento pastillas ibuprofeno paracetamol aspirina medicina farmacia analgesico vitamina",
  tirita: "tiritas aposito venda cura botiquin gasa",
  jeringa: "jeringuilla inyeccion vacuna",
  termometro: "fiebre temperatura",
  peluche: "juguete juguetes muneco osito",
  vela: "velas cera",
  cerilla: "cerillas fosforos mechero encender fuego",
  llave: "llaves candado",
  martillo: "herramienta herramientas clavo tornillo bricolaje destornillador",
  carrito: "carro compra",
  lima: "limon verde",
  frambuesa: "mora arandano frutos rojos",
  ciruela: "ciruelas",
  guisantes: "guisante vaina judias verdes",
  puerro: "puerros",
  col: "repollo lombarda coles bruselas",
  calabaza: "calabacin",
  esparragos: "esparrago trigueros",
  remolacha: "remolachas",
  yogur: "yogures yogurt griego desnatado lacteo",
  agua: "agua mineral botella garrafa",
  aceite: "aceite oliva girasol virgen extra",
  harina: "harina azucar reposteria levadura",
  jamon: "jamon serrano iberico curado paleta",
  tortilla: "tortilla patatas espanola",
  calabacin: "calabacines",
  coliflor: "coliflores",
  boniato: "batata boniatos",
  paella: "paellera guiso arroz",
  pulpo: "pulpos",
  surimi: "palitos cangrejo surimi",
  empanadilla: "empanadillas empanada gyoza",
  cereales: "cereal muesli avena granola desayuno bol",
  ostra: "ostras mejillones berberechos almejas navajas vieiras percebes concha bivalvo",
  champinon: "champinones setas seta portobello shiitake",
  vaso: "whisky ron ginebra vodka vermut licor copa",
  guantes: "guante fregar latex vinilo",
};

/** ¿Existe un icono con este slug en el registro? Fuente de verdad para validar. */
export function isKnownIcon(slug: string | null | undefined): boolean {
  return (
    typeof slug === "string" &&
    Object.prototype.hasOwnProperty.call(ICON_VIEWBOXES, slug)
  );
}
