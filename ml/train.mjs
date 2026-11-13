// Trains the plastic-type classifier and saves it to public/model/ in TensorFlow.js format.
// Same idea as Google Teachable Machine: reuse MobileNet (already trained on ImageNet) to turn
// each photo into features, then train only a small classifier on top of those features.
// Run: node ml/download.mjs  then  node ml/train.mjs [mobilenet width, default 0.50]
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import * as tf from "@tensorflow/tfjs";
import "@tensorflow/tfjs-backend-wasm";

const LABELS = ["PET", "HDPE", "PP", "LDPE", "UNCLEAR"]; // same order as the app uses
const WIDTH = process.argv[2] || "0.50";
const BASE_URL = `https://storage.googleapis.com/tfjs-models/tfjs/mobilenet_v1_${WIDTH}_224/model.json`;
const OUT = process.env.OUT ?? "public/model";
// training copies of every photo: as it is, black and white, and flipped + zoomed in (AUG=0 leaves that out)
const VERSIONS = process.env.AUG === "0" ? ["plain", "grey"] : ["plain", "grey", "zoom"];

await tf.setBackend("wasm");

// a number from 0 to 1 that is always the same for the same file name, so runs can be repeated
const fraction = (name, salt) => [...name + salt].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) / 2 ** 32;

// Centre-crop to a square, resize to 224x224 and scale pixels to [-1, 1].
// The browser code in lib/classify.ts must do exactly the same thing.
// "zoom": a mirrored 75% part of the photo, as if taken closer and from the other side.
async function loadImage(file, version = "plain") {
  let image = sharp(file).rotate();
  if (version === "zoom") {
    const { width, height } = await image.metadata();
    const w = Math.round(width * 0.75), h = Math.round(height * 0.75);
    const left = Math.round((width - w) * fraction(file, "x")), top = Math.round((height - h) * fraction(file, "y"));
    image = sharp(await image.extract({ left, top, width: w, height: h }).flop().toBuffer());
  }
  const raw = await image.resize(224, 224, { fit: "cover" }).removeAlpha().raw().toBuffer();
  return tf.tidy(() => {
    const rgb = tf.tensor3d(new Uint8Array(raw), [224, 224, 3]).toFloat();
    return (version === "grey" ? rgb.mean(2, true).tile([1, 1, 3]) : rgb).div(127.5).sub(1);
  });
}

// every 5th photo of each class goes to the test set, the rest is for training.
// A room and its zoomed-in part ("_part") always go to the same side, so the test stays honest.
// Crops of our own photos ("own_", from ml/own.mjs) are many copies of a few photos, so they are
// only trained on; ml/check.mjs on the held-out photos in ml/own/test_* checks them instead.
const train = [], test = [];
LABELS.forEach((label, i) => {
  const files = fs.readdirSync(path.join("ml/data", label)).sort();
  for (const f of files.filter((f) => f.startsWith("own_"))) train.push({ file: path.join("ml/data", label, f), y: i });
  const groups = [...new Set(files.filter((f) => !f.startsWith("own_")).map((f) => f.replace(/_part(?=\.)/, "")))];
  const inTest = new Set(groups.filter((_, n) => n % 5 === 0));
  for (const f of files.filter((f) => !f.startsWith("own_"))) (inTest.has(f.replace(/_part(?=\.)/, "")) ? test : train).push({ file: path.join("ml/data", label, f), y: i });
});
console.log(`train ${train.length} photos, test ${test.length} photos`);

// MobileNet without its last layers, so it outputs features instead of ImageNet classes
const mobilenet = await tf.loadLayersModel(BASE_URL);
const cut = mobilenet.getLayer("conv_pw_13_relu");
const base = tf.model({ inputs: mobilenet.inputs, outputs: cut.output });

// Training photos are also used in black and white, so the model can't lean on colour alone
// (lots of LDPE photos are black bin bags, which made a black tiffin look like LDPE), and flipped
// and zoomed in, so a new angle or framing of a known kind of item isn't new to it.
// Test photos are only used as they are, so the test score stays honest.
async function features(set, versions) {
  const out = [], ys = [];
  for (const { file, y } of set) {
    for (const version of versions) {
      const img = await loadImage(file, version);
      // averaged right away (1024 numbers a photo): the full 7x7 maps of every photo don't fit in memory
      out.push(tf.tidy(() => base.predict(img.expandDims()).mean([1, 2])));
      ys.push(y);
      img.dispose();
    }
  }
  return { x: tf.concat(out), y: tf.oneHot(ys, LABELS.length) };
}
const trainData = await features(train, VERSIONS);
const testData = await features(test, ["plain"]);

