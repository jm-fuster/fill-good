# Genera el registro de iconos de producto.
#
# Fuentes:
#   - Fluent Emoji High Contrast (MIT) por defecto.
#   - Game Icons (CC-BY 3.0) para la cola larga de fruta/verdura que no existe en
#     el vocabulario emoji (marcadas con p='game-icons'). La atribucion CC-BY se
#     muestra en la app (pagina de Ajustes) — es obligatoria por licencia.
#
# Cada concepto se descarga, se sanea (quita defs/clipPath no-ops) y se guarda
# { vb (viewBox), body } bajo una clave estable propia. El viewBox se conserva por
# icono porque Fluent usa 0 0 32 32 y Game Icons 0 0 512 512. ASCII-only por PS 5.1.
#
# NOTA: 'green-apple' se excluye a proposito. En este set solo se diferencia de
# 'red-apple' por el color (rojo/verde); en monocromo ambas quedan casi
# indistinguibles a tamano de icono. No lo reintroduzcas sin comprobar que se ve distinto.

$ErrorActionPreference = "Stop"
$default = "fluent-emoji-high-contrast"

$concepts = @(
  @{k='manzana'; f='red-apple'}, @{k='platano'; f='banana'},
  @{k='naranja'; f='tangerine'}, @{k='limon'; f='lemon'}, @{k='fresa'; f='strawberry'},
  @{k='uvas'; f='grapes'}, @{k='sandia'; f='watermelon'}, @{k='pina'; f='pineapple'},
  @{k='pera'; f='pear'}, @{k='melocoton'; f='peach'}, @{k='cerezas'; f='cherries'},
  @{k='melon'; f='melon'}, @{k='kiwi'; f='kiwi-fruit'}, @{k='mango'; f='mango'},
  @{k='coco'; f='coconut'}, @{k='arandanos'; f='blueberries'}, @{k='aguacate'; f='avocado'},
  @{k='zanahoria'; f='carrot'}, @{k='tomate'; f='tomato'}, @{k='patata'; f='potato'},
  @{k='cebolla'; f='onion'}, @{k='ajo'; f='garlic'}, @{k='pimiento'; f='bell-pepper'},
  @{k='guindilla'; f='hot-pepper'}, @{k='brocoli'; f='broccoli'}, @{k='maiz'; f='ear-of-corn'},
  @{k='pepino'; f='cucumber'}, @{k='lechuga'; f='leafy-green'}, @{k='berenjena'; f='eggplant'},
  @{k='champinon'; f='mushroom'}, @{k='aceituna'; f='olive'}, @{k='jengibre'; f='ginger-root'},
  @{k='cacahuetes'; f='peanuts'}, @{k='alubias'; f='beans'},
  @{k='carne'; f='cut-of-meat'}, @{k='pollo'; f='poultry-leg'}, @{k='costilla'; f='meat-on-bone'},
  @{k='bacon'; f='bacon'}, @{k='perrito'; f='hot-dog'},
  @{k='pescado'; f='fish'}, @{k='gamba'; f='shrimp'}, @{k='cangrejo'; f='crab'},
  @{k='langosta'; f='lobster'}, @{k='calamar'; f='squid'}, @{k='ostra'; f='oyster'},
  @{k='leche'; f='glass-of-milk'}, @{k='queso'; f='cheese-wedge'}, @{k='huevo'; f='egg'},
  @{k='mantequilla'; f='butter'}, @{k='helado'; f='ice-cream'}, @{k='helado-cucurucho'; f='soft-ice-cream'},
  @{k='pan'; f='bread'}, @{k='croissant'; f='croissant'}, @{k='baguette'; f='baguette-bread'},
  @{k='bagel'; f='bagel'}, @{k='pretzel'; f='pretzel'}, @{k='tortitas'; f='pancakes'},
  @{k='arroz'; f='cooked-rice'}, @{k='pasta'; f='spaghetti'}, @{k='gofre'; f='waffle'},
  @{k='pan-plano'; f='flatbread'},
  @{k='conserva'; f='canned-food'}, @{k='miel'; f='honey-pot'}, @{k='sal'; f='salt'},
  @{k='tarro'; f='jar'},
  @{k='chocolate'; f='chocolate-bar'}, @{k='galleta'; f='cookie'}, @{k='caramelo'; f='candy'},
  @{k='piruleta'; f='lollipop'}, @{k='donut'; f='doughnut'}, @{k='tarta'; f='shortcake'},
  @{k='cupcake'; f='cupcake'}, @{k='palomitas'; f='popcorn'}, @{k='pastel'; f='pie'},
  @{k='flan'; f='custard'}, @{k='dango'; f='dango'},
  @{k='cafe'; f='hot-beverage'}, @{k='vino'; f='wine-glass'}, @{k='cerveza'; f='beer-mug'},
  @{k='refresco'; f='cup-with-straw'}, @{k='coctel'; f='tropical-drink'},
  @{k='champan'; f='bottle-with-popping-cork'}, @{k='tetera'; f='teapot'}, @{k='mate'; f='mate'},
  @{k='vaso'; f='tumbler-glass'}, @{k='copas'; f='clinking-beer-mugs'}, @{k='te-burbujas'; f='bubble-tea'},
  @{k='hielo'; f='ice'},
  @{k='jabon'; f='soap'}, @{k='esponja'; f='sponge'}, @{k='cubo'; f='bucket'},
  @{k='escoba'; f='broom'}, @{k='papel'; f='roll-of-paper'}, @{k='bote-spray'; f='lotion-bottle'},
  @{k='wc'; f='toilet'}, @{k='burbujas'; f='bubbles'}, @{k='cesta'; f='basket'},
  @{k='cepillo-dientes'; f='toothbrush'}, @{k='diente'; f='tooth'},
  @{k='biberon'; f='baby-bottle'},
  @{k='huellas'; f='paw-prints'}, @{k='hueso'; f='bone'}, @{k='perro'; f='dog-face'},
  @{k='gato'; f='cat-face'},
  @{k='paquete'; f='package'}, @{k='bombilla'; f='light-bulb'}, @{k='pila'; f='battery'},
  @{k='cerilla'; f='matchstick'}, @{k='aguja'; f='sewing-needle'}, @{k='regalo'; f='wrapped-gift'},
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
  # Ampliacion L16c - cola larga de fruta/verdura desde Game Icons (CC-BY 3.0)
  @{k='ciruela'; f='plum'; p='game-icons'}, @{k='calabaza'; f='pumpkin'; p='game-icons'},
  @{k='esparragos'; f='asparagus'; p='game-icons'}, @{k='col'; f='cabbage'; p='game-icons'},
  @{k='remolacha'; f='beet'; p='game-icons'}, @{k='frambuesa'; f='raspberry'; p='game-icons'},
  @{k='alcachofa'; f='artichoke'; p='game-icons'}, @{k='puerro'; f='leek'; p='game-icons'}
)

