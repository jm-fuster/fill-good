# Genera el registro de iconos de producto.
#
# Fuentes (TODAS a color plano y con la misma gramatica visual):
#   - Fluent Emoji Flat (MIT) por defecto, via la API de Iconify.
#   - Dibujos propios en assets/product-icons/*.svg (p='local') para los 19 conceptos
#     que no existen a color en NINGUN set abierto: se revisaron las 41 colecciones
#     de Iconify con palette=true. Son originales de esta app, sin licencia de
#     terceros que atribuir. Los 8 de L16d se comprobaron ademas contra el listado
#     completo de fluent-emoji-flat (3145 nombres): no hay yogur, botella de agua,
#     aceite, jamon, tortilla, bolsa de harina, coliflor ni calabacin.
#   - Donantes recoloreados con el campo 's': una ciruela es el melocoton de Fluent
#     en morado, un pimiento rojo es su pimiento verde y unas albondigas son su
#     falafel con el interior de carne. Reutilizar el artwork de Microsoft encaja
#     mejor que redibujarlo cuando el producto real comparte forma con el donante.
#
# Antes esta cola venia de Game Icons (CC-BY 3.0), pero eran siluetas de UN solo
# color y desentonaban entre ilustraciones de 2-4 colores. Ya no se usa ningun SVG
# de Game Icons: por eso su atribucion CC-BY salio de Ajustes > Acerca de. Si
# vuelves a meter uno, la atribucion es OBLIGATORIA y hay que reponerla.
#
# Cada concepto se sanea y se guarda { vb (viewBox), body } bajo una clave estable
# propia. Hoy todas las fuentes son de 32x32, pero el viewBox se sigue guardando por
# icono para que meter un set con otro lienzo no obligue a migrar nada.
# ASCII-only por PS 5.1.
#
# COLOR: todos los SVG traen sus propios rellenos, asi que NO se tinen con
# currentColor. Un icono que llegue en monocromo se rechaza (sale en MISS): teniria
# con el color del texto y cantaria al lado del resto.
#
# REGLA al elegir un color a mano (en los dibujos propios o en un swap): tiene que
# verse en los DOS temas, o sea superar 2.2:1 contra la tarjeta clara y contra la
# oscura. Los fondos que se miden son los REALES de --card: #FFFFFF en claro (blanco
# puro, el peor caso; no #faf9f5) y #131A15 en oscuro, convertidos de los oklch de
# globals.css. Los verdes y amarillos claros de Fluent (#86D72F, #C3EF3C, #00D26A)
# lucen en oscuro y se pierden en claro (1.3-2.0:1): no valen como color UNICO de una
# figura, solo acompanados de un tono oscuro que la defina.
#
# Y ya no es solo una nota al margen: Test-IconContrast la COMPRUEBA en cada
# generacion y manda a MISS el dibujo propio o el swap que no la cumpla, asi que un
# color mal elegido no puede colarse en el registro. Ha pasado dos veces: 'huellas'
# venia en #321B41 (1.17:1 en oscuro, invisible) y lleva swap a #8D65C5; y
# 'manzana-verde' venia con cuerpo #86D72F y hoja #00D26A -- los dos en la lista
# negra de arriba -- asi que en claro daba 1.8:1 justo cuando su unico trabajo es
# distinguirse de la manzana roja: lleva swap a cuerpo #5AB557 y hoja #008463 (el
# verde oscuro que ya usan fresa, tomate y lechuga para los rabos).
#
# Los PALIDOS de Fluent (oct-2026). La comprobacion solo se aplica a los colores que
# elegimos nosotros, y el artwork de Fluent entraba tal cual: 14 glifos suyos se
# lavaban en claro (leche 1.4:1, ajo 1.5, mantequilla 1.6, queso 1.8, platano,
# huevo, baguette 1.9...). Ya no es una decision pendiente: los de comida y bebida
# llevan un swap que oscurece SOLO el tono que dibuja la silueta (el vaso de la
# leche, la corteza de la baguette, el canto del plato de la mantequilla), en su
# misma familia, y con eso pasan la regla como cualquier otro swap. El cuerpo que
# dice QUE es no se toca: el queso sigue amarillo y la leche blanca. Quedan fuera,
# a proposito: 'limon' (dos formas planas sin borde ni sombra: el unico tono que
# dibuja la silueta es el amarillo que lo hace limon), y 'llave' y 'wc', que no son
# comida. Esos tres no se pongan donde el icono sea la prueba de algo (la landing).
#
# NOTA: no hay fallback de busqueda difusa a proposito. Si un nombre desaparece del
# set, el concepto sale en MISS; antes se sustituia en silencio por el primer
# resultado de buscar la clave en espanol, que es como colar un icono al azar.

