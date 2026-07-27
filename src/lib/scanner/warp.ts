/**
 * Rectificación del recorte: toma las cuatro esquinas del ticket dentro de un
 * fotograma y devuelve un JPEG con el papel enderezado, de frente y con el
 * contraste normalizado — que es lo que de verdad mejora la lectura de la IA
 * frente a una foto torcida.
 *
 * Todo el cálculo es local, sin dependencias ni red. Ver `detect.ts` para el
 * porqué de no usar OpenCV.js.
 */

import type { Point, Quad } from "./detect";

export type ExtractOptions = {
  /**
   * Lado mayor del resultado. 1600 por defecto, igual que `compressImage`, para
   * que el ticket viaje ligero al servidor sin una segunda pasada de compresión.
   */
  maxSide?: number;
  quality?: number;
};

/** Homografía como los ocho coeficientes de `[a b c; d e f; g h 1]`. */
type Homography = readonly [
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
];

/**
 * Resuelve un sistema lineal por eliminación gaussiana con pivoteo parcial.
 * Devuelve `null` si la matriz es singular (esquinas degeneradas).
 */
function solve(matrix: number[][], rhs: number[]): number[] | null {
  const n = rhs.length;

  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(matrix[row][col]) > Math.abs(matrix[pivot][col])) {
        pivot = row;
      }
    }
    if (Math.abs(matrix[pivot][col]) < 1e-10) return null;
    if (pivot !== col) {
      [matrix[col], matrix[pivot]] = [matrix[pivot], matrix[col]];
      [rhs[col], rhs[pivot]] = [rhs[pivot], rhs[col]];
    }

    const diagonal = matrix[col][col];
    for (let row = col + 1; row < n; row++) {
      const factor = matrix[row][col] / diagonal;
      if (factor === 0) continue;
      for (let c = col; c < n; c++) matrix[row][c] -= factor * matrix[col][c];
      rhs[row] -= factor * rhs[col];
    }
  }

  const result = new Array<number>(n).fill(0);
  for (let row = n - 1; row >= 0; row--) {
    let sum = rhs[row];
    for (let col = row + 1; col < n; col++) sum -= matrix[row][col] * result[col];
    result[row] = sum / matrix[row][row];
  }
  return result;
}

/**
 * Homografía del destino al origen. Se resuelve en ese sentido —y no al
 * revés— porque el remuestreo recorre los píxeles del destino y necesita saber
 * de qué punto del origen viene cada uno.
 */
function homography(quad: Quad, width: number, height: number): Homography | null {
  const destination: Point[] = [
    { x: 0, y: 0 },
    { x: width, y: 0 },
    { x: width, y: height },
    { x: 0, y: height },
  ];

  const matrix: number[][] = [];
  const rhs: number[] = [];
  for (let i = 0; i < 4; i++) {
    const { x: u, y: v } = destination[i];
    const { x, y } = quad[i];
    matrix.push([u, v, 1, 0, 0, 0, -u * x, -v * x]);
    rhs.push(x);
    matrix.push([0, 0, 0, u, v, 1, -u * y, -v * y]);
    rhs.push(y);
  }

  const solution = solve(matrix, rhs);
  if (!solution) return null;
  return [
    solution[0],
    solution[1],
    solution[2],
    solution[3],
    solution[4],
    solution[5],
    solution[6],
    solution[7],
  ];
}

/**
 * Tamaño de salida a partir de las dimensiones reales del papel: la media de
 * los lados opuestos del cuadrilátero, escalada para que el lado mayor no pase
 * de `maxSide`.
 */
function outputSize(
  quad: Quad,
  maxSide: number,
): { width: number; height: number } {
  const side = (a: Point, b: Point) => Math.hypot(b.x - a.x, b.y - a.y);
  const paperWidth = (side(quad[0], quad[1]) + side(quad[3], quad[2])) / 2;
  const paperHeight = (side(quad[0], quad[3]) + side(quad[1], quad[2])) / 2;

  const scale = Math.min(1, maxSide / Math.max(paperWidth, paperHeight));
  return {
    width: Math.max(16, Math.round(paperWidth * scale)),
    height: Math.max(16, Math.round(paperHeight * scale)),
  };
}

