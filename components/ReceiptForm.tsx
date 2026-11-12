"use client";
import { advance, type Batch } from "@/lib/supabase";
import { PLASTICS } from "@/lib/plastics";
import { useLang } from "@/lib/i18n";

// Recycler weighs the batch, checks the real plastic type and grades it.
// The database works out the weight flag (more than 20% off the declared weight).
export default function ReceiptForm({ batch, onDone }: { batch: Batch; onDone: () => void }) {
  const { t } = useLang();
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const kg = Number(form.get("kg"));
    const type = form.get("type");
    const grade = form.get("grade");
    const note = `Weighed ${kg} kg, ${type}, grade ${grade}`;
    if (await advance(batch.id, "recycled", { actual_kg: kg, actual_type: type, quality_grade: grade }, note)) onDone();
  }

  return (
    <form onSubmit={submit} className="mt-3 space-y-3 border-t border-stone-200 pt-3">
      <div className="grid grid-cols-2 gap-3">
        <label className="label">
          {t("rec.actual")}
          <input name="kg" type="number" step="0.1" min="0.1" required inputMode="decimal" placeholder={t("rec.declared", { kg: batch.declared_kg })} className="input" />
        </label>
        <label className="label">
          {t("rec.found")}
          <select name="type" defaultValue={batch.final_type} className="input">
            {PLASTICS.map((p) => <option key={p}>{p}</option>)}
          </select>
        </label>
      </div>
      <fieldset>
        <legend className="label">{t("rec.grade")} <span className="font-normal text-stone-500">{t("rec.gradeHelp")}</span></legend>
        <div className="mt-1.5 flex gap-2">
          {["A", "B", "C"].map((g) => (
            <label key={g} className="flex min-h-10 flex-1 cursor-pointer items-center justify-center rounded-full border border-stone-300 text-sm font-semibold transition-colors has-checked:border-brand-300 has-checked:bg-brand-300 has-checked:text-brand-950 has-focus-visible:ring-2 has-focus-visible:ring-brand-600">
              <input type="radio" name="grade" value={g} required defaultChecked={g === "A"} className="sr-only" /> {g}
            </label>
          ))}
        </div>
      </fieldset>
      <button className="btn-primary w-full">{t("rec.confirm")}</button>
    </form>
  );
}