$ErrorActionPreference = "Stop"
$default = "fluent-emoji-flat"

$concepts = @(
  @{k='manzana'; f='red-apple'},
  # El verde claro de Fluent se lava sobre tarjeta blanca (1.8:1) y esta manzana
  # existe justo para NO confundirse con la roja: cuerpo y hoja bajan a un verde que
  # se ve en los dos temas. Lo verifica Test-IconContrast.
  @{k='manzana-verde'; f='green-apple'; s=@{'#86D72F'='#5AB557'; '#00D26A'='#008463'}},
  # Palidos de Fluent (ver la cabecera): se oscurece el tono de silueta.
  # Platano: las dos solapas de detras y la linea de la piel pasan a ambar; el rabo,
  # al ocre de las sombras de pan.
  @{k='platano'; f='banana'; s=@{'#F9C23C'='#ED9200'; '#F3AD61'='#D3883E'}},
  @{k='naranja'; f='tangerine'}, @{k='limon'; f='lemon'}, @{k='fresa'; f='strawberry'},
  @{k='uvas'; f='grapes'}, @{k='sandia'; f='watermelon'}, @{k='pina'; f='pineapple'},
  # Pera: el cuerpo neon (#C3EF3C, 1.3:1) baja a un verde pera de la misma tonalidad
  # y la hoja al verde oscuro de los rabos (#008463).
  @{k='pera'; f='pear'; s=@{'#C3EF3C'='#91BA15'; '#00D26A'='#008463'}},
  @{k='melocoton'; f='peach'}, @{k='cerezas'; f='cherries'},
  @{k='melon'; f='melon'}, @{k='kiwi'; f='kiwi-fruit'},
  @{k='mango'; f='mango'; s=@{'#FFB02E'='#F5961E'}},
  @{k='coco'; f='coconut'}, @{k='arandanos'; f='blueberries'}, @{k='aguacate'; f='avocado'},
  @{k='zanahoria'; f='carrot'}, @{k='tomate'; f='tomato'}, @{k='patata'; f='potato'},
  # Ajo: la piel exterior (toda la silueta) pasa a gris lila, el de un ajo morado.
  # Se probo el ocre (#E19747), que es lo que oscurece "en su familia", y al lado
  # de 'cebolla' --ocre con vetas-- eran el mismo bulbo: el lila es lo que los separa.
  @{k='cebolla'; f='onion'}, @{k='ajo'; f='garlic'; s=@{'#FFCE7C'='#A89BB5'}},
  @{k='pimiento'; f='bell-pepper'},
  # El pimiento de Fluent es VERDE, y el de la cocina espanola (sofrito, asados) es
  # el rojo: mismo glifo con el cuerpo en rojos y el rabo en verde.
  @{k='pimiento-rojo'; f='bell-pepper'; s=@{'#C3EF3C'='#00D26A'; '#44911B'='#CA0B4A'; '#008463'='#F8312F'}},
  @{k='guindilla'; f='hot-pepper'}, @{k='brocoli'; f='broccoli'}, @{k='maiz'; f='ear-of-corn'},
  @{k='pepino'; f='cucumber'}, @{k='lechuga'; f='leafy-green'}, @{k='berenjena'; f='eggplant'},
  # OJO: 'mushroom' a secas es el matamoscas rojo de lunares (Amanita muscaria),
  # que no se compra en ningun sitio. El champinon comestible es 'brown-mushroom'.
  @{k='champinon'; f='brown-mushroom'}, @{k='aceituna'; f='olive'}, @{k='jengibre'; f='ginger-root'},
  @{k='cacahuetes'; f='peanuts'}, @{k='alubias'; f='beans'},
  @{k='carne'; f='cut-of-meat'}, @{k='pollo'; f='poultry-leg'}, @{k='costilla'; f='meat-on-bone'},
  @{k='bacon'; f='bacon'}, @{k='perrito'; f='hot-dog'},
  @{k='pescado'; f='fish'}, @{k='gamba'; f='shrimp'}, @{k='cangrejo'; f='crab'},
  @{k='langosta'; f='lobster'}, @{k='calamar'; f='squid'}, @{k='ostra'; f='oyster'},
  # Leche: el vaso es lo unico que dibuja la silueta; la leche sigue blanca.
  @{k='leche'; f='glass-of-milk'; s=@{'#AEDDFF'='#00A6ED'}},
  # Queso: la cara de arriba y los agujeros (el tono de sombra), no los costados.
  @{k='queso'; f='cheese-wedge'; s=@{'#FFB02E'='#E19747'}},
  # Huevo: una sola forma de un solo color, asi que es el cuerpo: huevo moreno.
  @{k='huevo'; f='egg'; s=@{'#F3AD61'='#E19747'}},
  # Mantequilla: el canto del plato cierra el contorno de abajo.
  @{k='mantequilla'; f='butter'; s=@{'#D3D3D3'='#9B9B9B'; '#F9C23C'='#FFB02E'}},
  @{k='helado'; f='ice-cream'}, @{k='helado-cucurucho'; f='soft-ice-cream'},
  @{k='pan'; f='bread'}, @{k='croissant'; f='croissant'},
  # Baguette: la corteza es a la vez cuerpo y silueta; los cortes siguen crema.
  @{k='baguette'; f='baguette-bread'; s=@{'#F3AD61'='#D3883E'}},
  @{k='bagel'; f='bagel'}, @{k='pretzel'; f='pretzel'}, @{k='tortitas'; f='pancakes'},
  @{k='arroz'; f='cooked-rice'}, @{k='pasta'; f='spaghetti'}, @{k='gofre'; f='waffle'},
  @{k='pan-plano'; f='flatbread'},
  @{k='conserva'; f='canned-food'}, @{k='miel'; f='honey-pot'}, @{k='sal'; f='salt'},
  @{k='tarro'; f='jar'},
  @{k='chocolate'; f='chocolate-bar'}, @{k='galleta'; f='cookie'}, @{k='caramelo'; f='candy'},
  @{k='piruleta'; f='lollipop'}, @{k='donut'; f='doughnut'}, @{k='tarta'; f='shortcake'},
  @{k='cupcake'; f='cupcake'}, @{k='palomitas'; f='popcorn'}, @{k='pastel'; f='pie'},
  @{k='flan'; f='custard'}, @{k='dango'; f='dango'},
  @{k='cafe'; f='hot-beverage'}, @{k='vino'; f='wine-glass'},
  # Jarras: el cristal que rodea la cerveza al azul de la leche; en 'copas' las
  # asas quedan un punto mas oscuras que el cristal, como en el original.
  @{k='cerveza'; f='beer-mug'; s=@{'#AEDDFF'='#00A6ED'; '#83CBFF'='#00A6ED'}},
  @{k='refresco'; f='cup-with-straw'}, @{k='coctel'; f='tropical-drink'},
  @{k='champan'; f='bottle-with-popping-cork'}, @{k='tetera'; f='teapot'}, @{k='mate'; f='mate'},
  @{k='vaso'; f='tumbler-glass'},
  @{k='copas'; f='clinking-beer-mugs'; s=@{'#AEDDFF'='#00A6ED'; '#83CBFF'='#0084CE'}},
  @{k='te-burbujas'; f='bubble-tea'},
  @{k='hielo'; f='ice'},
  @{k='jabon'; f='soap'}, @{k='esponja'; f='sponge'}, @{k='cubo'; f='bucket'},
  @{k='escoba'; f='broom'}, @{k='papel'; f='roll-of-paper'}, @{k='bote-spray'; f='lotion-bottle'},
  @{k='wc'; f='toilet'}, @{k='burbujas'; f='bubbles'}, @{k='cesta'; f='basket'},
  @{k='cepillo-dientes'; f='toothbrush'}, @{k='diente'; f='tooth'},
  @{k='biberon'; f='baby-bottle'},
  @{k='huellas'; f='paw-prints'; s=@{'#321B41'='#8D65C5'}},
  @{k='hueso'; f='bone'}, @{k='perro'; f='dog-face'},
  @{k='gato'; f='cat-face'},
  @{k='paquete'; f='package'}, @{k='bombilla'; f='light-bulb'}, @{k='pila'; f='battery'},
  @{k='aguja'; f='sewing-needle'}, @{k='regalo'; f='wrapped-gift'},
  @{k='pizza'; f='pizza'}, @{k='hamburguesa'; f='hamburger'}, @{k='patatas-fritas'; f='french-fries'},
  @{k='taco'; f='taco'}, @{k='sushi'; f='sushi'}, @{k='sopa'; f='pot-of-food'},
  @{k='ensalada'; f='green-salad'}, @{k='sandwich'; f='sandwich'}, @{k='burrito'; f='burrito'},
  @{k='fideos'; f='steaming-bowl'},
  # Ampliacion L16b
  @{k='pastilla'; f='pill'}, @{k='tirita'; f='adhesive-bandage'}, @{k='jeringa'; f='syringe'},
  @{k='termometro'; f='thermometer'},
  @{k='castana'; f='chestnut'}, @{k='hierbas'; f='herb'},
  @{k='sarten'; f='cooking'}, @{k='brik'; f='beverage-box'},
  @{k='papelera'; f='wastebasket'}, @{k='maquinilla'; f='razor'}, @{k='tijeras'; f='scissors'},
  @{k='desatascador'; f='plunger'}, @{k='pintalabios'; f='lipstick'},
  @{k='vela'; f='candle'}, @{k='bolsas'; f='shopping-bags'}, @{k='carrito'; f='shopping-cart'},
  @{k='llave'; f='key'}, @{k='martillo'; f='hammer'}, @{k='peluche'; f='teddy-bear'},
  # Ampliacion L16c - fruta/verdura: lo ultimo que queda en Fluent
  @{k='lima'; f='lime'}, @{k='guisantes'; f='pea-pod'},
  # Donantes de Fluent recoloreados: misma forma real, otra paleta.
  @{k='ciruela'; f='peach'; s=@{'#FF822D'='#8D65C5'; '#FF6723'='#6B438B'}},
  # La frambuesa fue los arandanos de Fluent en rojo hasta oct-2026, y en la prueba
  # a ciegas dos de tres la llamaron GRANADA: las coronas de cinco puntas de los
  # arandanos son la corona de la granada. Ahora es dibujo propio (cupula de drupas).
  @{k='frambuesa'; f='frambuesa'; p='local'},
  # Dibujos propios (assets/product-icons/), en la gramatica de Fluent: pocas formas
  # grandes, rellenos planos, sin trazos ni degradados, y un tono oscuro que defina
  # la figura sobre fondo claro.
  @{k='calabaza'; f='calabaza'; p='local'},
  @{k='esparragos'; f='esparragos'; p='local'},
  @{k='col'; f='col'; p='local'},
  @{k='remolacha'; f='remolacha'; p='local'},
  @{k='puerro'; f='puerro'; p='local'},
  # 'matchstick' no existe en Fluent Flat (ni en High Contrast). La caja de cerillas
  # se reconoce mejor como producto de compra que una cerilla suelta.
  @{k='cerilla'; f='cerilla'; p='local'},
  # --- Ampliacion L16d ---------------------------------------------------------
  # Glifos de Fluent que ya existian y no estabamos usando. Antes estos productos
  # caian en un icono prestado que enganaba: el boniato en 'patata', el pulpo en
  # 'calamar', los cereales en 'conserva' (una lata).
  @{k='boniato'; f='roasted-sweet-potato'}, @{k='paella'; f='shallow-pan-of-food'},
  @{k='pulpo'; f='octopus'}, @{k='surimi'; f='fish-cake-with-swirl'},
  @{k='cereales'; f='bowl-with-spoon'},
  # La empanadilla es uno de los palidos de Fluent: sus tres tonos son crema y el
  # mejor daba 1.92:1 sobre tarjeta blanca. El swap oscurece SOLO el borde, que es
  # el que dibuja la silueta; el relleno se queda como esta. Lo verifica
  # Test-IconContrast, que con el swap ya si se aplica a este icono.
  @{k='empanadilla'; f='dumpling'; s=@{'#F3AD61'='#D3883E'}},
  # Dibujos propios L16d. Los siete primeros son productos de peso en una compra
  # espanola que no tienen glifo en ningun sitio; 'calabacin' se separa de 'calabaza'
  # porque no se parecen ni en forma ni en color, y 'coliflor' de 'brocoli' porque
  # solo se distinguen por el color de la masa.
  @{k='yogur'; f='yogur'; p='local'},
  @{k='agua'; f='agua'; p='local'},
  @{k='aceite'; f='aceite'; p='local'},
  @{k='jamon'; f='jamon'; p='local'},
  @{k='tortilla'; f='tortilla'; p='local'},
  @{k='harina'; f='harina'; p='local'},
  @{k='calabacin'; f='calabacin'; p='local'},
  # La masa va en #F3EEF8 sobre #B4ACBC: en claro casi no se despega del fondo, asi
  # que quien salva el tema claro son las hojas verdes (#44911B, 3.95:1). Sin hojas
  # este icono no cumple la regla de color.
  @{k='coliflor'; f='coliflor'; p='local'},
  # --- Ampliacion L16f ----------------------------------------------------------
  @{k='guantes'; f='gloves'},
  # --- Ampliacion L16g (oct-2026) -------------------------------------------------
  # Salen de cruzar ~240 nombres reales de producto con guess.ts: alimentos de
  # mucha compra que caian en un icono prestado que enganaba. El salmon y el atun
  # en lata salian con el pez azul entero, el embutido con un perrito caliente y el
  # jamon cocido o el pavo en lonchas con la pata de serrano. Los cuatro dibujos, y
  # los ocho propios rehechos en la misma tanda (tortilla, calabacin, puerro,
  # frambuesa, jamon, col, harina, esparragos), pasaron una prueba A CIEGAS: tres
  # jueces que no sabian que era cada icono lo identificaron entre sus vecinos, y
  # los rehechos tenian que ganar al dibujo anterior en esa misma prueba.
  @{k='salmon'; f='salmon'; p='local'},
  @{k='chorizo'; f='chorizo'; p='local'},
  @{k='fiambre'; f='fiambre'; p='local'},
  @{k='atun'; f='atun'; p='local'},
  # 'falafel' se descarto en L16d para croquetas porque se leia como albondiga: es
  # justo lo que es ahora, con el interior verde de la que esta partida en carne.
  @{k='albondigas'; f='falafel'; s=@{'#402A32'='#7D4533'; '#6D4534'='#A56953'; '#C3EF3C'='#FBB8AB'}}
  # Descartados en L16g tras dibujarlos: croquetas (con cualquier composicion se
  # leian como panecillos o patatas) y vinagre (ninguna botella decia vinagre: la
  # oscura era vino tinto y la marron salsa de soja). Siguen sin icono propio.
  # ESTE SET ES DE CONSUMIBLES DE LA COMPRA, no de bazar. Se probo a cerrar la cola
  # larga con 11 glifos de Fluent (cubiertos, cuchillo, planta, flores, globos,
  # cuaderno, boligrafo, enchufe, auriculares, ropa) y sobraban: son cosas
  # duraderas que no entran en una compra habitual, y solo servian para engordar el
  # selector y el bundle. De aquella tanda se queda unicamente 'guantes', que es
  # drogueria y se gasta. Criterio para lo que venga: si no se consume y no lo
  # compras a menudo, NO lleva icono -- que caiga en el de su categoria.
  #
  # Descartados ademas tras verlos renderizados: 'takeout-box' para fiambrera (es un
  # carton chino de comida para llevar, no un tupper) y 'falafel' para croquetas
  # (lleva perejil y se lee como albondiga; por eso mismo es hoy 'albondigas').
  #
  # NO intentes dibujar el mejillon (L16e). Se probaron 5 composiciones -- lente con
  # carne central, dos valvas finas en V, valvas abiertas, gota con la carne anidada
  # y un par de mejillones solapados -- y todas se leen como un OJO o como una
  # diana: una concha con la carne dentro es inevitablemente ovalos anidados, que es
  # el mismo fallo que tumbo la col de circulos concentricos. Esta resuelto mapeando
  # los bivalvos a 'ostra' en guess.ts, sin slug propio. Mismo desenlace que la
  # alcachofa: un dibujo mediocre es peor que no tener icono.
)

