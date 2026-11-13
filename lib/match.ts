import type { Plastic, Profile } from "./supabase";

type Point = { lat: number; lng: number };

// Straight-line distance on the earth's surface (haversine formula).
// Formula from https://en.wikipedia.org/wiki/Haversine_formula
export function distanceKm(a: Point, b: Point) {
  const rad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

// Pickups up to this distance are free for the user; further away, the collector may charge per extra km
export const FREE_KM = 5;
// the user searches this far first, and can widen the search to these distances
export const SEARCH_KM = [5, 10, 15, 25];

// What the user pays the collector, in whole rupees, cash at pickup. The database works out the same
// number when the collector is chosen (set_pickup_fee in the collector_reach migration).
export const pickupFee = (km: number, perKm: number) => Math.round(Math.max(0, km - FREE_KM) * perKm);

// Plain rules, no AI: must accept every plastic in the listing, must have room for the weight,
// must be within maxKm (the user's search) and, for collectors, within the distance they go (max_km),
// nearest first.
export function topMatches(people: Profile[], types: Plastic[], kg: number, from: Point, maxKm = Infinity, ownReach = false) {
  return people
    .filter((p) => types.every((t) => p.accepted_types.includes(t)) && p.capacity_kg >= kg)
    .map((p) => {
      const km = distanceKm(from, p);
      return { ...p, km, fee: pickupFee(km, p.fee_per_km ?? 0) };
    })
    .filter((p) => p.km <= maxKm && (!ownReach || p.km <= (p.max_km ?? FREE_KM)))
    .sort((a, b) => a.km - b.km)
    .slice(0, 3);
}
