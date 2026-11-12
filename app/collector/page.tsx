"use client";
import dynamic from "next/dynamic";
import Shell from "@/components/Shell";
import PickupCard from "@/components/PickupCard";
import { useBatches, useProfile } from "@/lib/useProfile";
import { advance, type Batch } from "@/lib/supabase";
import { valueOf } from "@/lib/plastics";
import { slotLabel } from "@/lib/slots";
import { useLang } from "@/lib/i18n";

const BatchMap = dynamic(() => import("@/components/BatchMap"), { ssr: false });
const DAY = 86400000;
const sum = (list: number[]) => list.reduce((a, b) => a + b, 0);
const rupees = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;

// Collector dashboard: this month in numbers, the map, and the pickup requests waiting for an answer.
// Everything after confirming (on the way, collected, history) is on the Pickups tab (collector/pickups).
export default function CollectorDashboard() {
  const profile = useProfile("collector");
  const [batches, reload, loaded, loadedAt] = useBatches(profile);
  const { t } = useLang();
  const step = async (b: Batch, status: Batch["status"], fields = {}, note: string | null = null) =>
    (await advance(b.id, status, fields, note)) && reload();

  // the numbers, counted from when the batches were loaded
  const when = (b: Batch) => new Date(b.scheduled_at ?? b.created_at).getTime(); // the pickup slot, or the listing date
  const dayStart = new Date(loadedAt).setHours(0, 0, 0, 0);
  const monthStart = new Date(new Date(loadedAt).setDate(1)).setHours(0, 0, 0, 0);
  const requests = batches.filter((b) => b.status === "matched");
  const today = batches.filter((b) => (b.status === "scheduled" || b.status === "on_the_way") && b.scheduled_at && when(b) >= dayStart && when(b) < dayStart + DAY);
  const collected = batches.filter((b) => ["picked_up", "delivered", "recycled"].includes(b.status) && when(b) >= monthStart);
  const kg = sum(collected.map((b) => Number(b.actual_kg ?? b.declared_kg)));
  // earned = what recyclers paid for graded batches; the rest is a range until the recycler grades it
  const graded = collected.filter((b) => b.status === "recycled" && b.quality_grade && b.actual_kg !== null);
  const earned = sum(graded.map((b) => valueOf(b.actual_type ?? b.final_type, Number(b.actual_kg), b.quality_grade!)));
  const waiting = collected.filter((b) => !graded.includes(b));
  const low = sum(waiting.map((b) => valueOf(b.final_type, Number(b.declared_kg), "C")));
  const high = sum(waiting.map((b) => valueOf(b.final_type, Number(b.declared_kg), "A")));
  const open = batches.filter((b) => ["matched", "scheduled", "on_the_way", "picked_up"].includes(b.status));

  const tiles: [string, string, string?][] = [
    [t("col.requests"), String(requests.length)],
    [t("col.mToday"), String(today.length)],
    [t("col.mKg"), `${Math.round(kg)} ${t("kg")}`],
    [t("col.mEarned"), rupees(earned), waiting.length ? t("col.mPending", { range: `${rupees(low)}–${rupees(high)}` }) : undefined],
  ];

  return (
    <Shell profile={profile} title={t("nav.dashboard")}>
      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {tiles.map(([label, value, note]) => (
          <div key={label} className="rounded-2xl border border-stone-200 bg-paper p-4">
            <dt className="text-sm text-stone-500">{label}</dt>
            <dd className="mt-1 font-display text-2xl font-bold tracking-tight text-brand-950 tabular-nums md:text-3xl">{loaded ? value : "…"}</dd>
            {loaded && note && <dd className="mt-0.5 text-xs text-stone-500">{note}</dd>}
          </div>
        ))}
      </dl>

      <div className="mt-6 grid gap-6 lg:grid-cols-[400px_minmax(0,1fr)] lg:items-start">
        <aside className="space-y-3 lg:sticky lg:top-40">
          {profile && (
            <div className="overflow-hidden rounded-2xl border border-stone-200">
              <BatchMap pins={[
                { lat: profile.lat, lng: profile.lng, label: t("you"), me: true },
                ...open.map((b) => ({ lat: b.lat, lng: b.lng, label: `${b.final_type} · ${b.declared_kg} ${t("kg")} · ${b.area}` })),
              ]} />
            </div>
          )}
        </aside>

        <section>
          <h2 className="section-title">{t("col.requests")} <span className="font-sans text-base font-normal text-stone-400">{requests.length}</span></h2>
          {loaded && requests.length === 0 && <p className="text-sm text-stone-500">{t("col.none")}</p>}
          <div className="space-y-4">
            {requests.map((b) => (
              <PickupCard key={b.id} batch={b}>
                <div className="mt-4 grid grid-cols-2 gap-2">
                  <button className="btn-secondary min-h-12"
                    onClick={() => step(b, "requested", { scheduled_at: null }, "Collector can't make this slot")}>
                    {t("col.decline")}
                  </button>
                  <button className="btn-primary min-h-12"
                    onClick={() => step(b, "scheduled", {}, `Confirmed ${slotLabel(new Date(b.scheduled_at!))}`)}>
                    {t("col.confirm")}
                  </button>
                </div>
              </PickupCard>
            ))}
          </div>
        </section>
      </div>
    </Shell>
  );
}