# Extrae el interior del <svg> y lo deja en UNA linea. La minificacion no es
# cosmetica: cada entrada del registro es un string TS entre comillas simples, y esos
# no admiten saltos de linea. Los SVG dibujados a mano vienen indentados, asi que sin
# esto el fichero generado no compila.
function Get-SvgBody([string]$svg) {
  $m = [regex]::Match($svg, '(?s)<svg[^>]*>(.*)</svg>')
  if (-not $m.Success) { return $null }
  $body = $m.Groups[1].Value
  $body = [regex]::Replace($body, '>\s+<', '><')
  $body = [regex]::Replace($body, '\s+', ' ')
  return $body.Trim()
}

# Prefija los ids internos con la clave del icono. Los <defs> se CONSERVAN: hay
# iconos (p.ej. mantequilla) que definen una forma en defs y la reutilizan con
# <use href="#id">; borrar los defs dejaba la referencia colgando y se perdia parte
# del dibujo. Al prefijar evitamos que dos iconos distintos choquen de ids cuando
# varios SVG conviven en la misma pagina.
function Rename-SvgIds([string]$body, [string]$key) {
  $prefix = ($key -replace '[^a-z0-9]', '') + '-'
  $ids = @([regex]::Matches($body, 'id="([^"]+)"') | ForEach-Object { $_.Groups[1].Value } | Sort-Object -Unique)
  foreach ($id in $ids) {
    $esc = [regex]::Escape($id)
    $new = $prefix + $id
    $body = [regex]::Replace($body, 'id="' + $esc + '"', 'id="' + $new + '"')
    $body = [regex]::Replace($body, 'href="#' + $esc + '"', 'href="#' + $new + '"')
    $body = [regex]::Replace($body, 'url\(#' + $esc + '\)', 'url(#' + $new + ')')
  }
  return $body
}

