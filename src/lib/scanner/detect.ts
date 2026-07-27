/**
 * Detección del cuadrilátero de un documento (el ticket) dentro de un fotograma.
 *
 * Por qué a mano y no con OpenCV.js: la build oficial pesa 10,4 MB, y el
 * presupuesto del bundle base de la app entera es de 185 KB gzip
 * (`scripts/check-bundle-budget.mjs`). Aunque se cargue en diferido, alguien en
 * el supermercado con 4G flojo esperaría decenas de segundos antes de poder
 * escanear — peor que la cámara del sistema que ya teníamos. Y al vivir en
 * `public/` entraría en el precache de Serwist, que instala el service worker.
 * Aquí solo hacen falta cuatro operaciones clásicas (Sobel, umbral por
 * percentil, transformada de Hough e intersección de rectas), y en TypeScript
 * ocupan unos pocos KB.
 *
 * Privacidad: todo ocurre en el dispositivo. Este módulo no hace ninguna
 * petición de red ni recibe dependencias externas.
 *
 * Por qué Hough y no búsqueda de contornos: el ticket es un rectángulo de
 * bordes largos y rectos, el caso ideal para Hough, y además sigue encontrando
 * el borde aunque un dedo lo tape a medias o se salga del encuadre — que es
 * justo donde falla el trazado de contornos.
 */

export type Point = { x: number; y: number };

/**
 * Esquinas en orden: superior-izquierda, superior-derecha, inferior-derecha,
 * inferior-izquierda (sentido horario en coordenadas de pantalla).
 */
export type Quad = readonly [Point, Point, Point, Point];

const DEG = Math.PI / 180;

/** Resolución angular del acumulador de Hough: 1° por casilla. */
const THETAS = 180;
/** Cada píxel de borde solo vota ±8° alrededor de la normal de su gradiente. */
const GRAD_WINDOW = 8;
/** Fracción de píxeles que se toman como borde (umbral por percentil). */
const EDGE_PERCENTILE = 0.12;
/** Magnitud mínima (escala 0..255) para que un píxel vote: descarta ruido. */
const MIN_MAGNITUDE = 18;
/** Máximo de rectas candidatas que se conservan tras la supresión de vecinos. */
const MAX_PEAKS = 24;
/** Ventana de supresión de no-máximos, en píxeles de ρ y grados de θ. */
const NMS_DISTANCE = 18;
const NMS_ANGLE = 12;
/** Tolerancia para considerar dos rectas «de la misma familia» (paralelas). */
const PARALLEL_TOLERANCE = 35;
/** El ticket debe ocupar al menos este porcentaje del fotograma. */
const MIN_AREA_RATIO = 0.1;
/** …y no puede ser prácticamente todo el fotograma (sería el fondo). */
const MAX_AREA_RATIO = 0.97;
/** Lado mínimo del cuadrilátero, relativo al lado corto del fotograma. */
const MIN_SIDE_RATIO = 0.14;
/** |cos| máximo en una esquina: acota los ángulos a ~44°..136°. */
const MAX_CORNER_COS = 0.72;

/** Una recta en forma normal: `x·cos(θ) + y·sin(θ) = ρ`. */
type Line = { theta: number; rho: number; votes: number };

/**
 * Recta ya resuelta a geometría: normal unitaria `(c, s)`, su ρ, y `d`, la
 * distancia con signo desde el centro del fotograma. `d` es lo que permite
 * comparar dos rectas sin que moleste el salto de θ entre 179° y 0°.
 */
type Geometry = { c: number; s: number; rho: number; d: number; votes: number };

/**
 * Separación entre dos rectas casi paralelas. Si sus normales apuntan a lados
 * opuestos hay que sumar las distancias al centro en vez de restarlas, o dos
 * bordes enfrentados parecerían el mismo.
 */
