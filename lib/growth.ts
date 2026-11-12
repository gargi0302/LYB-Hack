// Basellion grows with what it was fed this month (recyclable kg listed in the last 30 days):
// three stages by kilos, and a small step up in size and happiness for every listing it eats.
export const STAGES = [
  { fromKg: 0, size: 150, happiness: 25 }, // under 50 kg: smallest, not very happy
  { fromKg: 50, size: 190, happiness: 50 }, // 50 to 500 kg: medium
  { fromKg: 500, size: 230, happiness: 75 }, // 500 kg and more: biggest, happiest
];
export const STEP = { size: 2, happiness: 1 }; // per listing eaten
const TOP = { size: 260, happiness: 100 };
const DAY = 86400000;

type Meal = { final_type: string; declared_kg: number; created_at: string };

// recyclable kg and number of listings in the 30 days before `now`
export function fedThisMonth(batches: Meal[], now: number) {
  const meals = batches.filter((b) => b.final_type !== "UNCLEAR" && now - new Date(b.created_at).getTime() < 30 * DAY);
  return { kg: meals.reduce((sum, b) => sum + Number(b.declared_kg), 0), meals: meals.length };
}

export function growth(kg: number, meals: number) {
  const stage = STAGES.findLastIndex((s) => kg >= s.fromKg);
  const base = STAGES[stage];
  const next = STAGES[stage + 1];
  // eating often helps, but only the kilos move Basellion up to the next stage
  const cap = next ? { size: next.size - 6, happiness: next.happiness - 5 } : TOP;
  return {
    stage: stage + 1,
    size: Math.min(base.size + meals * STEP.size, cap.size),
    happiness: Math.min(base.happiness + meals * STEP.happiness, cap.happiness),
  };
}

// How green Basellion's world (the home card) is: 0 for someone who hasn't recycled this month, 1 at 500 kg.
// The square root makes the first kilos count most, so a new user sees it change quickly; each listing adds a touch.
export function greenness(kg: number, meals: number) {
  return Math.min(1, Math.sqrt(Math.max(0, kg) / 500) + meals * 0.01);
}