# Descarga un SVG de Iconify. Devuelve $null SOLO si el icono no existe (404): eso
# es un MISS de verdad. Cualquier otro fallo (429 por rafaga, 5xx, red caida) se
# reintenta con espera creciente y, si no se recupera, LANZA: un fallo de red no
# puede tratarse como "el icono ya no existe". Paso en oct-2026: Iconify contesto
# 429 a partir del icono 65 y el generador escribio un registro con 65 de 164
# iconos, como si los otros 99 hubieran desaparecido del set.
function Get-RemoteSvg([string]$url) {
  for ($try = 1; $try -le 6; $try++) {
    try { return (New-Object System.Net.WebClient).DownloadString($url) }
    catch {
      # PowerShell envuelve la WebException en una MethodInvocationException.
      $ex = $_.Exception
      while ($ex -and -not ($ex -is [System.Net.WebException])) { $ex = $ex.InnerException }
      $resp = if ($ex) { $ex.Response } else { $null }
      $code = if ($resp) { [int]$resp.StatusCode } else { 0 }
      if ($code -eq 404) { return $null }
      if ($try -eq 6) { throw ("{0}: {1}" -f $url, $_.Exception.Message) }
      $wait = [Math]::Pow(2, $try)
      if ($resp -and $resp.Headers['Retry-After']) {
        $ra = 0
        if ([int]::TryParse($resp.Headers['Retry-After'], [ref]$ra)) { $wait = [Math]::Max($wait, $ra) }
      }
      Start-Sleep -Seconds $wait
    }
  }
}

