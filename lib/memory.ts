import type { Plastic } from "./supabase";

// "Teach Basellion". When someone corrects the photo AI, the photo's embedding (see lib/classify.ts)
// is saved with the right type. A later photo whose embedding is almost the same gets that type,
// for every user, straight away, without retraining. The corrected photos also go into the next
// retraining (ml/corrections.mjs), which is what makes the model itself better at similar items.

export type Memory = { type: Plastic; name?: string | null; embedding: number[] };
export type Recalled = { type: Plastic; name: string | null; similarity: number; votes: number };

// How alike two photos must be to count as "the same item". Measured with our model: a photo against
// cropped, turned, darker and blurred copies of itself scored 0.72 to 0.89 (0.91 on average), while
// the most alike *different* photo among ~1,000 training photos scored at most 0.68.
export const SAME_ITEM = 0.75;

// embeddings have length 1, so the dot product is the cosine similarity (1 = identical)
export function similarity(a: number[], b: number[]) {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += a[i] * b[i];
  return sum;
}

// The corrections that look like this photo vote on its type. One mistaken or mischievous correction
// can't override several honest ones, and a tie means we don't know, so the model's own answer stays.
export function recall(memories: Memory[], embedding: number[]): Recalled | null {
  const close = memories
    .map((m) => ({ type: m.type, name: m.name ?? null, similarity: similarity(m.embedding, embedding) }))
    .filter((m) => m.similarity >= SAME_ITEM);
  if (!close.length) return null;
  const votes = new Map<Plastic, { votes: number; best: number }>();
  for (const m of close) {
    const v = votes.get(m.type) ?? { votes: 0, best: 0 };
    votes.set(m.type, { votes: v.votes + 1, best: Math.max(v.best, m.similarity) });
  }
  const ranked = [...votes].sort((a, b) => b[1].votes - a[1].votes || b[1].best - a[1].best);
  if (ranked[1] && ranked[1][1].votes === ranked[0][1].votes) return null;
  const [type, { votes: n, best }] = ranked[0];
  // the name from the closest photo of that type
  const name = close.filter((m) => m.type === type).sort((a, b) => b.similarity - a.similarity)[0].name;
  return { type, name, similarity: best, votes: n };
}
