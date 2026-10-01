import { PDFDocument } from "pdf-lib";

export const ACCEPT = "image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp";

/** Longest side (px) allowed before we downscale to keep PDFs/memory reasonable. */
const MAX_DIMENSION = 3000;

/** A4 in PDF points (1/72 inch). */
const A4_PORTRAIT = { width: 595.28, height: 841.89 };
const A4_LANDSCAPE = { width: 841.89, height: 595.28 };
const MARGIN = 36; // 0.5 inch margin

type EmbeddableKind = "jpg" | "png";

function extOf(name: string): string {
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(i).toLowerCase() : "";
}

function isSupported(file: File): boolean {
  const type = file.type.toLowerCase();
  if (type === "image/jpeg" || type === "image/png" || type === "image/webp") {
    return true;
  }
  // Some browsers/OSes leave file.type empty — fall back to extension.
  const ext = extOf(file.name);
  return ext === ".jpg" || ext === ".jpeg" || ext === ".png" || ext === ".webp";
}

function kindOf(file: File): EmbeddableKind | "webp" | null {
  const type = file.type.toLowerCase();
  const ext = extOf(file.name);
  if (type === "image/jpeg" || ext === ".jpg" || ext === ".jpeg") return "jpg";
  if (type === "image/png" || ext === ".png") return "png";
  if (type === "image/webp" || ext === ".webp") return "webp";
  // Trust explicit mime even if extension is odd.
  if (type === "image/jpeg") return "jpg";
  if (type === "image/png") return "png";
  return null;
}

async function loadBitmap(file: File): Promise<ImageBitmap> {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(file);
    } catch {
      // Fall through to <img> fallback below.
    }
  }
  // Fallback for environments without createImageBitmap / webp support there.
  const url = URL.createObjectURL(file);
  try {
    const bitmap = await new Promise<ImageBitmap>((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        if (typeof createImageBitmap === "function") {
          createImageBitmap(img).then(resolve, reject);
        } else {
          reject(new Error("Image decoding is not supported in this browser."));
        }
      };
      img.onerror = () => reject(new Error(`Could not decode "${file.name}".`));
      img.src = url;
    });
    return bitmap;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function drawToCanvas(bitmap: ImageBitmap, maxDim: number, fillWhite: boolean): HTMLCanvasElement {
  const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is not supported in this browser.");
  if (fillWhite) {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, w, h);
  }
  ctx.drawImage(bitmap, 0, 0, w, h);
  return canvas;
}

async function canvasToBytes(canvas: HTMLCanvasElement, mime: string, quality?: number): Promise<Uint8Array> {
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob((b) => resolve(b), mime, quality),
  );
  if (!blob) throw new Error("Could not encode image via canvas.");
  const buf = await blob.arrayBuffer();
  return new Uint8Array(buf);
}

async function bitmapToJpeg(bitmap: ImageBitmap, maxDim: number): Promise<Uint8Array> {
  const canvas = drawToCanvas(bitmap, maxDim, true);
  try {
    return await canvasToBytes(canvas, "image/jpeg", 0.92);
  } finally {
    bitmap.close();
  }
}

async function bitmapToPng(bitmap: ImageBitmap, maxDim: number): Promise<Uint8Array> {
  const canvas = drawToCanvas(bitmap, maxDim, false);
  try {
    return await canvasToBytes(canvas, "image/png");
  } finally {
    bitmap.close();
  }
}

/**
 * Return bytes directly embeddable by pdf-lib.
 * JPG/PNG are embedded losslessly from the original file.
 * WEBP (pdf-lib cannot embed it) is decoded via the browser and re-encoded as PNG.
 * Very large images are downscaled so the tab doesn't run out of memory.
 */
async function fileToEmbeddable(file: File): Promise<{ bytes: Uint8Array; kind: EmbeddableKind }> {
  const kind = kindOf(file);
  if (!kind || !isSupported(file)) {
    throw new Error(
      `Unsupported file "${file.name}". Please use JPG, PNG, or WEBP.`,
    );
  }

  if (kind === "webp") {
    let bitmap: ImageBitmap;
    try {
      bitmap = await loadBitmap(file);
    } catch {
      throw new Error(`Could not process "${file.name}". The file may be corrupt.`);
    }
    try {
      const bytes = await bitmapToPng(bitmap, MAX_DIMENSION);
      return { bytes, kind: "png" };
    } catch {
      throw new Error(`Could not process "${file.name}". The file may be corrupt.`);
    }
  }

  // JPG / PNG: check dimensions first so huge photos can be downscaled.
  let bitmap: ImageBitmap | null = null;
  try {
    bitmap = await loadBitmap(file);
  } catch {
    bitmap = null; // If decode-for-sizing fails, fall back to embedding originals.
  }

  if (bitmap) {
    const needsDownscale = Math.max(bitmap.width, bitmap.height) > MAX_DIMENSION;
    if (needsDownscale) {
      try {
        if (kind === "jpg") {
          const bytes = await bitmapToJpeg(bitmap, MAX_DIMENSION);
          return { bytes, kind: "jpg" };
        }
        const bytes = await bitmapToPng(bitmap, MAX_DIMENSION);
        return { bytes, kind: "png" };
      } catch {
        try {
          bitmap.close();
        } catch {
          /* ignore */
        }
        throw new Error(`Could not process "${file.name}". The file may be corrupt.`);
      }
    }
    try {
      bitmap.close();
    } catch {
      /* ignore */
    }
  }

  try {
    const buf = await file.arrayBuffer();
    return { bytes: new Uint8Array(buf), kind };
  } catch {
    throw new Error(`Could not read "${file.name}". The file may be corrupt.`);
  }
}

/**
 * Create a PDF (as bytes) with one page per image, in the given order.
 * Portrait images get an A4 portrait page, landscape images an A4 landscape page.
 * Aspect ratio is always preserved; the image is scaled to fit and centered.
 */
export async function imagesToPdf(files: File[]): Promise<Uint8Array> {
  if (files.length === 0) {
    throw new Error("No images to convert.");
  }
  const pdfDoc = await PDFDocument.create();

  for (const file of files) {
    const { bytes, kind } = await fileToEmbeddable(file);
    let image;
    try {
      image = kind === "jpg" ? await pdfDoc.embedJpg(bytes) : await pdfDoc.embedPng(bytes);
    } catch {
      throw new Error(`Could not process "${file.name}". The file may be corrupt.`);
    }

    const iw = image.width;
    const ih = image.height;
    if (!iw || !ih) {
      throw new Error(`Could not process "${file.name}". The file may be corrupt.`);
    }
    const landscape = iw >= ih;
    const pageWidth = landscape ? A4_LANDSCAPE.width : A4_PORTRAIT.width;
    const pageHeight = landscape ? A4_LANDSCAPE.height : A4_PORTRAIT.height;
    const availW = pageWidth - MARGIN * 2;
    const availH = pageHeight - MARGIN * 2;
    const scale = Math.min(availW / iw, availH / ih);
    const drawW = iw * scale;
    const drawH = ih * scale;

    const page = pdfDoc.addPage([pageWidth, pageHeight]);
    page.drawImage(image, {
      x: (pageWidth - drawW) / 2,
      y: (pageHeight - drawH) / 2,
      width: drawW,
      height: drawH,
    });
  }

  return await pdfDoc.save();
}