function Get-ViewBox([string]$svg) {
  $m = [regex]::Match($svg, 'viewBox="([^"]+)"')
  if ($m.Success) { return $m.Groups[1].Value } else { return "0 0 32 32" }
}

# --- Contraste (hace cumplir la REGLA de color de la cabecera) -----------------
# Fondos reales de --card convertidos de los oklch de globals.css. Se mide contra la
# tarjeta y no contra el fondo de pagina porque es donde peor lo tiene el icono: en
# claro --card es blanco puro.
$CARD_LIGHT = '#FFFFFF'
$CARD_DARK = '#131A15'
$MIN_CONTRAST = 2.2

function Get-RelLuminance([string]$hex) {
  $ch = @(1, 3, 5) | ForEach-Object {
    $v = [Convert]::ToInt32($hex.Substring($_, 2), 16) / 255
    if ($v -le 0.03928) { $v / 12.92 } else { [Math]::Pow((($v + 0.055) / 1.055), 2.4) }
  }
  return 0.2126 * $ch[0] + 0.7152 * $ch[1] + 0.0722 * $ch[2]
}

function Get-Contrast([string]$a, [string]$b) {
  $la = Get-RelLuminance $a
  $lb = Get-RelLuminance $b
  $hi = [Math]::Max($la, $lb)
  $lo = [Math]::Min($la, $lb)
  return ($hi + 0.05) / ($lo + 0.05)
}

