import { createClient } from "@supabase/supabase-js";

// One client for the whole app. The anon key is safe in the browser:
// what each user can read or change is decided by RLS rules in the database.
export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export type Role = "generator" | "collector" | "recycler" | "plantx";
export type Plastic = "PET" | "HDPE" | "PP" | "LDPE" | "UNCLEAR";

export type Profile = {
  id: string;
  role: Role;
  name: string;
  area: string;
  lat: number;
  lng: number;
  accepted_types: Plastic[];
  max_km?: number; // collectors: how far they go for a pickup
  fee_per_km?: number; // collectors: ₹ per km beyond 5 km
  free_slots?: string[] | null; // collectors: weekly free slots, "weekday-hour"; empty = all
  capacity_kg: number;
  language: string;
  age: number | null;
  gender: string | null;
  phone: string | null;
};

export type Address = {
  id: string; label: string; line: string; area: string; lat: number; lng: number;
  pincode: string | null; city: string | null; state: string | null; // null on the demo addresses
};

export const STATUSES = ["requested", "matched", "scheduled", "on_the_way", "picked_up", "delivered", "recycled"] as const;
export type Status = (typeof STATUSES)[number];


export type Batch = {
  id: string;
  generator_id: string;
  area: string;
  lat: number;
  lng: number;
  ai_type: Plastic | null;
  distance_km?: number | null; // to the collector, set when one is chosen
  pickup_fee?: number; // ₹ the user pays the collector in cash; 0 within 5 km
  ai_confidence: number | null;
  final_type: Plastic;
  verify_at_pickup: boolean;
  declared_kg: number;
  collector_id: string | null;
  recycler_id: string | null;
  scheduled_at: string | null;
  actual_kg: number | null;
  actual_type: Plastic | null;
  quality_grade: "A" | "B" | "C" | null;
  weight_flag: boolean | null;
  status: Status;
  created_at: string;
  batch_addresses: { address: string; phone: string | null } | null; // null when RLS hides it
  collector?: { name: string } | null;
  batch_items?: { position: number; name: string | null; count: number; type: Plastic }[];
};

// the different plastics in a listing (older listings have no items, just the one type)
// the plastics in a batch; items saved as UNCLEAR are "not sure, checked at pickup" and don't count
// (a collector is matched on the plastics they take, and nobody "takes" UNCLEAR)
export function typesOf(b: Batch): Plastic[] {
  const types = [...new Set((b.batch_items ?? []).map((i) => i.type).filter((t) => t !== "UNCLEAR"))];
  return types.length ? types : [b.final_type];
}

// The database calls households and businesses "generator"; on screen they are "User" (role.generator in lib/i18n.ts)

// where each role lands after logging in
export const homeFor = (role: Role) => ({ generator: "/user", collector: "/collector", recycler: "/recycler", plantx: "/dashboard" })[role];

// Every status change goes through here. The database trigger checks the step is
// allowed for this role and writes it to the event log together with the note.
export async function advance(id: string, status: Status, fields: object = {}, note: string | null = null) {
  const { error } = await supabase.from("batches").update({ ...fields, status, last_note: note }).eq("id", id);
  if (error) alert(error.message);
  return !error;
}
