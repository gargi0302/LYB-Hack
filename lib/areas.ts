import { locate } from "./pincode";
import type { Key } from "./strings";

export type Place = { pincode: string; area: string; city: string; state: string; lat: number; lng: number };

// read the PIN code fields of a form (see PlaceFields) and find the map point.
// Returns the message key to show when something is missing or can't be found.
export async function placeFrom(form: FormData): Promise<Place | Key> {
  const [pincode, area, city, state] = ["pincode", "area", "city", "state"].map((name) => String(form.get(name) ?? ""));
  if (!/^\d{6}$/.test(pincode) || !area || !city) return "pin.first";
  try {
    const spot = await locate(area, city, state, pincode);
    return spot ? { pincode, area, city, state, ...spot } : "pin.noMap";
  } catch {
    return "pin.failed";
  }
}

// a pickup address: label and street line, plus the place from its PIN code
export async function addressFrom(form: FormData) {
  const place = await placeFrom(form);
  if (typeof place === "string") return place;
  return { label: String(form.get("label")), line: String(form.get("line")), ...place };
}

// "Flat 402, Gate 3, Bandra West, Mumbai 400050" (demo addresses have no city or PIN code)
export const addressText = (a: { line: string; area: string; city?: string | null; pincode?: string | null }) =>
  [a.line, a.area, a.city && `${a.city} ${a.pincode ?? ""}`.trim()].filter(Boolean).join(", ");

// read the personal fields of a form (see PersonalFields)
export function detailsFrom(form: FormData) {
  return {
    name: String(form.get("name")),
    phone: String(form.get("phone")),
    age: Number(form.get("age")) || null,
    gender: String(form.get("gender")) || null,
  };
}
