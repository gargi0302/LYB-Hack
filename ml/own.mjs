// Turns the team's own photos (ml/own/, not published: they show people) into training crops.
// ml/own/boxes.json gives, per photo, the item's type and a box around it (fractions of the photo).
//  - item crops: squares around the item at several sizes and positions, a little turned or
//    lighter/darker, like the parts of a photo the app looks at  -> ml/data/<type>/own_*
//  - background crops: parts of the same photo that miss the item (face, shirt, sofa, wall, table)
//    -> ml/data/UNCLEAR/own_bg_*, so the model learns those are not the item
// Photos whose name starts with test_ are never used here; they check the model afterwards.
// Run: node ml/own.mjs   then   npm run train
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const boxes = JSON.parse(fs.readFileSync("ml/own/boxes.json", "utf8"));
for (const label of ["PET", "HDPE", "PP", "LDPE", "UNCLEAR"]) {
  for (const f of fs.readdirSync(path.join("ml/data", label)).filter((f) => f.startsWith("own_"))) fs.unlinkSync(path.join("ml/data", label, f));
}
// shared area of a square part and the item box, as a share of the box (how much of the item it shows)
const covers = (p, b) => Math.max(0, Math.min(p.x + p.s, b.x1) - Math.max(p.x, b.x0)) * Math.max(0, Math.min(p.y + p.s, b.y1) - Math.max(p.y, b.y0)) / ((b.x1 - b.x0) * (b.y1 - b.y0));

const count = {};
for (const [file, { type, box }] of Object.entries(boxes)) {
  const image = sharp(path.join("ml/own", file)).rotate();
  const { width: W, height: H } = await image.metadata();
  const b = { x0: box[0] * W, y0: box[1] * H, x1: box[2] * W, y1: box[3] * H };
  const side = Math.max(b.x1 - b.x0, b.y1 - b.y0);
  const cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2;
  const stem = file.replace(/\.jpg$/, "");
  const save = async (label, name, p, tweak = {}) => {
    let crop = image.clone().extract({ left: Math.round(p.x), top: Math.round(p.y), width: Math.round(p.s), height: Math.round(p.s) });
    if (tweak.turn) crop = sharp(await crop.toBuffer()).rotate(tweak.turn, { background: "#808080" });
    if (tweak.light) crop = crop.modulate({ brightness: tweak.light });
    await crop.resize(224, 224, { fit: "cover" }).jpeg({ quality: 88 }).toFile(path.join("ml/data", label, `own_${name}.jpg`));
    count[label] = (count[label] ?? 0) + 1;
  };
  const inside = (s, x, y) => ({ s: Math.min(s, W, H), x: Math.min(Math.max(x, 0), W - Math.min(s, W, H)), y: Math.min(Math.max(y, 0), H - Math.min(s, W, H)) });

  // item crops: 5 sizes x 5 positions, each also turned or lighter/darker
  let n = 0;
  for (const zoom of [1.1, 1.35, 1.7, 2.2, 3]) {
    for (const [dx, dy] of [[0, 0], [-0.15, 0], [0.15, 0], [0, -0.15], [0, 0.15]]) {
      const s = side * zoom;
      const p = inside(s, cx - s / 2 + dx * s, cy - s / 2 + dy * s);
      if (covers(p, b) < 0.8) continue; // must show most of the item
      const tweak = [{}, { turn: 12 }, { turn: -12 }, { light: 0.75 }, { light: 1.25 }][n % 5];
      await save(type, `${stem}_${n++}`, p, tweak);
    }
  }
  // background crops: a grid of parts that show none of the item
  let m = 0;
  for (const frac of [0.3, 0.45, 0.6]) {
    const s = Math.min(W, H) * frac;
    for (let x = 0; x + s <= W; x += s / 2) {
      for (let y = 0; y + s <= H; y += s / 2) {
        if (covers({ x, y, s }, b) > 0) continue;
        if (m % 2 === 0) await save("UNCLEAR", `bg_${stem}_${m}`, { x, y, s });
        m++;
      }
    }
  }
}
console.log("own crops:", count);
