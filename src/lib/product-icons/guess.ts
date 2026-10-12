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
  // El pimiento a secas es el verde de Fluent; el rojo tiene que decirlo. Las
  // variedades van con "pimiento" delante porque "piquillo" empata en longitud
  // con "pimiento" y el empate lo gana la clave que se declaró antes.
  "pimiento rojo": "pimiento-rojo", "pimiento asado": "pimiento-rojo",
  "pimiento del piquillo": "pimiento-rojo", piquillo: "pimiento-rojo",
  "pimiento morron": "pimiento-rojo", "pimiento choricero": "pimiento-rojo",
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
  canonigos: "lechuga", rucula: "lechuga", endivia: "lechuga", cogollo: "lechuga",
  escarola: "lechuga", berros: "lechuga", apio: "lechuga", hinojo: "lechuga",
  espinaca: "lechuga", acelga: "lechuga", esparrago: "esparragos",
  trigueros: "esparragos", berenjena: "berenjena", remolacha: "remolacha",
  nabo: "zanahoria", chirivia: "zanahoria", rabano: "zanahoria",
  champinon: "champinon", seta: "champinon", portobello: "champinon",
  shiitake: "champinon", boletus: "champinon",
  aceituna: "aceituna", alcaparra: "aceituna", encurtido: "aceituna",
  piparra: "guindilla",
  jengibre: "jengibre",
  // Carne. Ojo: "filete", "lomo" y "solomillo" son DÉBILES (ver WEAK_KEYWORDS).
  carne: "carne", ternera: "carne", cerdo: "carne", "carne picada": "carne",
  filete: "carne", solomillo: "carne", lomo: "carne", conejo: "carne",
  carrillera: "carne", carrillada: "carne", entrecot: "carne",
  churrasco: "carne", codillo: "carne", "secreto iberico": "carne",
  "presa iberica": "carne", "pluma iberica": "carne",
  albondiga: "albondigas", tofu: "carne", seitan: "carne",
  pollo: "pollo",
  pavo: "pollo", pechuga: "pollo", muslo: "pollo", alitas: "pollo",
  costilla: "costilla", chuleta: "costilla",
  cordero: "costilla", bacon: "bacon", panceta: "bacon",
  // La salchicha fresca es el perrito; el embutido CURADO tiene su icono.
  salchicha: "perrito", butifarra: "perrito",
  chorizo: "chorizo", embutido: "chorizo", fuet: "chorizo",
  salchichon: "chorizo", longaniza: "chorizo", morcilla: "chorizo",
  sobrasada: "chorizo", chistorra: "chorizo", txistorra: "chorizo",
  "lomo embuchado": "chorizo",
  jamon: "jamon", paleta: "jamon", serrano: "jamon",
  // "jamon" empareja por prefijo y empieza antes que "pollo": sin esta clave el
  // jamoncito de pollo (el muslo) salía con la pata de serrano.
  jamoncito: "pollo",
  // El cocido y el de pavo son fiambre en lonchas, no la pata de serrano. Nada
  // de "pechuga de pavo" a secas: también es el filete fresco.
  "jamon cocido": "fiambre", "jamon york": "fiambre", york: "fiambre",
  fiambre: "fiambre", "pavo en lonchas": "fiambre",
  "pechuga de pavo en lonchas": "fiambre", mortadela: "fiambre",
  chopped: "fiambre", lacon: "fiambre",
  // Pescado y marisco
  pescado: "pescado", salmon: "salmon", merluza: "pescado",
  // "Atún" en una lista de la compra es casi siempre la lata; el fresco lo dice.
  atun: "atun", "atun fresco": "pescado", "lomo de atun": "pescado",
  ventresca: "atun", melva: "atun", "bonito del norte": "atun",
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
  cuajada: "yogur", bifidus: "yogur", actimel: "yogur", danacol: "yogur",
  nata: "leche", batido: "leche",
  queso: "queso", requeson: "queso", mascarpone: "queso", mozzarella: "queso",
  huevo: "huevo", mantequilla: "mantequilla",
  margarina: "mantequilla", helado: "helado",
  // Panadería y cereales
  // El pan rallado se vende en bolsa o en caja de cartón, no en lata.
  pan: "pan", "pan de molde": "pan", "pan rallado": "harina", hogaza: "pan",
  // Siguen siendo pan. Desde que gana la clave que empieza antes ya salía así sin
  // estas dos; se dejan porque documentan el caso y no cuestan nada.
  "pan de cereales": "pan", "pan de hamburguesa": "pan",
  // "pan" empieza antes que "pita": el compuesto necesita su propia clave.
  "pan de pita": "pan-plano",
  baguette: "baguette", croissant: "croissant", bagel: "bagel",
  pretzel: "pretzel", tortita: "tortitas", gofre: "gofre", pita: "pan-plano",
  // Las tortillas de trigo/maíz son pan plano, no la tortilla de patatas. Ganan
  // por longitud a la regla "tortilla" de más abajo.
  "tortilla de trigo": "pan-plano", "tortillas de trigo": "pan-plano",
  "tortilla de maiz": "pan-plano", "tortillas de maiz": "pan-plano",
  fajita: "pan-plano", "tortitas para fajitas": "pan-plano",
  arroz: "arroz", pasta: "pasta", macarron: "pasta", espagueti: "pasta",
  fideo: "pasta", tallarin: "pasta", espiral: "pasta", helice: "pasta",
  penne: "pasta", fusilli: "pasta", tortellini: "pasta", ravioli: "pasta",
  lasana: "pasta", canelon: "pasta", noqui: "pasta", gnocchi: "pasta",
  ramen: "fideos", noodle: "fideos",
  harina: "harina", bicarbonato: "harina",
  cuscus: "arroz", quinoa: "arroz", bulgur: "arroz",
  cereales: "cereales", cereal: "cereales", muesli: "cereales",
  granola: "cereales", avena: "cereales",
  tostada: "pan", biscote: "pan", picos: "pan", colines: "pan", regana: "pan",
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
  // El caldo DE algo es caldo: "pollo" y "pescado" le ganaban por longitud y salía
  // un muslo, y "pastillas" (de caldo) le daba el icono del MEDICAMENTO.
  "caldo de pollo": "sopa", "caldo de pescado": "sopa", "caldo de carne": "sopa",
  "caldo de verduras": "sopa", "caldo en pastillas": "sopa",
  "pastillas de caldo": "sopa",
  // "crema" sola es un guiso (de calabacín, de verduras, de champiñones). Como
  // empieza antes que cualquier ingrediente, TODAS las demás cremas necesitan su
  // clave de varias palabras: la dulce, la de untar, la de cocina y la cosmética.
  crema: "sopa", "crema catalana": "flan",
  "crema de cacahuete": "cacahuetes", "crema de cacao": "chocolate",
  "crema de leche": "leche", "crema de queso": "queso",
  "crema hidratante": "bote-spray", "crema facial": "bote-spray",
  "crema solar": "bote-spray",
  // Postre lácteo en tarrina, no un plato de arroz ni un vaso de leche.
  "arroz con leche": "yogur",
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
  // Nada de "moscatel" a secas: también es uva de mesa.
  agua: "agua", vino: "vino", "pedro ximenez": "vino", jerez: "vino",
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
  // "ensalada" no es prefijo de "ensaladilla" (ensalad-A / ensalad-I).
  ensaladilla: "ensalada",
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

