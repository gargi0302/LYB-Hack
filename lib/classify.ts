import type { LayersModel, SymbolicTensor, Tensor } from "@tensorflow/tfjs";
import type { Plastic } from "./supabase";
import { squareCanvas, type Picture } from "./image";

// Our trained model (see ml/train.mjs) runs here, inside the browser.
// The photo is never uploaded anywhere.
let model: LayersModel | null = null; // gives two answers: the photo's fingerprint and the type scores
let labels: Plastic[] = [];
let backendChosen = false;

// TensorFlow.js, loaded only when someone actually takes a photo.
// The graphics card makes it fast; some phones and browsers block WebGL, then the plain CPU still works.
export async function loadTf() {
  const tf = await import("@tensorflow/tfjs");
  if (!backendChosen) {
    const gpu = !softwareWebgl() && await tf.setBackend("webgl").catch(() => false);
    if (!gpu) await tf.setBackend("cpu");
    backendChosen = true;
  }
  return tf;
}

// Chrome falls back to a software "graphics card" (SwiftShader) when it distrusts the real one. Our model
// gives wrong answers there (everything came out "not plastic" in testing), so use the CPU instead.
function softwareWebgl() {
  try {
    const gl = document.createElement("canvas").getContext("webgl");
    const info = gl?.getExtension("WEBGL_debug_renderer_info");
    const renderer = gl && info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : "";
    return /swiftshader|llvmpipe|software/i.test(renderer);
  } catch {
    return false;
  }
}

// embedding: what the model "sees" in the photo, 1024 numbers scaled to length 1. Two photos of the
// same kind of item have embeddings pointing the same way, which is how corrections are recalled (lib/memory.ts).
export type Guess = { type: Plastic; confidence: number; scores: Record<Plastic, number>; embedding: number[]; learned?: number; name?: string };

// Several pictures in one go (crops of one photo), which is much faster than one by one.
export async function classifyMany(pics: Picture[]): Promise<Guess[]> {
  const tf = await loadTf();
  if (!model) {
    const trained = await tf.loadLayersModel("/model/model.json");
    const features = trained.getLayer("conv_pw_13_relu").output as SymbolicTensor;
    model = tf.model({ inputs: trained.inputs, outputs: [features, trained.outputs[0]] });
    labels = (await (await fetch("/model/metadata.json")).json()).labels;
  }
  // same preparation as training: centre square, 224x224, pixels scaled to [-1, 1]
  const [embeddings, probs] = tf.tidy(() => {
    const x = tf.stack(pics.map((pic) => tf.browser.fromPixels(squareCanvas(pic, 224)).toFloat().div(127.5).sub(1)));
    const [features, scores] = model!.predict(x) as Tensor[];
    const mean = features.mean([1, 2]);
    return [mean.div(mean.norm("euclidean", 1, true)).arraySync() as number[][], scores.arraySync() as number[][]];
  });
  return probs.map((p, i) => {
    const best = p.indexOf(Math.max(...p));
    const scores = Object.fromEntries(labels.map((label, j) => [label, p[j]])) as Record<Plastic, number>;
    return { type: labels[best], confidence: p[best], scores, embedding: embeddings[i] };
  });
}
