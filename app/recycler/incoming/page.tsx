"use client";
import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import Shell from "@/components/Shell";
import BatchCard from "@/components/BatchCard";
import ReceiptForm from "@/components/ReceiptForm";
import { useBatches, useProfile } from "@/lib/useProfile";
import { estimateValue } from "@/lib/plastics";
import { useLang, type Key } from "@/lib/i18n";

type Tab = "waiting" | "recycled";
const TABS: [Tab, Key][] = [["waiting", "rec.tabWaiting"], ["recycled", "status.recycled"]];

// ?tab= is only known in the browser, so Next needs a Suspense boundary here
export default function Page() {
  return (
    <Suspense fallback={null}>
      <Incoming />
    </Suspense>
  );
}

// Every batch collectors delivered, in two tabs: waiting to be weighed and graded (with the form), and recycled.
function Incoming() {
  const profile = useProfile("recycler");
  const [batches, reload, loaded] = useBatches(profile);
  const { t, locale } = useLang();
  const [tab, setTab] = useState<Tab>(useSearchParams().get("tab") === "recycled" ? "recycled" : "waiting");
  const lists = {
    waiting: batches.filter((b) => b.status === "delivered"),
    recycled: batches.filter((b) => b.status === "recycled"),
  };

  return (
    <Shell profile={profile} title={t("rec.title")}>
      <div role="tablist" aria-label={t("rec.title")} className="flex w-full gap-1 rounded-full border border-stone-200/70 bg-white p-1 shadow-[0_2px_10px_rgba(49,87,44,0.05)] sm:w-fit">
        {TABS.map(([id, label]) => (
          <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium transition-colors sm:flex-none ${tab === id ? "bg-brand-200 text-brand-950" : "text-stone-600 hover:text-brand-950"}`}>
            {t(label)}
            <span className={`rounded-full px-1.5 text-xs tabular-nums ${tab === id ? "bg-brand-100 text-brand-800" : "bg-stone-100 text-stone-500"}`}>{lists[id].length}</span>
          </button>
        ))}
      </div>

      <div className="mt-5">
        {tab === "waiting" && (
          <>
            {loaded && lists.waiting.length === 0 && <p className="text-sm text-stone-500">{t("rec.none")}</p>}
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {lists.waiting.map((b) => (
                <BatchCard key={b.id} batch={b}>
                  {b.collector?.name && <p className="mt-1 text-sm text-stone-500">{t("rec.from", { name: b.collector.name })}</p>}
                  <ReceiptForm batch={b} onDone={reload} />
                </BatchCard>
              ))}
            </div>
          </>
        )}

        {tab === "recycled" && lists.recycled.length > 0 && (
          <ul className="divide-y divide-stone-200 overflow-hidden rounded-2xl border border-stone-200 bg-paper">
            {lists.recycled.map((b) => (
              <li key={b.id}>
                <Link href={`/batch/${b.id}`} className="flex items-center justify-between gap-3 px-4 py-3 text-sm transition-colors hover:bg-brand-50/60 sm:px-5">
                  <span>
                    <b className="font-semibold text-brand-950">{b.actual_type ?? b.final_type}</b> · {b.actual_kg} {t("kg")}
                    <span className="text-stone-500"> · {t("pub.grade", { g: b.quality_grade ?? "" })} · {b.area} · {new Date(b.scheduled_at ?? b.created_at).toLocaleDateString(locale)}</span>
                    {b.weight_flag && <span className="text-red-700"> · {t("card.flag")}</span>}
                  </span>
                  <span className="shrink-0 font-medium text-brand-800">{estimateValue(b.actual_type ?? b.final_type, Number(b.actual_kg ?? 0), b.quality_grade)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Shell>
  );
}