function separation(a: Geometry, b: Geometry): number {
  const aligned = a.c * b.c + a.s * b.s >= 0;
  return aligned ? Math.abs(a.d - b.d) : Math.abs(a.d + b.d);
}

/** Intersección de dos rectas en forma normal. `null` si son paralelas. */
function intersect(a: Geometry, b: Geometry): Point | null {
  const det = a.c * b.s - a.s * b.c;
  if (Math.abs(det) < 1e-6) return null;
  return {
    x: (a.rho * b.s - a.s * b.rho) / det,
    y: (a.c * b.rho - a.rho * b.c) / det,
  };
}

/** Área del polígono por la fórmula del cordón (shoelace). */
function polygonArea(quad: Quad): number {
  let sum = 0;
  for (let i = 0; i < 4; i++) {
    const p = quad[i];
    const q = quad[(i + 1) % 4];
    sum += p.x * q.y - q.x * p.y;
  }
  return Math.abs(sum) / 2;
}

/**
 * Ordena cuatro puntos a TL, TR, BR, BL. Primero por ángulo alrededor del
 * centroide (ascendente = sentido horario, porque la Y crece hacia abajo) y
 * luego rotando para que arranque en la esquina de menor `x + y`.
 */
function orderCorners(points: Point[]): Quad {
  const cx = (points[0].x + points[1].x + points[2].x + points[3].x) / 4;
  const cy = (points[0].y + points[1].y + points[2].y + points[3].y) / 4;
  const sorted = [...points].sort(
    (p, q) => Math.atan2(p.y - cy, p.x - cx) - Math.atan2(q.y - cy, q.x - cx),
  );

  let start = 0;
  let smallest = Infinity;
  for (let i = 0; i < 4; i++) {
    const sum = sorted[i].x + sorted[i].y;
    if (sum < smallest) {
      smallest = sum;
      start = i;
    }
  }
  return [
    sorted[start],
    sorted[(start + 1) % 4],
    sorted[(start + 2) % 4],
    sorted[(start + 3) % 4],
  ];
}

/**
 * ¿El cuadrilátero puede ser de verdad un ticket? Filtra convexidad, ángulos,
 * lados y superficie para no quedarse enganchado a un logotipo, a la junta de
 * una baldosa o al propio borde del fotograma.
 */
function isPlausible(quad: Quad, width: number, height: number): boolean {
  const margin = 0.04 * Math.max(width, height);
  for (const p of quad) {
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) return false;
    if (p.x < -margin || p.x > width + margin) return false;
    if (p.y < -margin || p.y > height + margin) return false;
  }

  let sign = 0;
  for (let i = 0; i < 4; i++) {
    const a = quad[i];
    const b = quad[(i + 1) % 4];
    const c = quad[(i + 2) % 4];
    const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    if (cross === 0) return false;
    const current = Math.sign(cross);
    if (sign === 0) sign = current;
    else if (current !== sign) return false;
  }

  const minSide = MIN_SIDE_RATIO * Math.min(width, height);
  for (let i = 0; i < 4; i++) {
    const prev = quad[(i + 3) % 4];
    const current = quad[i];
    const next = quad[(i + 1) % 4];
    const v1x = prev.x - current.x;
    const v1y = prev.y - current.y;
    const v2x = next.x - current.x;
    const v2y = next.y - current.y;
    const l1 = Math.hypot(v1x, v1y);
    const l2 = Math.hypot(v2x, v2y);
    if (l1 < minSide || l2 < minSide) return false;
    if (Math.abs((v1x * v2x + v1y * v2y) / (l1 * l2)) > MAX_CORNER_COS) {
      return false;
    }
  }

  const area = polygonArea(quad);
  const frame = width * height;
  return area >= MIN_AREA_RATIO * frame && area <= MAX_AREA_RATIO * frame;
}