/** Remuestreo bilineal del origen al destino a través de la homografía. */
function resample(source: ImageData, target: ImageData, m: Homography): void {
  const [a, b, c, d, e, f, g, h] = m;
  const sourceWidth = source.width;
  const sourceHeight = source.height;
  const src = source.data;
  const dst = target.data;
  const maxX = sourceWidth - 1;
  const maxY = sourceHeight - 1;

  let offset = 0;
  for (let v = 0; v < target.height; v++) {
    for (let u = 0; u < target.width; u++, offset += 4) {
      const w = g * u + h * v + 1;
      const sx = (a * u + b * v + c) / w;
      const sy = (d * u + e * v + f) / w;

      const x0 = Math.floor(sx);
      const y0 = Math.floor(sy);
      const fx = sx - x0;
      const fy = sy - y0;

      const cx0 = x0 < 0 ? 0 : x0 > maxX ? maxX : x0;
      const cy0 = y0 < 0 ? 0 : y0 > maxY ? maxY : y0;
      const x1 = x0 + 1;
      const y1 = y0 + 1;
      const cx1 = x1 < 0 ? 0 : x1 > maxX ? maxX : x1;
      const cy1 = y1 < 0 ? 0 : y1 > maxY ? maxY : y1;

      const row0 = cy0 * sourceWidth;
      const row1 = cy1 * sourceWidth;
      const i00 = (row0 + cx0) * 4;
      const i10 = (row0 + cx1) * 4;
      const i01 = (row1 + cx0) * 4;
      const i11 = (row1 + cx1) * 4;

      const w00 = (1 - fx) * (1 - fy);
      const w10 = fx * (1 - fy);
      const w01 = (1 - fx) * fy;
      const w11 = fx * fy;

      dst[offset] =
        src[i00] * w00 + src[i10] * w10 + src[i01] * w01 + src[i11] * w11;
      dst[offset + 1] =
        src[i00 + 1] * w00 +
        src[i10 + 1] * w10 +
        src[i01 + 1] * w01 +
        src[i11 + 1] * w11;
      dst[offset + 2] =
        src[i00 + 2] * w00 +
        src[i10 + 2] * w10 +
        src[i01 + 2] * w01 +
        src[i11 + 2] * w11;
      dst[offset + 3] = 255;
    }
  }
}

/**
 * Estira el contraste recortando el 1% de cada extremo del histograma. Los
 * límites se calculan sobre la luminancia y se aplican por igual a los tres
 * canales, así el papel se va a blanco y la tinta a negro sin virar el color
 * (el prompt de la IA usa el aspecto del ticket para inferir la cadena).
 *
 * No se binariza a propósito: un modelo de visión lee mejor una escala de
 * grises completa que un umbral duro que se come los caracteres flojos.
 */
function stretchContrast(image: ImageData): void {
  const data = image.data;
  const histogram = new Int32Array(256);
  for (let i = 0; i < data.length; i += 4) {
    const luma =
      0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    histogram[luma | 0]++;
  }

  const total = data.length / 4;
  const cut = Math.round(total * 0.01);

  let low = 0;
  let seen = 0;
  for (let v = 0; v < 256; v++) {
    seen += histogram[v];
    if (seen > cut) {
      low = v;
      break;
    }
  }

  let high = 255;
  seen = 0;
  for (let v = 255; v >= 0; v--) {
    seen += histogram[v];
    if (seen > cut) {
      high = v;
      break;
    }
  }

  // Imagen ya plana (ticket sobreexpuesto, foto a un fondo liso): estirar solo
  // amplificaría el ruido del sensor.
  if (high - low < 32) return;

  const scale = 255 / (high - low);
  const lut = new Uint8ClampedArray(256);
  for (let v = 0; v < 256; v++) lut[v] = (v - low) * scale;

  for (let i = 0; i < data.length; i += 4) {
    data[i] = lut[data[i]];
    data[i + 1] = lut[data[i + 1]];
    data[i + 2] = lut[data[i + 2]];
  }
}

function readPixels(frame: ImageBitmap): ImageData {
  const canvas = document.createElement("canvas");
  canvas.width = frame.width;
  canvas.height = frame.height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("No se pudo leer el fotograma.");
  context.drawImage(frame, 0, 0);
  return context.getImageData(0, 0, frame.width, frame.height);
}

function encode(image: ImageData, quality: number): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = image.width;
  canvas.height = image.height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("No se pudo preparar el recorte.");
  context.putImageData(image, 0, 0);

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) =>
        blob
          ? resolve(blob)
          : reject(new Error("No se pudo generar la imagen del recorte.")),
      "image/jpeg",
      quality,
    );
  });
}

/**
 * Recorta el ticket del fotograma y lo devuelve enderezado como JPEG.
 * `quad` va en píxeles del `frame`, en el orden TL, TR, BR, BL.
 */
export async function extractDocument(
  frame: ImageBitmap,
  quad: Quad,
  { maxSide = 1600, quality = 0.85 }: ExtractOptions = {},
): Promise<Blob> {
  const source = readPixels(frame);
  const { width, height } = outputSize(quad, maxSide);

  const matrix = homography(quad, width, height);
  if (!matrix) {
    throw new Error("Las esquinas seleccionadas no forman un recorte válido.");
  }

  const target = new ImageData(width, height);
  resample(source, target, matrix);
  stretchContrast(target);
  return encode(target, quality);
}
