// Checks the database rules by logging in as each demo user through the real API.
// Needs the local database running:  npx supabase start
// Run:  node --env-file=.env.local --test tests/
import { test } from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

async function login(who) {
  const db = createClient(url, key, { auth: { persistSession: false } });
  const { data, error } = await db.auth.signInWithPassword({ email: `${who}@demo.test`, password: "demo1234" });
  assert.ifError(error);
  return { db, id: data.user.id };
}

test("generator only sees their own batches and no other generators", async () => {
  const { db, id } = await login("user");
  const { data: batches } = await db.from("batches").select("generator_id");
  assert.ok(batches.length > 0);
  assert.ok(batches.every((b) => b.generator_id === id));
  const { data: people } = await db.from("profiles").select("role, id");
  assert.ok(people.every((p) => p.role !== "generator" || p.id === id));
});

test("collector can turn down a requested slot", async () => {
  const { db } = await login("collector");
  const { data: [batch] } = await db.from("batches").select("id").eq("status", "matched").limit(1);
  assert.ifError((await db.from("batches").update({ status: "requested", scheduled_at: null }).eq("id", batch.id)).error);
});

test("collector gets the address only after confirming", async () => {
  const { db } = await login("collector");
  const { data: batches } = await db.from("batches").select("id, status, batch_addresses(address)");
  const matched = batches.filter((b) => b.status === "matched");
  const scheduled = batches.filter((b) => b.status === "scheduled");
  assert.ok(matched.length > 0 && scheduled.length > 0);
  assert.ok(matched.every((b) => b.batch_addresses === null));
  assert.ok(scheduled.every((b) => b.batch_addresses?.address));
});

test("plant X and the public see no batches, only totals", async () => {
  const { db } = await login("plantx");
  assert.equal((await db.from("batches").select("id")).data.length, 0);
  assert.ok((await db.from("impact_weekly").select("*")).data.length > 0);
  const anon = createClient(url, key, { auth: { persistSession: false } });
  assert.equal((await anon.from("batches").select("id")).data.length, 0);
  assert.equal((await anon.from("impact_weekly").select("*")).data, null);
});

test("status changes follow the role rules and are logged", async () => {
  const { db } = await login("collector");
  const { data: [batch] } = await db.from("batches").select("id").eq("status", "matched").limit(1);

  // a collector cannot jump straight to recycled
  const skip = await db.from("batches").update({ status: "recycled" }).eq("id", batch.id);
  assert.match(skip.error.message, /cannot move/);

  const ok = await db.from("batches")
    .update({ status: "scheduled", scheduled_at: new Date().toISOString(), last_note: "test pickup" })
    .eq("id", batch.id);
  assert.ifError(ok.error);
  const { data: events } = await db.from("status_events").select("to_status, actor_role, note").eq("batch_id", batch.id).order("id");
  assert.deepEqual(events.at(-1), { to_status: "scheduled", actor_role: "collector", note: "test pickup" });

  // then on the way and picked up, which gives the user coins
  assert.ifError((await db.from("batches").update({ status: "on_the_way", last_note: null }).eq("id", batch.id)).error);
  assert.ifError((await db.from("batches").update({ status: "picked_up", last_note: null }).eq("id", batch.id)).error);

  // the log is append-only: deletes silently affect nothing
  const count = async () => (await db.from("status_events").select("id").eq("batch_id", batch.id)).data.length;
  const before = await count();
  assert.equal(before, events.length + 2);
  await db.from("status_events").delete().eq("batch_id", batch.id);
  assert.equal(await count(), before);
});

test("public QR history has no names", async () => {
  const { db } = await login("user");
  const { data: [batch] } = await db.from("batches").select("id").eq("status", "recycled").limit(1);
  const anon = createClient(url, key, { auth: { persistSession: false } });
  const { data: history } = await anon.rpc("batch_history", { batch: batch.id });
  assert.equal(history.at(-1).status, "recycled");
  assert.deepEqual(Object.keys(history[0]).sort(), ["area", "at", "by_role", "grade", "kg", "plastic", "status"]);
});

test("addresses are private to their owner", async () => {
  const user = await login("user");
  assert.equal((await user.db.from("addresses").select("id")).data.length, 2);
  const collector = await login("collector");
  assert.equal((await collector.db.from("addresses").select("id")).data.length, 0);
});