/**
 * De todas las parejas de la familia, la de mayor separación. Es la clave para
 * los tickets: sus líneas de texto generan montones de bordes horizontales muy
 * marcados, así que quedarse con las rectas *más votadas* elegiría renglones.
 * Quedarse con las *más separadas* elige los bordes reales del papel.
 */
function outermostPair(
  group: Geometry[],
  minSeparation: number,
): [Geometry, Geometry] | null {
  let best: [Geometry, Geometry] | null = null;
  let bestSeparation = minSeparation;
  for (let i = 0; i < group.length; i++) {
    for (let j = i + 1; j < group.length; j++) {
      const gap = separation(group[i], group[j]);
      if (gap > bestSeparation) {
        bestSeparation = gap;
        best = [group[i], group[j]];
      }
    }
  }
  return best;
}

/**
 * Reparte las rectas en dos familias perpendiculares, toma la pareja más
 * externa de cada una y devuelve el cuadrilátero de sus intersecciones.
 */
function quadFromLines(
  geometries: Geometry[],
  width: number,
  height: number,
): Quad | null {
  if (geometries.length < 4) return null;

  const base = geometries[0];
  const parallelLimit = Math.cos(PARALLEL_TOLERANCE * DEG);
  const perpendicularLimit = Math.cos((90 - PARALLEL_TOLERANCE) * DEG);

  const family: Geometry[] = [];
  const crossFamily: Geometry[] = [];
  for (const g of geometries) {
    const alignment = Math.abs(g.c * base.c + g.s * base.s);
    if (alignment >= parallelLimit) family.push(g);
    else if (alignment <= perpendicularLimit) crossFamily.push(g);
  }
  if (family.length < 2 || crossFamily.length < 2) return null;

  const minSeparation = 0.1 * Math.min(width, height);
  const first = outermostPair(family, minSeparation);
  const second = outermostPair(crossFamily, minSeparation);
  if (!first || !second) return null;

  const corners: Point[] = [];
  for (const a of first) {
    for (const b of second) {
      const point = intersect(a, b);
      if (!point) return null;
      corners.push(point);
    }
  }
  if (corners.length !== 4) return null;

  const quad = orderCorners(corners);
  if (!isPlausible(quad, width, height)) return null;

  // Un vértice puede caer unos píxeles fuera por el redondeo del acumulador;
  // `isPlausible` ya acotó cuánto, aquí solo se mete dentro del fotograma.
  return [
    clampPoint(quad[0], width, height),
    clampPoint(quad[1], width, height),
    clampPoint(quad[2], width, height),
    clampPoint(quad[3], width, height),
  ];
}

function clampPoint(p: Point, width: number, height: number): Point {
  return {
    x: Math.min(Math.max(p.x, 0), width - 1),
    y: Math.min(Math.max(p.y, 0), height - 1),
  };
}

/**
 * Detector reutilizable para un tamaño de fotograma fijo. Reserva todos sus
 * búferes en el constructor: se llama varias veces por segundo y asignar
 * memoria en cada pasada haría trabajar al recolector de basura en medio de la
 * previsualización.
 */
export class DocumentDetector {
  readonly width: number;
  readonly height: number;

  private readonly gray: Float32Array;
  private readonly blurred: Float32Array;
  private readonly scratch: Float32Array;
  private readonly magnitude: Float32Array;
  /**
   * Componentes del gradiente. Se guardan crudas en vez de la orientación ya
   * calculada porque `atan2` solo hace falta en los píxeles que superan el
   * umbral (~12%), y hacerlo para todos costaba más que el resto del análisis
   * junto.
   */
  private readonly gradX: Float32Array;
  private readonly gradY: Float32Array;
  private readonly accumulator: Int32Array;
  private readonly cos: Float32Array;
  private readonly sin: Float32Array;
  private readonly histogram = new Int32Array(256);
  private readonly rhoOffset: number;
  private readonly rhoSize: number;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;

