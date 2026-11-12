"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { MapPin, Phone, TriangleAlert } from "lucide-react";
import Shell from "@/components/Shell";
import MatchPicker from "@/components/MatchPicker";
import { ItemsLine } from "@/components/BatchCard";
import { useBatches, useProfile } from "@/lib/useProfile";
import { advance, typesOf, type Batch, type Status } from "@/lib/supabase";
import { estimateValue } from "@/lib/plastics";
import { slotLabel } from "@/lib/slots";
import { useLang, type Key } from "@/lib/i18n";

const HOUR = 3600000;
type Tab = "scheduled" | "on_the_way" | "picked_up" | "done";
const TABS: [Tab, Key][] = [["scheduled", "col.tabConfirmed"], ["on_the_way", "col.onTheWay"], ["picked_up", "col.tabCollected"], ["done", "card.history"]];

// "Sun, 15 Nov, 4 PM–6 PM" -> ["Sun, 15 Nov", "4 PM–6 PM"] (the day can itself contain a comma)
const splitSlot = (label: string) => {
  const i = label.lastIndexOf(", ");
  return [label.slice(0, i), label.slice(i + 2)];
};

// Every pickup after the collector confirmed it, one stage at a time: confirmed (a schedule by day), on the way,
// collected (take to a recycler) and the history. New requests are on the dashboard (collector/).
export default function CollectorPickups() {
  const profile = useProfile("collector");
  const [batches, reload, loaded, loadedAt] = useBatches(profile);
  const { t, lang, locale } = useLang();
  const [tab, setTab] = useState<Tab>("scheduled");
  const [tick, setTick] = useState(0);
  // "Leaving now" opens an hour before the slot, so the page re-checks the time every minute
  useEffect(() => {
    const id = setInterval(() => setTick(Date.now()), 60000);
    return () => clearInterval(id);
  }, []);
  const now = Math.max(loadedAt, tick);
  const opensAt = (b: Batch) => new Date(b.scheduled_at!).getTime() - HOUR;

  const step = async (b: Batch, status: Status, fields = {}, note: string | null = null) =>
    (await advance(b.id, status, fields, note)) && reload();
  const byTime = (a: Batch, b: Batch) => new Date(a.scheduled_at ?? a.created_at).getTime() - new Date(b.scheduled_at ?? b.created_at).getTime();
  const lists: Record<Tab, Batch[]> = {
    scheduled: batches.filter((b) => b.status === "scheduled").sort(byTime),
    on_the_way: batches.filter((b) => b.status === "on_the_way").sort(byTime),
    picked_up: batches.filter((b) => b.status === "picked_up").sort(byTime),
    done: batches.filter((b) => b.status === "delivered" || b.status === "recycled"),
  };
  const list = lists[tab];

  // confirmed pickups as a schedule: one group per day
  const days: [string, Batch[]][] = [];
  for (const b of lists.scheduled) {
    const [day] = splitSlot(slotLabel(new Date(b.scheduled_at!), lang));
    const group = days.find(([d]) => d === day);
    if (group) group[1].push(b);
    else days.push([day, [b]]);
  }

  const action = (b: Batch) => {
    if (b.status === "scheduled") {
      return now >= opensAt(b) ? (
        <button className="btn-primary min-h-10 px-5" onClick={() => step(b, "on_the_way")}>{t("col.leaving")}</button>
      ) : (
        <span className="rounded-full bg-stone-100 px-3 py-1.5 text-xs font-medium text-stone-600">
          {t("col.opensAt", { time: new Date(opensAt(b)).toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit" }) })}
        </span>
      );
    }
    if (b.status === "on_the_way") {
      return <button className="btn-primary min-h-10 px-5" onClick={() => step(b, "picked_up", {}, `+${Math.floor(b.declared_kg * 10)} coins to the user`)}>{t("col.pickedUp")}</button>;
    }
    return null;
  };

  const row = (b: Batch) => {
    const [day, time] = b.scheduled_at ? splitSlot(slotLabel(new Date(b.scheduled_at), lang)) : ["", ""];
    return (
      <article key={b.id} className="flex gap-4 rounded-2xl border border-stone-200 bg-paper p-4">
        {b.scheduled_at && b.status !== "picked_up" && (
          <div className="flex w-[4.75rem] shrink-0 flex-col items-center justify-center rounded-xl bg-brand-100 px-2 py-2 text-center">
            <span className="text-[11px] font-medium text-brand-700">{day}</span>
            <span className="text-sm leading-tight font-semibold text-brand-950">{time}</span>
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3">
            <p className="heading text-base">{typesOf(b).join(" + ")} · {b.declared_kg} {t("kg")}</p>
            <p className="text-sm font-medium text-brand-800">{estimateValue(b.final_type, b.declared_kg)}</p>
          </div>
          {b.batch_addresses && (
            <div className="mt-1.5 space-y-0.5 text-sm text-stone-600">
              <p className="flex gap-1.5"><MapPin size={15} className="mt-0.5 shrink-0 text-brand-600" />{b.batch_addresses.address}</p>
              {b.batch_addresses.phone && (
                <a href={`tel:${b.batch_addresses.phone}`} className="flex w-fit items-center gap-1.5 font-medium text-brand-700 hover:text-brand-950">
                  <Phone size={15} className="shrink-0" />{b.batch_addresses.phone}
                </a>
              )}
            </div>
          )}
          <ItemsLine batch={b} />
          {b.verify_at_pickup && (
            <p className="mt-1.5 flex items-center gap-1.5 text-xs font-medium text-brand-800"><TriangleAlert size={14} /> {t("col.verify")}</p>
          )}
          {b.status === "picked_up" ? (
            <MatchPicker batch={b} role="recycler" label={t("col.deliver")}
              onPick={(r) => step(b, "delivered", { recycler_id: r.id }, `Delivered to ${r.name}`)} />
          ) : (
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-stone-200 pt-3">
              <Link href={`/batch/${b.id}`} className="text-sm font-medium text-brand-700 hover:text-brand-950">{t("card.history")}</Link>
              {action(b)}
            </div>
          )}
        </div>
      </article>
    );
  };

  return (
    <Shell profile={profile} title={t("nav.pickups")}>
      <div role="tablist" aria-label={t("nav.pickups")} className="flex w-full gap-1 overflow-x-auto rounded-full border border-stone-200/70 bg-white p-1 shadow-[0_2px_10px_rgba(49,87,44,0.05)] sm:w-fit">
        {TABS.map(([id, label]) => (
          <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)}
            className={`flex shrink-0 items-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium transition-colors ${tab === id ? "bg-brand-200 text-brand-950" : "text-stone-600 hover:text-brand-950"}`}>
            {t(label)}
            <span className={`rounded-full px-1.5 text-xs tabular-nums ${tab === id ? "bg-brand-100 text-brand-800" : "bg-stone-100 text-stone-500"}`}>{lists[id].length}</span>
          </button>
        ))}
      </div>

      <div className="mt-5">
        {loaded && list.length === 0 && <p className="text-sm text-stone-500">{tab === "done" ? t("col.noHistory") : t("col.none")}</p>}

        {tab === "scheduled" && days.map(([day, group]) => (
          <section key={day} className="mb-6 last:mb-0">
            <h2 className="mb-2 text-xs font-semibold tracking-wider text-stone-500 uppercase">{day} · {group.length}</h2>
            <div className="grid gap-3 lg:grid-cols-2">{group.map(row)}</div>
          </section>
        ))}

        {(tab === "on_the_way" || tab === "picked_up") && <div className="grid gap-3 lg:grid-cols-2">{list.map(row)}</div>}

        {tab === "done" && list.length > 0 && (
          <ul className="divide-y divide-stone-200 overflow-hidden rounded-2xl border border-stone-200 bg-paper">
            {list.map((b) => (
              <li key={b.id}>
                <Link href={`/batch/${b.id}`} className="flex items-center justify-between gap-3 px-4 py-3 text-sm transition-colors hover:bg-brand-50/60 sm:px-5">
                  <span>
                    <b className="font-semibold text-brand-950">{typesOf(b).join(" + ")}</b> · {b.actual_kg ?? b.declared_kg} {t("kg")}
                    <span className="text-stone-500"> · {b.area} · {new Date(b.scheduled_at ?? b.created_at).toLocaleDateString(locale)}</span>
                  </span>
                  <span className="text-right text-stone-600">
                    {t(`status.${b.status}`)} · <span className="font-medium text-brand-800">
                      {estimateValue(b.actual_type ?? b.final_type, Number(b.actual_kg ?? b.declared_kg), b.quality_grade)}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Shell>
  );
}