# La figura tiene que verse en los dos temas, pero no hace falta que la salve el mismo
# color: basta que UNO pase el umbral en claro y UNO en oscuro (normalmente el tono
# oscuro salva el tema claro y el vivo el oscuro). Devuelve $null si cumple, o el
# motivo si no.
function Test-IconContrast([string]$body) {
  $cols = @([regex]::Matches($body, '#[0-9A-Fa-f]{6}') | ForEach-Object { $_.Value } | Sort-Object -Unique)
  if ($cols.Count -eq 0) { return "no trae ningun color hex" }
  $bestLight = ($cols | ForEach-Object { Get-Contrast $_ $CARD_LIGHT } | Measure-Object -Maximum).Maximum
  $bestDark = ($cols | ForEach-Object { Get-Contrast $_ $CARD_DARK } | Measure-Object -Maximum).Maximum
  if ($bestLight -lt $MIN_CONTRAST) { return ("se lava en claro, {0:N2}:1 < {1}:1" -f $bestLight, $MIN_CONTRAST) }
  if ($bestDark -lt $MIN_CONTRAST) { return ("se lava en oscuro, {0:N2}:1 < {1}:1" -f $bestDark, $MIN_CONTRAST) }
  return $null
}

$reg = [ordered]@{}
$ok = @(); $miss = @()

