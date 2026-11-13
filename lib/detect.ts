import type { ObjectDetection } from "@tensorflow-models/coco-ssd";
import { classifyMany, loadTf, type Guess } from "./classify";
import { cropCanvas } from "./image";
import { partsOf, type Box } from "./objects";
import { withCorrections } from "./teach";

// Things in a photo that are never the waste itself: people (and their hands), furniture,
// screens, appliances, animals, vehicles. The detector knows 80 everyday object types.
const BACKGROUND = new Set([
  "person", "chair", "couch", "bed", "dining table", "bench", "toilet", "sink", "potted plant",
  "tv", "laptop", "keyboard", "mouse", "remote", "cell phone", "clock", "book",
  "oven", "microwave", "refrigerator", "toaster",
  "dog", "cat", "bird", "car", "bicycle", "motorcycle", "bus", "truck",
]);

let detector: ObjectDetection | null = null;

// Finds the objects in a photo with a ready-made detector (COCO-SSD, files in /public/detector),
// drops people, tables and the rest of the background, and returns boxes around what is left,
// numbered left to right. `person` says whether someone (often just a hand) is in the photo.
// The detector knows everyday things like bottles, cups and bowls, but not "waste" as such.
export async function findObjects(img: HTMLImageElement): Promise<{ boxes: Box[]; person: boolean }> {
  await loadTf();
  const cocoSsd = await import("@tensorflow-models/coco-ssd");
  detector ??= await cocoSsd.load({ base: "lite_mobilenet_v2", modelUrl: "/detector/model.json" });
  const found = await detector.detect(img, 10, 0.3);

  const W = img.naturalWidth;
  const H = img.naturalHeight;
  const boxes: Box[] = [];
  // most confident first; skip a box that mostly covers one we already have (same object, two labels)
  for (const d of found.sort((a, b) => b.score - a.score)) {
    if (BACKGROUND.has(d.class)) continue;
    const [x, y, w, h] = d.bbox;
    const box = { x: x / W, y: y / H, w: w / W, h: h / H };
    if (!boxes.some((b) => overlap(b, box) > 0.5)) boxes.push(box);
  }
  const person = found.some((d) => d.class === "person");
  return { boxes: boxes.sort((a, b) => a.x + a.w / 2 - (b.x + b.w / 2)), person };
}

// shared area divided by the smaller box's area
function overlap(a: Box, b: Box) {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? (w * h) / Math.min(a.w * a.h, b.w * b.h) : 0;
}

// An item held up to the camera: the detector sees only the person. Look at overlapping parts of the
// photo and keep the one that matches an item people taught Basellion (lib/teach.ts). Our model alone
// is not trusted here: in testing it read a dark shirt as LDPE, so with no match the whole photo is used.
export async function findHeldItem(img: HTMLImageElement): Promise<Box[]> {
  const parts = partsOf(img.naturalWidth / img.naturalHeight);
  const guesses = await Promise.all((await classifyMany(parts.map((box) => cropCanvas(img, box)))).map(withCorrections));
  const score = (g: Guess) => (g.learned ? g.confidence : 0); // confidence of a learned guess = similarity
  const best = guesses.reduce((b, g, i) => (score(g) > score(guesses[b]) ? i : b), 0);
  return score(guesses[best]) > 0 ? [parts[best]] : [];
}
