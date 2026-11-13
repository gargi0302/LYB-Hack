import type { Plastic } from "./supabase";

export const PLASTICS: Plastic[] = ["PET", "HDPE", "PP", "LDPE"];

// The confidence rules from our plan, in one place
export function band(confidence: number) {
  if (confidence >= 0.85) return "auto";    // fill the type in
  if (confidence >= 0.6) return "confirm";  // suggest, user must confirm
  return "manual";                          // user picks, checked again at pickup
}

// When the AI can't identify an item, the name the user types gives a strong hint.
// Packaging varies, so this only suggests; the printed code always wins.
const NAME_HINTS: [RegExp, Plastic][] = [ // checked top to bottom, most specific first
  [/milk (pouch|packet|bag)|pouch|carry ?bag|polythene|cling|film|garbage bag|bin bag|zip ?lock|थैली|थैलियाँ|पिशवी|पिशव्या|पन्नी|पॉलिथीन/i, "LDPE"],
  [/milk can|shampoo|detergent|cleaner|phenyl|bleach|lotion|jerry ?can|शैम्पू|शॅम्पू|डिटर्जेंट|डिटर्जंट|फिनाइल|फिनाईल/i, "HDPE"],
  [/wrapper|chips|biscuit|cookie|namkeen|chocolate|toffee|candy|noodle|maggi|kurkure|snack|packet|रैपर|रॅपर|चिप्स|बिस्किट|बिस्कीट|नमकीन|चॉकलेट|पैकेट|पाकीट|कुरकुरे/i, "PP"],
  [/water|cold ?drink|soda|soft ?drink|juice|oil|\bpet\b|bottle|बोतल|बाटली|पानी|पाणी|तेल|जूस|ज्यूस/i, "PET"],
  [/tiffin|tub|container|box|lid|cap|bucket|mug|cup|straw|spoon|tray|टिफ़िन|टिफिन|डिब्बा|डबा|ढक्कन|झाकण|बाल्टी|बादली|कप|चम्मच|चमचा/i, "PP"],
];
// tips per type are in lib/i18n.ts as tip.PET.0 ... tip.LDPE.2
export const TIP_COUNT = 3;
export const hintFor = (name: string) => NAME_HINTS.find(([pattern]) => pattern.test(name))?.[1] ?? null;

// Rough price a recycler pays per kg. PLACEHOLDER numbers, not market data.
const PRICE_PER_KG: Record<Plastic, number> = { PET: 25, HDPE: 30, PP: 20, LDPE: 12, UNCLEAR: 0 };
const GRADE_FACTOR = { A: 1, B: 0.8, C: 0.6 };

// What a recycler pays the collector for a batch: price per kg × kg × grade factor (A 1, B 0.8, C 0.6).
export function valueOf(type: Plastic, kg: number, grade: "A" | "B" | "C") {
  return PRICE_PER_KG[type] * kg * GRADE_FACTOR[grade];
}

// value range for collectors before grading (grade C to grade A), or the value once graded
export function estimateValue(type: Plastic, kg: number, grade?: "A" | "B" | "C" | null) {
  if (grade) return `₹${Math.round(valueOf(type, kg, grade))}`;
  return `₹${Math.round(valueOf(type, kg, "C"))}–${Math.round(valueOf(type, kg, "A"))}`;
}

// Typical weight of one item, in grams, used when the user leaves the weight blank (the recycler weighs it later).
// PLACEHOLDERS, like the emission factors: a water bottle, a shampoo bottle, a tub or wrapper, a milk pouch.
export const TYPICAL_GRAMS: Record<string, number> = { PET: 25, HDPE: 50, PP: 15, LDPE: 5 };

// What households put in the bag, to tap and count instead of photographing each piece.
// The plastic type is the usual one (the printed code wins); chips and biscuit wrappers are multilayer
// film but printed PP (5) in India. Grams per piece are PLACEHOLDERS, weighed by the recycler later.
// icon: a lucide-react icon name, drawn by the Feed page. Names are in lib/strings.ts as cat.<id>.
export const CATALOGUE = [
  { id: "waterBottle", type: "PET", grams: 25, icon: "CupSoda" },     // 1 L water or cold-drink bottle
  { id: "oilBottle", type: "PET", grams: 40, icon: "Droplet" },       // 1 L cooking-oil bottle
  { id: "milkPouch", type: "LDPE", grams: 5, icon: "Milk" },          // 500 ml milk pouch
  { id: "carryBag", type: "LDPE", grams: 4, icon: "ShoppingBag" },    // thin carry bag
  { id: "wrapper", type: "PP", grams: 5, icon: "Cookie" },            // chips, biscuit or chocolate wrapper
  { id: "takeaway", type: "PP", grams: 30, icon: "Package" },         // takeaway container with lid
  { id: "shampooBottle", type: "HDPE", grams: 50, icon: "SprayCan" }, // shampoo or detergent bottle
  { id: "bucket", type: "PP", grams: 300, icon: "PaintBucket" },      // broken bucket or mug
] as const satisfies readonly { id: string; type: Plastic; grams: number; icon: string }[];
export type CatalogueId = (typeof CATALOGUE)[number]["id"];

// An item the user typed or scanned and nobody could name: counted at this weight, checked at pickup
export const UNSURE_GRAMS = 20;
// grams for something typed in: the usual weight of its likely type, or the "not sure" weight
export const gramsFor = (type: Plastic | null) => (type && TYPICAL_GRAMS[type]) || UNSURE_GRAMS;

// How much plastic a bag holds, in kg, by size, when full. PLACEHOLDERS from rough household
// examples (a full carry bag of bottles and wrappers is a few hundred grams); half full is half.
export const BAG_SIZES = ["small", "medium", "large"] as const;
export type BagSize = (typeof BAG_SIZES)[number];
const BAG_KG: Record<BagSize, [number, number]> = { small: [0.15, 0.4], medium: [0.4, 1.2], large: [1, 2.5] };
export function bagRange(size: BagSize, full: boolean): [number, number] {
  const [min, max] = BAG_KG[size];
  return full ? [min, max] : [min / 2, max / 2];
}

// One line of the bag's item list. type null = "not sure", "UNCLEAR" = not recyclable here (left out).
export type Listed = { type: Plastic | null; count: number; grams: number };
const kept = (items: Listed[]) => items.filter((it) => it.type !== "UNCLEAR" && it.count > 0);

// the list's weight in kg, to one decimal, at least 0.1 once anything is listed
export function listKg(items: Listed[]) {
  const grams = kept(items).reduce((sum, it) => sum + it.count * it.grams, 0);
  return grams ? Math.max(0.1, Math.round(grams / 100) / 10) : 0;
}

// how many pieces of each plastic, most first; "not sure" pieces counted on their own
export function tally(items: Listed[]) {
  const counts = new Map<Plastic, number>();
  let unsure = 0;
  for (const it of kept(items)) {
    if (it.type) counts.set(it.type, (counts.get(it.type) ?? 0) + it.count);
    else unsure += it.count;
  }
  return { types: [...counts].sort((a, b) => b[1] - a[1]).map(([type, count]) => ({ type, count })), unsure };
}

// Does the list fit the bag? "fewer": much lighter than the bag (items missed?), "more": much heavier
// (bag bigger than picked?). Only a big gap counts, both are rough. Either way it is checked at pickup.
export function crossCheck(kg: number, [min, max]: [number, number]) {
  if (kg < min / 2) return "fewer";
  if (kg > max * 2) return "more";
  return "ok";
}
