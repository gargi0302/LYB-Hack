// Photos come in as <img>, cropped items as <canvas>; both can be drawn the same way.
export type Picture = HTMLImageElement | HTMLCanvasElement;
const sizeOf = (p: Picture) => (p instanceof HTMLImageElement ? [p.naturalWidth, p.naturalHeight] : [p.width, p.height]);

// Draws the centre square of a picture onto a small canvas.
// The model was trained on centre-cropped 224x224 photos, so we feed it the same.
export function squareCanvas(pic: Picture, size: number) {
  const [w, h] = sizeOf(pic);
  const side = Math.min(w, h);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  canvas.getContext("2d")!.drawImage(pic, (w - side) / 2, (h - side) / 2, side, side, 0, 0, size, size);
  return canvas;
}

// Cuts one item out of a photo as a square around it, with a little margin, so the whole item
// (cap to base) is in view, the way the training photos look. box is in fractions of the photo.
export function cropCanvas(img: HTMLImageElement, box: { x: number; y: number; w: number; h: number }) {
  const [w, h] = sizeOf(img);
  const side = Math.min(Math.max(box.w * w, box.h * h) * 1.15, w, h);
  const x = Math.min(Math.max((box.x + box.w / 2) * w - side / 2, 0), w - side);
  const y = Math.min(Math.max((box.y + box.h / 2) * h - side / 2, 0), h - side);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = side;
  canvas.getContext("2d")!.drawImage(img, x, y, side, side, 0, 0, side, side);
  return canvas;
}

// "Average hash": shrink to 8x8 grey, each pixel brighter than average = 1.
// The same photo resized or re-saved gives the same 64 bits, so re-used photos show up.
export function photoHash(pic: Picture) {
  const pixels = squareCanvas(pic, 8).getContext("2d")!.getImageData(0, 0, 8, 8).data;
  const grey: number[] = [];
  for (let i = 0; i < pixels.length; i += 4) grey.push(pixels[i] + pixels[i + 1] + pixels[i + 2]);
  const avg = grey.reduce((a, b) => a + b) / grey.length;
  const bits = grey.map((g) => (g > avg ? "1" : "0")).join("");
  return BigInt("0b" + bits).toString(16).padStart(16, "0");
}

// Phone photos are 12 megapixels or more; the model looks at 224 x 224 and the detector at 300 x 300.
// Working on the full photo only slowed the phone down, so photos are made at most this many pixels long.
export const LONGEST = 1600;

// A smaller copy of a photo (same picture), as a new local URL; small photos come back unchanged
export async function shrink(src: string, longest = LONGEST) {
  const img = new Image();
  img.src = src;
  await img.decode();
  const scale = longest / Math.max(img.naturalWidth, img.naturalHeight);
  if (scale >= 1) return src;
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.naturalWidth * scale);
  canvas.height = Math.round(img.naturalHeight * scale);
  canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob | null>((done) => canvas.toBlob(done, "image/jpeg", 0.9));
  if (!blob) return src;
  URL.revokeObjectURL(src);
  return URL.createObjectURL(blob);
}

// A small JPEG of what the model looked at (centre square, 224 px), to send with a correction
export async function smallJpeg(src: string) {
  const img = new Image();
  img.src = src;
  await img.decode();
  return squareCanvas(img, 224).toDataURL("image/jpeg", 0.85);
}
