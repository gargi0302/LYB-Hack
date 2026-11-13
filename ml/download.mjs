// Downloads the training photos into ml/data/<CLASS>/ (folder per class).
// Sources (all openly licensed, credited in README):
//   aytvill/plastic-recycling-codes  - MIT, close-ups of the recycling symbol, sorted by resin code
//   viola77data/recycling-dataset    - Apache-2.0, a few "not plastic" examples
//   TrashBusters/combined            - MIT, photos of whole items (bottles, tubs, bags) with fine labels
//   TACO (RandyHuynh5815 mirror)     - CC BY 4.0, litter photos with boxes: wrappers and foil
//   Voxel51/IndoorSceneRecognition   - MIT, MIT Indoor 67 room photos for "not plastic"
// Run: node ml/download.mjs
import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { asyncBufferFromFile, parquetReadObjects } from "hyparquet";
import sharp from "sharp";

const HF = "https://huggingface.co";

// symbol close-ups: our class -> [dataset, folder in that dataset, max images]
const FOLDERS = {
  PET: [["aytvill/plastic-recycling-codes", "1_polyethylene_PET", 200]],
  HDPE: [["aytvill/plastic-recycling-codes", "2_high_density_polyethylene_PE-HD", 200]],
  LDPE: [["aytvill/plastic-recycling-codes", "4_low_density_polyethylene_PE-LD", 200]],
  PP: [["aytvill/plastic-recycling-codes", "5_polypropylene_PP", 200]],
  UNCLEAR: [
    ["aytvill/plastic-recycling-codes", "8_no_plastic", 200],
    ["viola77data/recycling-dataset", "glass", 25],
    ["viola77data/recycling-dataset", "aluminium", 25],
    ["viola77data/recycling-dataset", "cardboard", 25],
    ["viola77data/recycling-dataset", "paper", 25],
  ],
};

// Whole items. The dataset labels the object, not the resin, so we only use objects
// that are almost always one resin (water/soda bottles are PET, carry bags are LDPE, ...).
// Glass bottles, cans and styrofoam go to UNCLEAR so the model learns they are not our plastics.
const WHOLE_ITEMS = {
  PET: [["plastic_water_bottles", 150], ["plastic_soda_bottles", 150]],
  HDPE: [["plastic_detergent_bottles", 200]],
  PP: [["plastic_food_containers", 250], ["Q_Plastic Containers", 100]], // tubs, tiffins, boxes, incl. black ones
  LDPE: [["plastic_shopping_bags", 120], ["plastic_trash_bags", 120], ["N_Plastic Bag", 80]],
  UNCLEAR: [["glass_beverage_bottles", 80], ["aluminum_soda_cans", 50], ["paper_cups", 40], ["styrofoam_cups", 40], ["cardboard_boxes", 30]],
};
const SHARDS = [0, 1, 2].map((i) => `data/train-0000${i}-of-00003.parquet`);

// a dropped connection is retried twice, so one bad file doesn't stop a long download
async function save(url, file, tries = 3) {
  const res = await fetch(url).catch((e) => (tries > 1 ? null : Promise.reject(e)));
  if (!res?.ok) {
    if (tries > 1) return save(url, file, tries - 1);
    throw new Error(`${res?.status} ${url}`);
  }
  await pipeline(Readable.fromWeb(res.body), fs.createWriteStream(file));
}

// 1. symbol close-ups, one file at a time from the dataset folders
for (const [label, sources] of Object.entries(FOLDERS)) {
  const dir = path.join("ml", "data", label);
  fs.mkdirSync(dir, { recursive: true });
  for (const [dataset, folder, max] of sources) {
    const res = await fetch(`${HF}/api/datasets/${dataset}/tree/main/${encodeURIComponent(folder)}`);
    const files = (await res.json()).filter((f) => /\.(jpe?g|png)$/i.test(f.path)).slice(0, max).map((f) => f.path);
    for (const file of files) {
      const out = path.join(dir, dataset.split("/")[0] + "_" + path.basename(file));
      if (!fs.existsSync(out)) await save(`${HF}/datasets/${dataset}/resolve/main/${encodeURI(file)}`, out);
    }
    console.log(label, "<-", folder, files.length);
  }
}

// 2. whole items: the dataset is stored as 3 big parquet files (~1.5 GB), so download them
// once into ml/raw/ and pick out the rows we want
const wanted = Object.fromEntries(Object.entries(WHOLE_ITEMS).flatMap(([label, list]) => list.map(([orig, max]) => [orig, { label, max, taken: 0 }])));
fs.mkdirSync("ml/raw", { recursive: true });
for (const [i, shard] of SHARDS.entries()) {
  const local = `ml/raw/trashbusters-train-${i}.parquet`;
  if (!fs.existsSync(local)) await save(`${HF}/datasets/TrashBusters/combined/resolve/main/${shard}`, local);
  // utf8: false keeps the image bytes as bytes (otherwise they get decoded as text and break)
  const rows = await parquetReadObjects({ file: await asyncBufferFromFile(local), columns: ["original_label", "image"], utf8: false });
  for (const row of rows) {
    const label = row.original_label;
    const w = wanted[label];
    if (!w || w.taken >= w.max) continue;
    const ext = row.image.bytes[0] === 0x89 ? "png" : "jpg";
    const name = `tb_${label.replace(/\W+/g, "_")}_${w.taken++}.${ext}`;
    fs.writeFileSync(path.join("ml", "data", w.label, name), row.image.bytes);
  }
}
for (const [orig, w] of Object.entries(wanted)) console.log(w.label, "<-", orig, w.taken);