function Sanitize-Svg([string]$svg) {
  $m = [regex]::Match($svg, '(?s)<svg[^>]*>(.*)</svg>')
  if (-not $m.Success) { return $null }
  $body = $m.Groups[1].Value
  $body = [regex]::Replace($body, '(?s)<defs>.*?</defs>', '')
  $body = [regex]::Replace($body, '\s*clip-path="url\(#[^)]*\)"', '')
  return $body.Trim()
}

function Get-ViewBox([string]$svg) {
  $m = [regex]::Match($svg, 'viewBox="([^"]+)"')
  if ($m.Success) { return $m.Groups[1].Value } else { return "0 0 32 32" }
}

$reg = [ordered]@{}
$ok = @(); $miss = @()

foreach ($c in $concepts) {
  $p = if ($c.p) { $c.p } else { $default }
  $name = $c.f
  $svg = $null
  try { $svg = (New-Object System.Net.WebClient).DownloadString("https://api.iconify.design/$p/$name.svg") } catch { $svg = $null }
  if (-not $svg -or $svg -notmatch '<svg') {
    try {
      $r = Invoke-RestMethod "https://api.iconify.design/search?query=$($c.k)&prefix=$p&limit=1"
      if ($r.icons.Count -gt 0) {
        $name = $r.icons[0].Split(':')[1]
        $svg = (New-Object System.Net.WebClient).DownloadString("https://api.iconify.design/$p/$name.svg")
      }
    } catch { $svg = $null }
  }
  if (-not $svg -or $svg -notmatch '<svg') { $miss += $c.k; continue }
  $body = Sanitize-Svg $svg
  if (-not $body) { $miss += $c.k; continue }
  $reg[$c.k] = @{ vb = (Get-ViewBox $svg); body = $body }
  $ok += ("{0} -> {1}:{2}" -f $c.k, $p, $name)
}

$sb = [System.Text.StringBuilder]::new()
[void]$sb.AppendLine("// GENERADO - no editar a mano. Iconos monocromos (fill currentColor).")
[void]$sb.AppendLine("// Fuentes: Fluent Emoji High Contrast (MIT) y Game Icons (CC-BY 3.0, atribucion en Ajustes).")
[void]$sb.AppendLine("// Cada entrada guarda su viewBox (vb) porque los sets no comparten lienzo.")
[void]$sb.AppendLine("// Regenerar con scripts/gen-product-icons.ps1.")
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

"=== OK ($($ok.Count)) ==="
$ok -join "`n"
""
"=== MISS ($($miss.Count)) ==="
$miss -join ", "
""
"Total en registro: $($reg.Count)"
