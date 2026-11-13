// Plain logic checks, no database needed. Node runs the .ts files directly (type stripping).
import { test } from "node:test";
import assert from "node:assert/strict";
import { distanceKm, topMatches } from "../lib/match.ts";
import { band, estimateValue, hintFor } from "../lib/plastics.ts";
import { openSlots, slotLabel } from "../lib/slots.ts";
import { fedThisMonth, greenness, growth } from "../lib/growth.ts";
import { recall, SAME_ITEM } from "../lib/memory.ts";
import { partsOf } from "../lib/objects.ts";

test("haversine distance is about right", () => {
  const mumbai = { lat: 19.076, lng: 72.8777 };
  const pune = { lat: 18.5204, lng: 73.8567 };
  assert.ok(Math.abs(distanceKm(mumbai, pune) - 120) < 5); // straight line is ~120 km
});

test("matching filters by type and capacity, then sorts by distance", () => {
  const person = (name, lat, types, cap) => ({ id: name, name, lat, lng: 72.85, accepted_types: types, capacity_kg: cap });
  const people = [
    person("far", 19.3, ["PET"], 100),
    person("near", 19.11, ["PET"], 100),
    person("wrong type", 19.1, ["PP"], 100),
    person("too small", 19.1, ["PET"], 5),
    person("middle", 19.2, ["PET", "PP"], 100),
    person("fourth", 19.4, ["PET"], 100),
  ];
  const top = topMatches(people, ["PET"], 10, { lat: 19.1, lng: 72.85 });
  assert.deepEqual(top.map((p) => p.name), ["near", "middle", "far"]);
  assert.equal(top[0].km.toFixed(1), "1.1");
});

test("collectors further than the limit are left out", () => {
  const people = [{ id: "a", name: "near", lat: 19.11, lng: 72.85, accepted_types: ["PET"], capacity_kg: 50 },
    { id: "b", name: "far", lat: 19.3, lng: 72.85, accepted_types: ["PET"], capacity_kg: 50 }];
  assert.deepEqual(topMatches(people, ["PET"], 5, { lat: 19.1, lng: 72.85 }, 5).map((p) => p.name), ["near"]);
  // a listing with PET and PP needs a collector who takes both
  assert.deepEqual(topMatches(people, ["PET", "PP"], 5, { lat: 19.1, lng: 72.85 }).map((p) => p.name), []);
});

test("confidence bands follow the 85% / 60% rule", () => {
  assert.equal(band(0.85), "auto");
  assert.equal(band(0.84), "confirm");
  assert.equal(band(0.6), "confirm");
  assert.equal(band(0.59), "manual");
});

test("value estimate uses grade", () => {
  assert.equal(estimateValue("PET", 10), "₹150–250");
  assert.equal(estimateValue("PET", 10, "B"), "₹200");
});

test("slots: 2-hour windows, an hour's notice, full slots hidden", () => {
  const now = new Date(2026, 10, 12, 10, 30); // 12 Nov, 10:30
  const at = (d, h) => new Date(2026, 10, d, h).toISOString();
  const slots = openSlots([{ slot: at(12, 16), booked: 3 }, { slot: at(13, 9), booked: 1 }], now);
  // 12 PM today is open (1.5 h away), 4 PM today is full, 9 AM tomorrow has 2 left
  assert.deepEqual(slots.slice(0, 2).map((s) => [s.start.getDate(), s.start.getHours(), s.left]), [[12, 12, 3], [13, 9, 2]]);
  assert.match(slotLabel(new Date(2026, 10, 13, 16)), /, 4 PM–6 PM$/);
  assert.match(slotLabel(new Date(2026, 10, 13, 9), "hi"), /, सुबह 9–11 बजे$/);
  assert.match(slotLabel(new Date(2026, 10, 13, 16), "mr"), /, संध्याकाळी 4–6$/);
});