    const pixels = width * height;
    this.gray = new Float32Array(pixels);
    this.blurred = new Float32Array(pixels);
    this.scratch = new Float32Array(pixels);
    this.magnitude = new Float32Array(pixels);
    this.gradX = new Float32Array(pixels);
    this.gradY = new Float32Array(pixels);

    this.rhoOffset = Math.ceil(Math.hypot(width, height));
    this.rhoSize = this.rhoOffset * 2 + 1;
    this.accumulator = new Int32Array(THETAS * this.rhoSize);

    this.cos = new Float32Array(THETAS);
    this.sin = new Float32Array(THETAS);
    for (let t = 0; t < THETAS; t++) {
      this.cos[t] = Math.cos(t * DEG);
      this.sin[t] = Math.sin(t * DEG);
    }
  }

  /**
   * Devuelve el cuadrilátero detectado, en píxeles del fotograma analizado, o
   * `null` si en esta pasada no hay nada convincente.
   */
  detect(frame: ImageData): Quad | null {
    if (frame.width !== this.width || frame.height !== this.height) return null;
    this.toGrayscale(frame.data);
    this.blur();
    const threshold = this.gradients();
    this.vote(threshold);
    return quadFromLines(this.peaks(), this.width, this.height);
  }

  private toGrayscale(data: Uint8ClampedArray): void {
    const { gray } = this;
    for (let i = 0, p = 0; i < gray.length; i++, p += 4) {
      gray[i] = 0.299 * data[p] + 0.587 * data[p + 1] + 0.114 * data[p + 2];
    }
  }

  /** Suavizado gaussiano 3×3 separable, para que Sobel no amplifique el ruido. */
  private blur(): void {
    const { gray, scratch, blurred, width: w, height: h } = this;

    for (let y = 0; y < h; y++) {
      const row = y * w;
      scratch[row] = gray[row];
      scratch[row + w - 1] = gray[row + w - 1];
      for (let x = 1; x < w - 1; x++) {
        const i = row + x;
        scratch[i] = (gray[i - 1] + 2 * gray[i] + gray[i + 1]) * 0.25;
      }
    }

    const last = (h - 1) * w;
    for (let x = 0; x < w; x++) {
      blurred[x] = scratch[x];
      blurred[last + x] = scratch[last + x];
    }
    for (let y = 1; y < h - 1; y++) {
      const row = y * w;
      for (let x = 0; x < w; x++) {
        const i = row + x;
        blurred[i] = (scratch[i - w] + 2 * scratch[i] + scratch[i + w]) * 0.25;
      }
    }
  }

  /**
   * Sobel: rellena magnitud y gradiente, y devuelve el umbral por percentil a
   * partir del histograma de magnitudes.
   */
  private gradients(): number {
    const {
      blurred,
      magnitude,
      gradX,
      gradY,
      histogram,
      width: w,
      height: h,
    } = this;
    // Los píxeles del borde del fotograma nunca se escriben y deben quedar por
    // debajo del umbral; `gradX`/`gradY` no hace falta limpiarlos porque solo
    // se leen donde la magnitud pasa el corte.
    magnitude.fill(0);
    histogram.fill(0);

    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const i = y * w + x;
        const topLeft = blurred[i - w - 1];
        const top = blurred[i - w];
        const topRight = blurred[i - w + 1];
        const left = blurred[i - 1];
        const right = blurred[i + 1];
        const bottomLeft = blurred[i + w - 1];
        const bottom = blurred[i + w];
        const bottomRight = blurred[i + w + 1];

        const gx =
          topRight + 2 * right + bottomRight - topLeft - 2 * left - bottomLeft;
        const gy =
          bottomLeft + 2 * bottom + bottomRight - topLeft - 2 * top - topRight;

        // |gx| + |gy| en lugar de la norma euclídea: una raíz por píxel no
        // aporta nada aquí y el umbral es relativo de todos modos.
        const m = (Math.abs(gx) + Math.abs(gy)) * 0.25;
        magnitude[i] = m;
        gradX[i] = gx;
        gradY[i] = gy;

        histogram[m > 255 ? 255 : m | 0]++;
      }
    }

    const counted = (w - 2) * (h - 2);
    const target = Math.round(counted * EDGE_PERCENTILE);
    let seen = 0;
    let threshold = 255;
    for (let bin = 255; bin >= 0; bin--) {
      seen += histogram[bin];
      if (seen >= target) {
        threshold = bin;
        break;
      }
    }
    return Math.max(threshold, MIN_MAGNITUDE);
  }

  /**
   * Vota en el acumulador de Hough. Cada píxel de borde vota solo en el
   * entorno de la orientación de su gradiente, no en las 180: seis veces menos
   * trabajo y bastante menos ruido en el acumulador.
   */
  private vote(threshold: number): void {
    const {
      magnitude,
      gradX,
      gradY,
      accumulator,
      cos,
      sin,
      width: w,
      height: h,
      rhoOffset,
      rhoSize,
    } = this;
    accumulator.fill(0);

    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const i = y * w + x;
        if (magnitude[i] < threshold) continue;

        // La normal del borde es la dirección del gradiente, plegada a [0,180).
        let angle = Math.atan2(gradY[i], gradX[i]) / DEG;
        if (angle < 0) angle += THETAS;
        if (angle >= THETAS) angle -= THETAS;
        const center = angle | 0;
        for (let delta = -GRAD_WINDOW; delta <= GRAD_WINDOW; delta++) {
          let t = center + delta;
          if (t < 0) t += THETAS;
          else if (t >= THETAS) t -= THETAS;
          // ρ se recalcula con la θ ya plegada, así que el pliegue no falsea
          // la recta: sigue siendo la que pasa por (x, y) con esa normal.
          const rho = Math.round(x * cos[t] + y * sin[t]) + rhoOffset;
          accumulator[t * rhoSize + rho]++;
        }
      }
    }
  }

  /** Máximos del acumulador, con supresión de vecinos, resueltos a geometría. */
  private peaks(): Geometry[] {
    const { accumulator, rhoSize, rhoOffset, cos, sin } = this;

    let strongest = 0;
    for (let i = 0; i < accumulator.length; i++) {
      if (accumulator[i] > strongest) strongest = accumulator[i];
    }
    if (strongest === 0) return [];

    const minVotes = Math.max(
      Math.round(0.22 * Math.min(this.width, this.height)),
      Math.round(0.25 * strongest),
    );

    const candidates: Line[] = [];
    for (let t = 0; t < THETAS; t++) {
      const base = t * rhoSize;
      for (let r = 1; r < rhoSize - 1; r++) {
        const votes = accumulator[base + r];
        if (votes < minVotes) continue;
        // Máximo local en ρ: filtra la mayoría de casillas antes del NMS.
        if (votes < accumulator[base + r - 1]) continue;
        if (votes < accumulator[base + r + 1]) continue;
        candidates.push({ theta: t, rho: r - rhoOffset, votes });
      }
    }
    candidates.sort((a, b) => b.votes - a.votes);

    const cx = this.width / 2;
    const cy = this.height / 2;
    const kept: Geometry[] = [];
    for (const line of candidates) {
      if (kept.length >= MAX_PEAKS) break;
      const c = cos[line.theta];
      const s = sin[line.theta];
      const geometry: Geometry = {
        c,
        s,
        rho: line.rho,
        d: line.rho - (cx * c + cy * s),
        votes: line.votes,
      };
      const duplicate = kept.some((other) => {
        const alignment = Math.min(
          1,
          Math.abs(other.c * c + other.s * s),
        );
        const angle = Math.acos(alignment) / DEG;
        return (
          angle < NMS_ANGLE && separation(other, geometry) < NMS_DISTANCE
        );
      });
      if (!duplicate) kept.push(geometry);
    }
    return kept;
  }
}