$localDir = Join-Path $PSScriptRoot "..\assets\product-icons"

foreach ($c in $concepts) {
  $p = if ($c.p) { $c.p } else { $default }
  $svg = $null
  if ($p -eq 'local') {
    $path = Join-Path $localDir ($c.f + ".svg")
    if (Test-Path $path) { $svg = [System.IO.File]::ReadAllText($path) }
  } else {
    # Sin try: un fallo de red aborta el script ANTES de escribir nada (ver
    # Get-RemoteSvg). El registro que hay en disco se queda como estaba.
    $svg = Get-RemoteSvg "https://api.iconify.design/$p/$($c.f).svg"
  }
  if (-not $svg -or $svg -notmatch '<svg') { $miss += ("{0} ({1}:{2})" -f $c.k, $p, $c.f); continue }

  $body = Get-SvgBody $svg
  if (-not $body) { $miss += ("{0} (svg ilegible)" -f $c.k); continue }
  $body = Rename-SvgIds $body $c.k

  # Los hex, SIEMPRE en mayusculas. Iconify los servia asi y paso a servirlos en
  # minuscula (visto en oct-2026): sin esto, todos los swaps de abajo -- escritos en
  # mayusculas -- salian en MISS como obsoletos, y el registro entero cambiaba de
  # caja sin que cambiara un solo color. Normalizar aqui hace que los swaps y el
  # diff del registro no dependan de como lo sirva Iconify ese dia.
  $body = [regex]::Replace($body, '#[0-9A-Fa-f]{6}\b', { param($m) $m.Value.ToUpperInvariant() })

  if ($c.s) {
    # Recoloreado puntual. Si el hex original ya no esta, el set ha cambiado bajo
    # nuestros pies y el arreglo de contraste ya no se aplica: hay que revisarlo.
    # -cnotmatch (no -notmatch) porque .Replace SI distingue mayusculas: con el
    # comparador por defecto, una clave escrita en minuscula pasaria la comprobacion,
    # el reemplazo no haria nada y el icono entraria con el color viejo sin aparecer
    # en MISS. Por eso las claves de 's' van en mayusculas, como el cuerpo normalizado.
    foreach ($from in $c.s.Keys) {
      if ($body -cnotmatch [regex]::Escape($from)) {
        $miss += ("{0} (swap obsoleto: ya no usa {1})" -f $c.k, $from); $body = $null; break
      }
      $body = $body.Replace($from, $c.s[$from])
    }
    if (-not $body) { continue }
  }

  # Todo icono debe traer color propio: si depende del color del texto, se cuela una
  # silueta monocroma que desentona con el resto. Se rechaza antes de entrar.
  if ($body -match 'currentColor') {
    $miss += ("{0} (monocromo: currentColor no vale en un set a color)" -f $c.k); continue
  }

  # La REGLA de color solo se exige donde el color es NUESTRO: dibujos propios y
  # swaps. El artwork de Fluent entra tal cual (ver el OJO de la cabecera).
  if ($p -eq 'local' -or $c.s) {
    $why = Test-IconContrast $body
    if ($why) { $miss += ("{0} (contraste: {1})" -f $c.k, $why); continue }
  }

  $reg[$c.k] = @{ vb = (Get-ViewBox $svg); body = $body }
  $ok += ("{0} -> {1}:{2}" -f $c.k, $p, $c.f)
}

