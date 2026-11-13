import { supabase, type Plastic } from "./supabase";
import { recall, type Memory } from "./memory";
import type { Guess } from "./classify";

// Loads everyone's corrections once per visit; a new correction clears the copy so it counts at once.
let saved: Promise<Memory[]> | null = null;

function memories() {
  saved ??= Promise.resolve(supabase.from("corrections").select("type, name, embedding"))
    .then(({ data }) => (data ?? []) as Memory[])
    .catch(() => []);
  return saved;
}

// Whether anyone has taught Basellion anything yet (if not, there is nothing to look for)
export async function hasCorrections() {
  return (await memories()).length > 0;
}

// The model's guess, replaced by what people taught when this photo looks like one they corrected
export async function withCorrections(guess: Guess): Promise<Guess> {
  const learned = recall(await memories(), guess.embedding);
  if (!learned) return guess;
  return { ...guess, type: learned.type, name: learned.name ?? undefined, confidence: learned.similarity, learned: learned.votes };
}

// photo: the item's crop as a small JPEG, kept for retraining; only the fingerprint is shared with other users
export async function teach(guess: Guess, type: Plastic, photo: string, name: string) {
  const { error } = await supabase.from("corrections").insert({ ai_type: guess.type, type, name: name || null, embedding: guess.embedding, photo });
  saved = null;
  return error;
}