// the only part we train: one hidden layer on the averaged features, then 5 outputs
const head = tf.sequential({
  layers: [
    tf.layers.dropout({ rate: 0.3, inputShape: [cut.outputShape[3]] }),
    tf.layers.dense({ units: 100, activation: "relu" }),
    tf.layers.dense({ units: LABELS.length, activation: "softmax" }),
  ],
});
head.compile({ optimizer: tf.train.adam(0.001), loss: "categoricalCrossentropy", metrics: ["accuracy"] });
// HDPE and LDPE have the fewest photos, so mistakes on them count more
const classWeight = Object.fromEntries(LABELS.map((_, i) => [i, train.length / (LABELS.length * train.filter((s) => s.y === i).length)]));
await head.fit(trainData.x, trainData.y, { epochs: 40, batchSize: 16, shuffle: true, verbose: 0, classWeight });

// Test set results, including how accurate each confidence band is.
// This is what tells us whether the 85% / 60% thresholds in the app make sense.
const probs = await head.predict(testData.x).array();
const truth = test.map((s) => s.y);
const confusion = LABELS.map(() => LABELS.map(() => 0));
const bands = { high: [0, 0], mid: [0, 0], low: [0, 0] }; // [right, total]
// close-up of the symbol, photo of a whole item, a wrapper or foil from TACO, a room
const kinds = { symbol: [0, 0], wholeItem: [0, 0], wrapperOrFoil: [0, 0], room: [0, 0] };
const kindOf = (file) => ({ tb: "wholeItem", taco: "wrapperOrFoil", room: "room" })[path.basename(file).split("_")[0]] ?? "symbol";
probs.forEach((p, i) => {
  const guess = p.indexOf(Math.max(...p));
  confusion[truth[i]][guess]++;
  const band = p[guess] >= 0.85 ? "high" : p[guess] >= 0.6 ? "mid" : "low";
  const kind = kindOf(test[i].file);
  for (const tally of [bands[band], kinds[kind]]) {
    tally[0] += guess === truth[i];
    tally[1]++;
  }
});
const summary = (tallies) => Object.fromEntries(Object.entries(tallies).map(([k, [r, t]]) => [k, { photos: t, accuracy: t ? +(r / t).toFixed(2) : null }]));
const correct = confusion.reduce((sum, row, i) => sum + row[i], 0);
const results = {
  mobilenet: `v1 ${WIDTH}`,
  trainPhotos: train.length,
  testPhotos: test.length,
  testAccuracy: +(correct / test.length).toFixed(3),
  perClassRecall: Object.fromEntries(LABELS.map((l, i) => [l, +(confusion[i][i] / confusion[i].reduce((a, b) => a + b)).toFixed(2)])),
  confusion: { rows_are_truth_cols_are_guess: LABELS, matrix: confusion },
  byPhotoKind: summary(kinds),
  confidenceBands: summary(bands),
};
console.log(JSON.stringify(results, null, 2));
if (OUT === "public/model") fs.writeFileSync("ml/results.json", JSON.stringify(results, null, 2));

// Glue MobileNet and our head into one model so the browser loads a single file.
// tfjs-node is not needed: we take the model files from a custom save handler and write them ourselves.
const pooled = tf.layers.globalAveragePooling2d({}).apply(base.outputs[0]);
const full = tf.model({ inputs: base.inputs, outputs: head.apply(pooled) });
fs.mkdirSync(OUT, { recursive: true });
await full.save(tf.io.withSaveHandler(async (art) => {
  fs.writeFileSync(path.join(OUT, "weights.bin"), Buffer.from(art.weightData));
  const modelJson = { modelTopology: art.modelTopology, format: art.format, weightsManifest: [{ paths: ["weights.bin"], weights: art.weightSpecs }] };
  fs.writeFileSync(path.join(OUT, "model.json"), JSON.stringify(modelJson));
  return { modelArtifactsInfo: { dateSaved: new Date(), modelTopologyType: "JSON" } };
}));
fs.writeFileSync(path.join(OUT, "metadata.json"), JSON.stringify({ labels: LABELS, imageSize: 224, testAccuracy: results.testAccuracy }, null, 2));
console.log("saved to", OUT);
