"use client";
import { useState } from "react";
import MatchPicker from "./MatchPicker";
import { advance, supabase, type Batch, type Profile } from "@/lib/supabase";
import { PER_SLOT, openSlots, slotLabel } from "@/lib/slots";
import { FREE_KM, SEARCH_KM } from "@/lib/match";
import { useLang } from "@/lib/i18n";

// After listing: pick a collector within 5 km who takes this plastic, then one of their free slots.
// If nobody suits, the user can search further (10, 15, 25 km); collectors who go that far may charge
// for the extra km, shown before choosing. The collector still has to confirm the slot.
export default function BookPickup({ batch, onBooked }: { batch: Batch; onBooked: () => void }) {
  const [collector, setCollector] = useState<Profile | null>(null);
  const [slots, setSlots] = useState<{ start: Date; left: number }[] | null>(null);
  const [reach, setReach] = useState(FREE_KM);
  const { t, lang } = useLang();

  async function choose(c: Profile) {
    setCollector(c);
    setSlots(null);
    const { data } = await supabase.rpc("slot_bookings", { collector: c.id });
    setSlots(openSlots(data ?? [], new Date(), c.free_slots));
  }

  async function book(start: Date) {
    const note = `Asked ${collector!.name} for ${slotLabel(start)}`; // the log stays in English
    if (await advance(batch.id, "matched", { collector_id: collector!.id, scheduled_at: start.toISOString() }, note)) onBooked();
  }

  if (!collector) return (
    <>
      <MatchPicker batch={batch} role="collector" maxKm={reach} ownReach label={t("bp.near", { km: reach })} onPick={choose} />
      {reach < SEARCH_KM[SEARCH_KM.length - 1] && (
        <div className="mt-4">
          <p className="text-sm text-stone-600">{t("bp.further")}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {SEARCH_KM.filter((km) => km > reach).map((km) => (
              <button key={km} onClick={() => setReach(km)} className="btn-secondary min-h-10 px-4 text-sm">{t("bp.upTo", { km })}</button>
            ))}
          </div>
        </div>
      )}
    </>
  );

  return (
    <div className="mt-3">
      <p className="text-sm font-medium text-stone-700">
        {t("bp.pick", { name: collector.name })}
        <button onClick={() => setCollector(null)} className="ml-2 font-medium text-brand-700 underline underline-offset-2">{t("bp.change")}</button>
      </p>
      {!slots && <p className="mt-2 text-sm text-stone-500">{t("bp.loading")}</p>}
      {slots?.length === 0 && <p className="mt-2 text-sm text-red-700">{t("bp.none")}</p>}
      <div className="mt-2 grid grid-cols-2 gap-2">
        {slots?.map((s) => (
          <button key={s.start.toISOString()} onClick={() => book(s.start)} className="option text-sm">
            <b className="font-semibold text-brand-950">{slotLabel(s.start, lang)}</b>
            <span className="block text-xs text-stone-500">{t("bp.free", { left: s.left, total: PER_SLOT })}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
