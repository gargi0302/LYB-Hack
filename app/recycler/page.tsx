"use client";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import Shell from "@/components/Shell";
import { useBatches, useProfile } from "@/lib/useProfile";
import { typesOf, type Batch } from "@/lib/supabase";
import { estimateValue, valueOf } from "@/lib/plastics";
import { useLang } from "@/lib/i18n";

const sum = (list: number[]) => list.reduce((a, b) => a + b, 0);
const rupees = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;

// Recycler dashboard, same idea as the collector's: this month in numbers, the batches waiting to be weighed
// (all of them, with the form, on the Incoming tab: recycler/incoming) and what was recycled lately.
export default function RecyclerDashboard() {
  const profile = useProfile("recycler");
  const [batches, , loaded, loadedAt] = useBatches(profile);
  const { t, locale } = useLang();

  // "this month" goes by the pickup slot (or the listing date), counted from when the batches were loaded
  const monthStart = new Date(new Date(loadedAt).setDate(1)).setHours(0, 0, 0, 0);
  const when = (b: Batch) => new Date(b.scheduled_at ?? b.created_at).getTime();
  const waiting = batches.filter((b) => b.status === "delivered");
  const recycled = batches.filter((b) => b.status === "recycled");
  const month = recycled.filter((b) => when(b) >= monthStart && b.actual_kg !== null && b.quality_grade);
  const kg = sum(month.map((b) => Number(b.actual_kg)));
  // paid = price per kg × weighed kg × grade factor (lib/plastics.ts), for the type the recycler found
  const paid = sum(month.map((b) => valueOf(b.actual_type ?? b.final_type, Number(b.actual_kg), b.quality_grade!)));
  // sorted right = the user's declared type matched what the recycler found
  const right = month.length ? Math.round((month.filter((b) => (b.actual_type ?? b.final_type) === b.final_type).length / month.length) * 100) : null;

  const tiles: [string, string][] = [
    [t("rec.mWaiting"), String(waiting.length)],
    [t("rec.mKg"), `${Math.round(kg)} ${t("kg")}`],
    [t("rec.mPaid"), rupees(paid)],
    [t("dash.sorted"), right === null ? "—" : `${right}%`],
  ];

  const panel = (title: string, count: number, link: string | null, children: React.ReactNode) => (
    <section className="rounded-2xl border border-stone-200 bg-paper">
      <div className="flex items-center justify-between gap-3 border-b border-stone-200 px-4 py-3 sm:px-5">
        <h2 className="heading text-base">{title} <span className="font-sans text-sm font-normal text-stone-400">{count}</span></h2>
        {link && (
          <Link href={link} className="flex items-center gap-1 text-sm font-medium text-brand-700 hover:text-brand-950">
            {t("rec.seeAll")} <ArrowRight size={15} />
          </Link>
        )}
      </div>
      {children}
    </section>
  );

  return (
    <Shell profile={profile} title={t("nav.dashboard")}>
      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {tiles.map(([label, value]) => (
          <div key={label} className="rounded-2xl border border-stone-200 bg-paper p-4">
            <dt className="text-sm text-stone-500">{label}</dt>
            <dd className="mt-1 font-display text-2xl font-bold tracking-tight text-brand-950 tabular-nums md:text-3xl">{loaded ? value : "…"}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-6 grid gap-4 lg:grid-cols-2 lg:items-start">
        {panel(t("rec.title"), waiting.length, "/recycler/incoming", (
          <ul className="divide-y divide-stone-200">
            {waiting.slice(0, 5).map((b) => (
              <li key={b.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm sm:px-5">
                <span>
                  <b className="font-semibold text-brand-950">{typesOf(b).join(" + ")}</b> · {b.declared_kg} {t("kg")}
                  <span className="text-stone-500"> · {b.area}{b.collector?.name && ` · ${t("rec.from", { name: b.collector.name })}`}</span>
                </span>
                <span className="shrink-0 font-medium text-brand-800">{estimateValue(b.final_type, b.declared_kg)}</span>
              </li>
            ))}
            {loaded && waiting.length === 0 && <li className="px-4 py-3 text-sm text-stone-500 sm:px-5">{t("rec.none")}</li>}
          </ul>
        ))}

        {panel(t("rec.recent"), recycled.length, recycled.length > 5 ? "/recycler/incoming?tab=recycled" : null, (
          <ul className="divide-y divide-stone-200">
            {recycled.slice(0, 5).map((b) => (
              <li key={b.id}>
                <Link href={`/batch/${b.id}`} className="flex items-center justify-between gap-3 px-4 py-3 text-sm transition-colors hover:bg-brand-50/60 sm:px-5">
                  <span>
                    <b className="font-semibold text-brand-950">{b.actual_type ?? b.final_type}</b> · {b.actual_kg} {t("kg")}
                    <span className="text-stone-500"> · {t("pub.grade", { g: b.quality_grade ?? "" })} · {new Date(b.scheduled_at ?? b.created_at).toLocaleDateString(locale)}</span>
                  </span>
                  <span className="shrink-0 font-medium text-brand-800">{estimateValue(b.actual_type ?? b.final_type, Number(b.actual_kg ?? 0), b.quality_grade)}</span>
                </Link>
              </li>
            ))}
          </ul>
        ))}
      </div>
    </Shell>
  );
}