test("sign-up as a user also saves the first address", async () => {
  const db = createClient(url, key, { auth: { persistSession: false } });
  const { data } = await db.auth.signUp({ email: `new${Date.now()}@demo.test`, password: "test1234" });
  const row = { id: data.user.id, name: "Test Flat", area: "Palm Vihar", lat: 19.07, lng: 72.88 };
  assert.ifError((await db.from("profiles").insert({ ...row, role: "generator", phone: "9000000000", age: 30 })).error);
  assert.ifError((await db.from("addresses").insert({ label: "Home", line: "Flat 1", area: "Palm Vihar", lat: 19.07, lng: 72.88 })).error);
});

test("one email, one role: chosen at sign-up and never changed", async () => {
  const email = `collector${Date.now()}@demo.test`;
  const db = createClient(url, key, { auth: { persistSession: false } });
  const { data } = await db.auth.signUp({ email, password: "test1234" });
  const row = { id: data.user.id, name: "Test Scrap Co", area: "Udyog Park", lat: 19.041, lng: 72.862 };
  // any role can be chosen, but only for your own login
  assert.ifError((await db.from("profiles").insert({ ...row, role: "collector", accepted_types: ["PET"], capacity_kg: 100 })).error);
  // a second profile (another role) for the same login is refused
  assert.ok((await db.from("profiles").insert({ ...row, role: "recycler" })).error);
  // the role cannot be changed later, other details can
  assert.match((await db.from("profiles").update({ role: "recycler" }).eq("id", row.id)).error.message, /cannot be changed/);
  assert.ifError((await db.from("profiles").update({ capacity_kg: 150 }).eq("id", row.id)).error);
  // and the same email cannot sign up again
  const again = await createClient(url, key, { auth: { persistSession: false } }).auth.signUp({ email, password: "test1234" });
  assert.ok(again.error || !again.data.user?.identities?.length);
  // nobody can create a profile for someone else
  const other = createClient(url, key, { auth: { persistSession: false } });
  await other.auth.signUp({ email: `other${Date.now()}@demo.test`, password: "test1234" });
  assert.ok((await other.from("profiles").insert({ ...row, id: crypto.randomUUID(), role: "plantx" })).error);
});

test("a photo fingerprint is found again in any listing", async () => {
  const { db } = await login("user");
  const { data: [batch] } = await db.from("batches").select("id").limit(1);
  await db.from("batches").update({ photo_hashes: ["aaaa", "bbbb"] }).eq("id", batch.id);
  assert.equal((await db.rpc("photo_used", { hash: "bbbb" })).data, true);
  assert.equal((await db.rpc("photo_used", { hash: "cccc" })).data, false);
});

test("items of a listing follow the listing's privacy", async () => {
  const user = await login("user");
  const collector = await login("collector");
  // one of the user's listings this collector is not on (the one they are on, they may see)
  const { data: [mine] } = await user.db.from("batches").select("id").eq("generator_id", user.id)
    .or(`collector_id.is.null,collector_id.neq.${collector.id}`).limit(1);
  assert.ifError((await user.db.from("batch_items").insert({ batch_id: mine.id, position: 1, name: "biscuit wrapper", type: "PP" })).error);
  const { data: [theirs] } = await collector.db.from("batches").select("id").limit(1);
  // a collector can't add items to someone's listing, and nobody else sees this user's items
  assert.ok((await collector.db.from("batch_items").insert({ batch_id: theirs.id, position: 9, type: "PET" })).error);
  assert.equal((await collector.db.from("batch_items").select("id").eq("batch_id", mine.id)).data.length, 0);
});

test("demo reset puts the demo data back (Plant X only)", async () => {
  const { db } = await login("plantx");
  assert.ifError((await db.rpc("reset_demo")).error);
});

test("corrections: everyone reads fingerprints, nobody reads others' photos", async () => {
  const { db } = await login("user");
  const embedding = Array.from({ length: 1024 }, (_, i) => (i === 0 ? 1 : 0));
  assert.ifError((await db.from("corrections").insert({ ai_type: "LDPE", type: "PP", embedding, photo: "data:image/jpeg;base64,AA==" })).error);
  // the same type as the AI is not a correction
  assert.ok((await db.from("corrections").insert({ ai_type: "PP", type: "PP", embedding })).error);
  const { db: other } = await login("collector");
  assert.ok((await other.from("corrections").select("type, embedding")).data.length > 0);
  assert.ok((await other.from("corrections").select("photo")).error);
  assert.ok((await other.from("corrections").select("user_id")).error);
  const anon = createClient(url, key, { auth: { persistSession: false } });
  assert.ok((await anon.from("corrections").select("type")).error);
});

