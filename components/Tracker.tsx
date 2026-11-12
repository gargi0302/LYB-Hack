"use client";
import Link from "next/link";
import { ItemsLine } from "./BatchCard";
import { STATUSES, typesOf, type Batch, type Status } from "@/lib/supabase";
import { slotLabel } from "@/lib/slots";
import { useLang } from "@/lib/i18n";

export type StepEvent = { batch_id: string; to_status: Status; created_at: string };

// Order-tracking view (like a parcel): every step of the pickup, when it happened, and what's next.
export default function Tracker({ batch, events, children }: { batch: Batch; events: StepEvent[]; children?: React.ReactNode }) {
  const { t, lang, locale } = useLang();
  const time = (iso: string) => new Date(iso).toLocaleString(locale, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
  const coins = Math.floor(batch.declared_kg * 10);
  // the line under the current step
  const vars = {
    who: batch.collector?.name ?? t("tr.theCollector"),
    slot: batch.scheduled_at ? slotLabel(new Date(batch.scheduled_at), lang) : "",
    coins,
    kg: batch.actual_kg ?? "",
  };
  const current = STATUSES.indexOf(batch.status);
  const when = (s: Status) => events.findLast((e) => e.batch_id === batch.id && e.to_status === s)?.created_at;
  const declined = batch.status === "requested" && events.some((e) => e.batch_id === batch.id && e.to_status === "matched");

  return (
    <article className="card">
      <div className="flex items-baseline justify-between gap-3">
        <p className="heading">{typesOf(batch).join(" + ")} · {batch.declared_kg} {t("kg")}</p>
        <Link href={`/batch/${batch.id}`} className="shrink-0 text-sm font-medium text-brand-700 hover:text-brand-950">{t("qrHistory")}</Link>
      </div>
      <ItemsLine batch={batch} />
      {batch.status === "picked_up" && (
        <p className="coin-pop mt-3 rounded-xl bg-brand-50 px-3 py-2 text-sm font-semibold text-brand-800">
          {t("tr.complete", { coins })}
        </p>
      )}
      {declined && <p className="mt-2 text-sm text-brand-800">{t("tr.declined")}</p>}

      <ol className="mt-4">
        {STATUSES.map((s, i) => (
          <li key={s} className="relative flex gap-3 pb-3 last:pb-0">
            {i < STATUSES.length - 1 && (
              <span className={`absolute top-4 left-[7px] h-full w-0.5 ${i < current ? "bg-brand-500" : "bg-stone-200"}`} />
            )}
            <span className={`relative mt-1 h-4 w-4 shrink-0 rounded-full border-2 ${i <= current ? "border-brand-600 bg-brand-600" : "border-stone-300 bg-paper"}`} />
            <div className="text-sm">
              <p className={i <= current ? "font-semibold text-brand-950" : "text-stone-400"}>{t(`tr.${s}`)}</p>
              {i === current && <p className="text-stone-600">{t(`tr.${s}D`, vars)}</p>}
              {i <= current && when(s) && <p className="text-xs text-stone-500">{time(when(s)!)}</p>}
            </div>
          </li>
        ))}
      </ol>
      {children}
    </article>
  );
}
