// Adds the photos people corrected with "Teach Basellion" to the training data, so the next
// `npm run train` learns from them. Each lands in ml/data/<right type>/fix_<id>.jpg.
// Needs the service key (Supabase dashboard -> Project Settings -> API keys), never put in the app:
//   SUPABASE_SERVICE_ROLE_KEY=... node --env-file=.env.local ml/corrections.mjs
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!key) throw new Error("Set SUPABASE_SERVICE_ROLE_KEY first");
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, key, { auth: { persistSession: false } });
const { data, error } = await db.from("corrections").select("id, type, photo").not("photo", "is", null);
if (error) throw error;

const added = {};
for (const { id, type, photo } of data) {
  const file = path.join("ml", "data", type, `fix_${id}.jpg`);
  if (fs.existsSync(file)) continue;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, Buffer.from(photo.split(",")[1], "base64"));
  added[type] = (added[type] ?? 0) + 1;
}
console.log(`${data.length} corrections, new photos:`, added, "-> now run npm run train");
