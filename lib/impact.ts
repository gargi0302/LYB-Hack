// The Impact page for one person: worked out from their own batches only (the database already lets a
// user, collector or recycler read just the batches they are part of). Plant X sees every area instead,
// from the database views. The rows have the same shape as those views, so the page draws both alike.

export type Impact = { week: string; area: string; plastic: string; kg: number; co2e_kg: number };
export type Quality = { area: string; checked: number; match_pct: number };
type Factor = { plastic: string; kg_co2e_per_kg: number };
export type OwnBatch = {
  area: string; final_type: string; actual_type: string | null; actual_kg: number | null; ai_type: string | null;
  status: string; status_events?: { to_status: string; created_at: string }[];
};

// Monday of the week, as "YYYY-MM-DD" (the views use Postgres date_trunc('week'), which also starts on Monday)
export function weekOf(when: string | Date) {
  const d = new Date(when);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// only batches a recycler has weighed count, under the type the recycler found, in the week it was recycled
const recycled = (batches: OwnBatch[]) => batches.filter((b) => b.status === "recycled" && Number(b.actual_kg) > 0);

export function ownImpact(batches: OwnBatch[], factors: Factor[]): Impact[] {
  const rows = new Map<string, Impact>();
  for (const b of recycled(batches)) {
    const when = b.status_events?.find((e) => e.to_status === "recycled")?.created_at;
    if (!when) continue;
    const plastic = b.actual_type ?? b.final_type;
    const factor = Number(factors.find((f) => f.plastic === plastic)?.kg_co2e_per_kg ?? 0);
    const key = `${weekOf(when)}|${b.area}|${plastic}`;
    const row = rows.get(key) ?? { week: weekOf(when), area: b.area, plastic, kg: 0, co2e_kg: 0 };
    row.kg += Number(b.actual_kg);
    row.co2e_kg += Number(b.actual_kg) * factor;
    rows.set(key, row);
  }
  return [...rows.values()].sort((a, b) => a.week.localeCompare(b.week));
}

// share of weighed batches where the recycler found the plastic that was declared, per area
export function ownQuality(batches: OwnBatch[]): Quality[] {
  const areas = new Map<string, { checked: number; right: number }>();
  for (const b of recycled(batches).filter((x) => x.actual_type)) {
    const a = areas.get(b.area) ?? { checked: 0, right: 0 };
    a.checked++;
    if (b.actual_type === b.final_type) a.right++;
    areas.set(b.area, a);
  }
  return [...areas].map(([area, { checked, right }]) => ({ area, checked, match_pct: Math.round((100 * right) / checked) }))
    .sort((a, b) => a.match_pct - b.match_pct);
}

// batches where a person or the recycler corrected the AI's guess
export const ownCorrections = (batches: OwnBatch[]) =>
  batches.filter((b) => b.ai_type && b.ai_type !== "UNCLEAR" && (b.final_type !== b.ai_type || (b.actual_type && b.actual_type !== b.ai_type))).length;
