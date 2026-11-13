"use client";
import { useState } from "react";
import Shell from "@/components/Shell";
import { useProfile } from "@/lib/useProfile";
import { supabase, type Profile } from "@/lib/supabase";
import { FREE_KM, SEARCH_KM, pickupFee } from "@/lib/match";
import { PER_SLOT, SLOT_HOURS, hoursLabel, slotKey } from "@/lib/slots";
import { useLang } from "@/lib/i18n";

const WEEK = [1, 2, 3, 4, 5, 6, 0]; // Monday first; 0 = Sunday, as Date.getDay() counts
const EVERY = WEEK.flatMap((d) => SLOT_HOURS.map((h) => slotKey(d, h)));

// A collector's availability: the weekly slots they are free for pickups, how far they go, and
// what they charge per km beyond 5 km. Users see exactly this when they book (components/BookPickup.tsx).
export default function Availability() {
  const profile = useProfile("collector");
  const { t } = useLang();
  return (
    <Shell profile={profile} title={t("nav.availability")}>
      {/* the form starts from the saved settings, so it waits for the profile */}
      {profile && <Settings key={profile.id} profile={profile} />}
    </Shell>
  );
}

function Settings({ profile }: { profile: Profile }) {
  const { t, lang, locale } = useLang();
  const [free, setFree] = useState<string[]>(profile.free_slots?.length ? profile.free_slots : EVERY); // empty = every slot
  const [reach, setReach] = useState(Number(profile.max_km ?? FREE_KM));
  const [rate, setRate] = useState(String(profile.fee_per_km ?? 0));
  const [state, setState] = useState<"idle" | "saving" | "saved" | string>("idle");
  const perKm = Math.max(0, Math.min(100, Number(rate) || 0));
  const dayName = (d: number) => new Date(2026, 10, 1 + d).toLocaleDateString(locale, { weekday: "short" }); // 1 Nov 2026 is a Sunday

  const toggle = (key: string) => {
    setState("idle");
    setFree((list) => (list.includes(key) ? list.filter((k) => k !== key) : [...list, key]));
  };

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!free.length) return setState(t("av.needSlot"));
    setState("saving");
    const { error } = await supabase.from("profiles")
      .update({ free_slots: free.length === EVERY.length ? null : free, max_km: reach, fee_per_km: perKm }).eq("id", profile.id);
    setState(error ? error.message : "saved");
  }

  return (
    <form onSubmit={save} className="grid gap-4 lg:grid-cols-2 lg:items-start">
      <p className="text-sm text-stone-600 lg:col-span-2">{t("av.sub")}</p>

      <section className="card">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="heading text-base">{t("av.slots")}</h2>
          <div className="flex gap-3 text-sm font-medium">
            <button type="button" onClick={() => { setFree(EVERY); setState("idle"); }} className="text-brand-700 underline underline-offset-2">{t("av.all")}</button>
            <button type="button" onClick={() => { setFree([]); setState("idle"); }} className="text-brand-700 underline underline-offset-2">{t("av.clear")}</button>
          </div>
        </div>
        <p className="mt-1 text-sm text-stone-500">{t("av.slotsHelp", { n: PER_SLOT })}</p>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[300px] border-separate border-spacing-1.5 text-sm">
            <thead>
              <tr>
                <th className="w-12" />
                {SLOT_HOURS.map((h) => <th key={h} scope="col" className="px-1 text-xs font-medium text-stone-500">{hoursLabel(h, lang)}</th>)}
              </tr>
            </thead>
            <tbody>
              {WEEK.map((d) => (
                <tr key={d}>
                  <th scope="row" className="pr-1 text-left font-semibold text-brand-950">{dayName(d)}</th>
                  {SLOT_HOURS.map((h) => {
                    const key = slotKey(d, h);
                    const on = free.includes(key);
                    return (
                      <td key={h}>
                        <button type="button" onClick={() => toggle(key)} aria-pressed={on} aria-label={`${dayName(d)} ${hoursLabel(h, lang)}`}
                          className={`h-11 w-full rounded-xl border text-base font-bold transition-colors ${on ? "border-brand-700 bg-brand-700 text-white" : "border-stone-300 bg-white text-stone-300"}`}>
                          {on ? "✓" : "–"}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card space-y-4">
        <fieldset>
          <legend className="heading text-base">{t("av.reach")}</legend>
          <p className="mt-1 text-sm text-stone-500">{t("av.reachHelp")}</p>
          <div className="mt-3 grid grid-cols-4 gap-2">
            {SEARCH_KM.map((km) => (
              <button key={km} type="button" onClick={() => { setReach(km); setState("idle"); }} aria-pressed={reach === km} className="option text-center font-semibold text-brand-950">
                {t("av.km", { km })}
              </button>
            ))}
          </div>
        </fieldset>
        {reach > FREE_KM && (
          <label className="label block">
            {t("av.fee")}
            <input type="number" min="0" max="100" step="1" inputMode="numeric" value={rate}
              onChange={(e) => { setRate(e.target.value); setState("idle"); }} className="input text-base" />
            <span className="mt-1.5 block font-normal text-stone-500">{t("av.example", { km: reach, fee: pickupFee(reach, perKm) })}</span>
          </label>
        )}
      </section>

      <div className="flex items-center gap-3 lg:col-span-2">
        <button disabled={state === "saving"} className="btn-primary min-h-12 px-8 text-base">{t("av.save")}</button>
        {state === "saved" && <p role="status" className="text-sm font-medium text-brand-800">{t("av.saved")}</p>}
        {state !== "idle" && state !== "saving" && state !== "saved" && <p role="alert" className="text-sm text-red-700">{state}</p>}
      </div>
    </form>
  );
}