$sb = [System.Text.StringBuilder]::new()
[void]$sb.AppendLine("// GENERADO - no editar a mano. Iconos a color (cada SVG trae sus rellenos).")
[void]$sb.AppendLine("// Fuentes: Fluent Emoji Flat (MIT) y 19 dibujos propios (assets/product-icons/).")
[void]$sb.AppendLine("// Cada entrada guarda su viewBox (vb) porque los sets no comparten lienzo.")
[void]$sb.AppendLine("// Regenerar con scripts/gen-product-icons.ps1.")
[void]$sb.AppendLine("//")
[void]$sb.AppendLine("// Solo para el servidor: el navegador pinta desde sprite.svg (ver")
[void]$sb.AppendLine("// scripts/gen-product-icon-sprite.mjs y components/product-icon.tsx). En el JS")
[void]$sb.AppendLine("// de una pantalla eran ~70 KB gz; check-bundle-budget falla si vuelve.")
[void]$sb.AppendLine("")
[void]$sb.AppendLine("export const ICON_BODIES: Record<string, { vb: string; body: string }> = {")
foreach ($k in $reg.Keys) {
  # El SVG solo usa comillas dobles; envolvemos en comillas simples sin escapes.
  $val = $reg[$k].body -replace "'", "\'"
  [void]$sb.AppendLine("  '" + $k + "': { vb: '" + $reg[$k].vb + "', body: '" + $val + "' },")
}
[void]$sb.AppendLine("};")

$outDir = Join-Path $PSScriptRoot "..\src\lib\product-icons"
$enc = New-Object System.Text.UTF8Encoding($false); [System.IO.File]::WriteAllText((Join-Path $outDir "registry.ts"), $sb.ToString(), $enc)

# El sprite y la lista de slugs que usa el navegador salen del registro recien
# escrito. Si no se regeneran, `check:iconos` (CI) falla.
node (Join-Path $PSScriptRoot "gen-product-icon-sprite.mjs")
if ($LASTEXITCODE -ne 0) { throw "No se pudo generar el sprite de iconos." }

"=== OK ($($ok.Count)) ==="
$ok -join "`n"
""
"=== MISS ($($miss.Count)) ==="
$miss -join ", "
""
"Total en registro: $($reg.Count)"
