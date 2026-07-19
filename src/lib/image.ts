/**
 * Comprime una imagen en el navegador (lado mayor ≤ maxSide, JPEG) para que
 * el ticket viaje ligero al servidor. Los PDFs no pasan por aquí.
 */
export async function compressImage(
  file: File,
  maxSide = 1600,
  quality = 0.8,
): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No se pudo procesar la imagen.");
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) =>
        blob ? resolve(blob) : reject(new Error("No se pudo comprimir.")),
      "image/jpeg",
      quality,
    );
  });
}