// 3. wrappers. TACO (photos of litter where it was found, CC BY 4.0) draws a box around every piece.
// Chocolate, biscuit and chips wrappers are printed PP film in India, so wrapper boxes go to PP;
// aluminium foil goes to UNCLEAR. Each box is cut out as a square with a little margin, like the app does.
const TACO = "RandyHuynh5815/TACO-Waste-Recognition";
const TACO_CLASSES = { "Other plastic wrapper": "PP", "Crisp packet": "PP", "Aluminium foil": "UNCLEAR" };
fs.mkdirSync("ml/raw/taco", { recursive: true });
if (!fs.existsSync("ml/raw/taco/annotations.json")) await save(`${HF}/datasets/${TACO}/resolve/main/annotations.json`, "ml/raw/taco/annotations.json");
const taco = JSON.parse(fs.readFileSync("ml/raw/taco/annotations.json", "utf8"));
const tacoLabel = Object.fromEntries(taco.categories.filter((c) => TACO_CLASSES[c.name]).map((c) => [c.id, TACO_CLASSES[c.name]]));
const tacoBoxes = taco.annotations.filter((a) => tacoLabel[a.category_id] && Math.max(a.bbox[2], a.bbox[3]) >= 150);
const tacoTaken = { PP: 0, UNCLEAR: 0 };
for (const image of taco.images.filter((im) => tacoBoxes.some((a) => a.image_id === im.id))) {
  const local = path.join("ml/raw/taco", image.file_name.replace("/", "_"));
  if (!fs.existsSync(local)) await save(`${HF}/datasets/${TACO}/resolve/main/${image.file_name}`, local);
  // the boxes are drawn on the photo turned upright, so apply the camera's rotation first
  const upright = await sharp(local).rotate().toBuffer({ resolveWithObject: true });
  if (upright.info.width !== image.width || upright.info.height !== image.height) continue;
  for (const a of tacoBoxes.filter((b) => b.image_id === image.id)) {
    const [x, y, w, h] = a.bbox;
    const side = Math.round(Math.min(Math.max(w, h) * 1.15, image.width, image.height));
    const left = Math.round(Math.min(Math.max(x + w / 2 - side / 2, 0), image.width - side));
    const top = Math.round(Math.min(Math.max(y + h / 2 - side / 2, 0), image.height - side));
    const label = tacoLabel[a.category_id];
    await sharp(upright.data).extract({ left, top, width: side, height: side }).resize(320, 320)
      .jpeg({ quality: 90 }).toFile(path.join("ml", "data", label, `taco_${a.id}.jpg`));
    tacoTaken[label]++;
  }
}
console.log("TACO wrappers -> PP", tacoTaken.PP, "| foil -> UNCLEAR", tacoTaken.UNCLEAR);

// 4. rooms and people (MIT Indoor 67 scenes, MIT licence) for UNCLEAR, so a photo of someone holding
// an item in an office isn't read as plastic. Each scene is saved whole and as one zoomed-in part,
// because the app also looks at parts of a photo when the item is held in a hand.
const INDOOR = "Voxel51/IndoorSceneRecognition";
const ROOMS = ["office", "meeting_room", "classroom", "computerroom", "livingroom", "kitchen", "dining_room",
  "waitingroom", "lobby", "corridor", "bedroom", "fastfood_restaurant"];
fs.mkdirSync("ml/raw/indoor", { recursive: true });
if (!fs.existsSync("ml/raw/indoor/samples.json")) await save(`${HF}/datasets/${INDOOR}/resolve/main/samples.json`, "ml/raw/indoor/samples.json");
const scenes = JSON.parse(fs.readFileSync("ml/raw/indoor/samples.json", "utf8")).samples;
let roomsTaken = 0;
for (const room of ROOMS) {
  for (const s of scenes.filter((x) => x.ground_truth?.label === room).slice(0, 20)) {
    const local = path.join("ml/raw/indoor", path.basename(s.filepath));
    if (!fs.existsSync(local)) await save(`${HF}/datasets/${INDOOR}/resolve/main/${s.filepath}`, local);
    const image = sharp(local).rotate();
    const { width, height } = await image.metadata();
    if (!width || !height) continue;
    const name = `room_${room}_${roomsTaken++}`;
    await image.clone().resize(320, 320, { fit: "cover" }).jpeg({ quality: 90 }).toFile(path.join("ml", "data", "UNCLEAR", `${name}.jpg`));
    const side = Math.round(Math.min(width, height) * 0.55); // a part of the room, placed by the file name so it repeats
    const left = (roomsTaken * 37) % (width - side + 1);
    const top = (roomsTaken * 53) % (height - side + 1);
    await image.clone().extract({ left, top, width: side, height: side }).resize(320, 320)
      .jpeg({ quality: 90 }).toFile(path.join("ml", "data", "UNCLEAR", `${name}_part.jpg`));
  }
}
console.log("rooms -> UNCLEAR", roomsTaken, "scenes, 2 photos each");