test("collectors set their reach and rate; the database works out the pickup charge", async () => {
  const { db: col, id: colId } = await login("collector");
  assert.ifError((await col.from("profiles").update({ max_km: 25, fee_per_km: 10, free_slots: ["1-9", "3-16"] }).eq("id", colId)).error);
  assert.ok((await col.from("profiles").update({ max_km: 500 }).eq("id", colId)).error); // over 50 km is refused
  const { data: me } = await col.from("profiles").select("lat, lng").eq("id", colId).single();

  // a user lists a batch about 9 km from the collector and asks them
  const { db } = await login("user");
  const lat = me.lat + 0.08;
  const { data: batch, error } = await db.from("batches").insert({
    area: "Test area", lat, lng: me.lng, final_type: "PET", declared_kg: 1, last_note: "reach test",
  }).select("id").single();
  assert.ifError(error);
  const asked = await db.from("batches").update({ status: "matched", collector_id: colId, scheduled_at: new Date(Date.now() + 86400000).toISOString() })
    .eq("id", batch.id).select("distance_km, pickup_fee").single();
  assert.ifError(asked.error);
  assert.ok(asked.data.distance_km > 8 && asked.data.distance_km < 10);
  assert.equal(Number(asked.data.pickup_fee), Math.round((asked.data.distance_km - 5) * 10)); // close enough: same formula
  // the user can't lower the charge
  const tampered = await db.from("batches").update({ pickup_fee: 0 }).eq("id", batch.id).select("pickup_fee").single();
  assert.ok(Number(tampered.data.pickup_fee) > 0);

  // back to 5 km: the same pickup is now refused
  await col.from("profiles").update({ max_km: 5, fee_per_km: 0, free_slots: null }).eq("id", colId);
  const { data: second } = await db.from("batches").insert({ area: "Test area", lat, lng: me.lng, final_type: "PET", declared_kg: 1, last_note: "reach test" }).select("id").single();
  assert.ok((await db.from("batches").update({ status: "matched", collector_id: colId, scheduled_at: new Date(Date.now() + 86400000).toISOString() }).eq("id", second.id)).error);
});

test("only Plant X can reset the demo data", async () => {
  for (const who of ["user", "collector", "recycler"]) {
    const { db } = await login(who);
    const { error } = await db.rpc("reset_demo");
    assert.match(error?.message ?? "", /Only Plant X/, `${who} must not reset`);
  }
  const anon = createClient(url, key, { auth: { persistSession: false } });
  assert.ok((await anon.rpc("reset_demo")).error);
});

test("weak passwords are refused at sign-up", async () => {
  const db = createClient(url, key, { auth: { persistSession: false } });
  const email = `weak${Date.now()}@test.local`;
  assert.equal((await db.auth.signUp({ email, password: "123456" })).error?.code, "weak_password"); // too short
  assert.equal((await db.auth.signUp({ email, password: "onlyletters" })).error?.code, "weak_password"); // no numbers
});

test("Plant X sees totals for its own city only, nobody else gets them", async () => {
  const { db: plant } = await login("plantx");
  const { data: rows, error } = await plant.rpc("city_impact");
  assert.ifError(error);
  assert.ok(rows.length > 0 && rows.every((r) => r.kg > 0));
  assert.ok((await plant.rpc("city_leaderboard")).data.length > 0);
  for (const who of ["user", "collector", "recycler"]) {
    const { db } = await login(who);
    assert.deepEqual((await db.rpc("city_impact")).data, []);
    assert.equal(Number((await db.rpc("city_corrections")).data), 0);
  }
  // the city rule: names match when both are known, otherwise within 25 km
  const inCity = async (b_city, b_lat, b_lng, p_city, p_lat = 19.04, p_lng = 72.87) =>
    (await plant.rpc("in_city", { b_city, b_lat, b_lng, p_city, p_lat, p_lng })).data;
  assert.equal(await inCity("mumbai ", 0, 0, "Mumbai"), true); // names win, even with a far-off point
  assert.equal(await inCity("Pune", 19.05, 72.87, "Mumbai"), false);
  assert.equal(await inCity(null, 19.17, 72.96, "Mumbai"), true); // no city on the batch: ~17 km away
  assert.equal(await inCity(null, 18.52, 73.86, null), false); // Pune is ~120 km away
});