/**
 * Cortes que dicen CÓMO viene la pieza y no de QUÉ es: «filete», «lomo» y
 * «solomillo» se dicen igual de cerdo que de pollo o de salmón. Como claves
 * normales le ganaban por longitud al animal —«Filete de pollo» salía con el
 * chuletón, «Lubina en filete» también y «Lomo de salmón» nunca llegaba al
 * salmón—, así que solo cuentan cuando el nombre no trae nada más concreto. Lo
 * que sí tiene sentido con el corte delante va como clave de varias palabras
 * («lomo embuchado», «lomo de atún»), que no es débil. «Taco» entra por lo
 * mismo: en la carnicería es un corte («tacos de ternera», «lomo en taco»), y
 * solo cuando no acompaña a nada es el taco mexicano.
 */
const WEAK_KEYWORDS = new Set([
  "filete", "lomo", "solomillo", "taco",
  // Lo mismo con el ENVASE: «lata», «tarro» y «conserva» dicen cómo viene, no
  // qué es. Antes «Lata de atún» salía con el atún solo por un empate de longitud
  // que decidía el orden en que se declararon las claves, y «Tarro de miel» con el
  // tarro porque le ganaba por longitud a «miel».
  "lata", "tarro", "conserva",
  // «Zumo de naranja» es la naranja a propósito (el diccionario ya lo contaba): el
  // zumo solo se queda con el brik cuando no dice de qué es.
  "zumo",
]);

type Rule = { re: RegExp; slug: string; len: number; weak: boolean };

const RULES: Rule[] = Object.entries(KEYWORD_TO_SLUG)
  .filter(([, slug]) => isKnownIcon(slug))
  .map(([kw, slug]): [string, string] => [forMatching(normalizeName(kw)), slug])
  .map(([kw, slug]) => ({
    re: keywordPattern(kw),
    slug,
    len: kw.length,
    weak: WEAK_KEYWORDS.has(kw),
  }));

/**
 * Adivina el slug de icono a partir del nombre del producto, o null si no hay
 * ninguna regla que encaje. Determinista: mismo nombre → mismo icono siempre.
 *
 * Entre las claves que encajan gana, por este orden:
 *  1. la que NO es débil (ver WEAK_KEYWORDS);
 *  2. la que EMPIEZA ANTES en el nombre: en español el núcleo va delante y lo
 *     que viene detrás de «de/con» es el ingrediente o el sabor. Por eso
 *     «Galletas de chocolate» es una galleta y «Café con leche», un café; con
 *     «gana la más larga» salía la tableta de chocolate y el vaso de leche;
 *  3. la más LARGA, que es lo que mantiene a «pasta de dientes» por delante de
 *     «pasta»: las dos empiezan en el mismo sitio;
 *  4. el orden de declaración, para que un empate no dependa del motor.
 *
 * Lo que arrastra la posición y no es obvio: un producto compuesto cuya clave
 * corta empieza antes que la que lo define ("pan" antes que "pita") necesita su
 * propia clave de varias palabras ("pan de pita"), que empieza en el mismo sitio
 * y gana por longitud. Los compuestos conocidos ya las tienen; `check:adivina`
 * fija los que más se compran.
 */
export function guessProductIcon(name: string | null | undefined): string | null {
  if (!name) return null;
  const n = forMatching(normalizeName(name));
  if (!n) return null;
  let best: { slug: string; start: number; len: number; weak: boolean } | null =
    null;
  for (const r of RULES) {
    const m = r.re.exec(n);
    if (!m) continue;
    // El patrón empieza por `(^|[^a-z])`: el carácter previo no cuenta.
    const start = m.index + m[1].length;
    if (
      !best ||
      Number(r.weak) < Number(best.weak) ||
      (r.weak === best.weak &&
        (start < best.start || (start === best.start && r.len > best.len)))
    ) {
      best = { slug: r.slug, start, len: r.len, weak: r.weak };
    }
  }
  return best ? best.slug : null;
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