test("a typed name suggests the usual plastic", () => {
  assert.equal(hintFor("Dark Fantasy wrapper"), "PP");
  assert.equal(hintFor("black tiffin"), "PP");
  assert.equal(hintFor("Amul milk pouch"), "LDPE");
  assert.equal(hintFor("milk can"), "HDPE");
  assert.equal(hintFor("Bisleri water bottle"), "PET");
  assert.equal(hintFor("shampoo bottle"), "HDPE");
  assert.equal(hintFor("old newspaper"), null);
  assert.equal(hintFor("दूध की थैली"), "LDPE");
  assert.equal(hintFor("बिस्किटचे रॅपर"), "PP");
  assert.equal(hintFor("पाण्याची बाटली"), "PET");
});

test("Basellion grows by stage (under 50 kg, 50–500 kg, 500+ kg) and a little per meal", () => {
  // the three stages: bigger and happier with more kilos
  const [small, mid, big] = [growth(20, 0), growth(160, 0), growth(600, 0)];
  assert.deepEqual([small.stage, mid.stage, big.stage], [1, 2, 3]);
  assert.ok(small.size < mid.size && mid.size < big.size);
  assert.ok(small.happiness < 50 && mid.happiness === 50 && big.happiness > 50);
  // every listing eaten: a little bigger and a little happier
  const fed = growth(160, 1);
  assert.equal(fed.size - mid.size, 2);
  assert.equal(fed.happiness - mid.happiness, 1);
  // eating often never jumps a stage: that needs the kilos
  const often = growth(49, 100);
  assert.equal(often.stage, 1);
  assert.ok(often.size < mid.size && often.happiness < mid.happiness);
  assert.ok(growth(5000, 1000).happiness <= 100);
});

test("fed this month counts recyclable listings from the last 30 days", () => {
  const now = new Date(2026, 10, 12).getTime();
  const ago = (days) => new Date(now - days * 86400000).toISOString();
  const month = fedThisMonth([
    { final_type: "PET", declared_kg: 10, created_at: ago(1) },
    { final_type: "UNCLEAR", declared_kg: 4, created_at: ago(2) },
    { final_type: "PP", declared_kg: 5.5, created_at: ago(29) },
    { final_type: "PP", declared_kg: 99, created_at: ago(31) },
  ], now);
  assert.deepEqual(month, { kg: 15.5, meals: 2 });
});

test("Basellion's world turns greener with recycling: pale for a new user, full green at 500 kg", () => {
  assert.equal(greenness(0, 0), 0);
  assert.ok(greenness(10, 1) > 0.1);
  assert.ok(greenness(50, 3) < greenness(200, 3));
  assert.ok(greenness(160, 5) < greenness(160, 6));
  assert.equal(greenness(500, 0), 1);
  assert.equal(greenness(2000, 50), 1);
});

// unit vectors: "angle" picks how alike two of them are (cosine)
const vec = (angle) => [Math.cos(angle), Math.sin(angle)];

test("a correction is recalled only for a photo that looks almost the same", () => {
  const taught = [{ type: "PP", embedding: vec(0) }];
  assert.equal(recall(taught, vec(0.1))?.type, "PP"); // cos 0.995
  assert.equal(recall(taught, vec(Math.acos(SAME_ITEM) + 0.05)), null); // just below the line
  assert.equal(recall([], vec(0)), null);
});

test("several corrections vote, and a tie changes nothing", () => {
  const honest = [{ type: "PP", name: "Dark Fantasy wrapper", embedding: vec(0) }, { type: "PP", embedding: vec(0.05) }];
  const prank = { type: "PET", embedding: vec(0.01) };
  assert.deepEqual({ ...recall([...honest, prank], vec(0.02)), similarity: 0 }, { type: "PP", name: "Dark Fantasy wrapper", votes: 2, similarity: 0 });
  assert.equal(recall([honest[0], prank], vec(0.02)), null);
});

test("held-item parts cover the whole photo and stay inside it", () => {
  for (const aspect of [16 / 9, 3 / 4, 1]) {
    const parts = partsOf(aspect);
    assert.ok(parts.every((b) => b.x >= 0 && b.y >= 0 && b.x + b.w <= 1.0001 && b.y + b.h <= 1.0001));
    assert.ok(parts.some((b) => b.x === 0 && b.y === 0) && parts.some((b) => Math.abs(b.x + b.w - 1) < 1e-9 && Math.abs(b.y + b.h - 1) < 1e-9));
    assert.ok(parts.length <= 40);
  }
});
