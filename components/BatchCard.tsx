"use client";
import { useState } from "react";
import Link from "next/link";
import { QRCodeSVG } from "qrcode.react";
import { STATUSES, typesOf, type Batch } from "@/lib/supabase";
import { useLang } from "@/lib/i18n";

// "Items: 1. PET · 2. 6 × PP (cookie wrapper)", shared with the tracker
export function ItemsLine({ batch }: { batch: Batch }) {
  const { t } = useLang();
  if (!batch.batch_items?.length) return null;
  const list = [...batch.batch_items].sort((a, b) => a.position - b.position)
    .map((i) => `${i.position}. ${i.count > 1 ? `${i.count} × ` : ""}${i.type === "UNCLEAR" ? t("items.unsureShort") : i.type}${i.name ? ` (${i.name})` : ""}`);
  return <p className="mt-2 text-sm text-stone-600">{t("items")}: {list.join(" · ")}</p>;
}

// One batch: what it is, how far along it is, any warnings, and its QR label.
// Each role puts its own buttons inside (children).
export default function BatchCard({ batch, children }: { batch: Batch; children?: React.ReactNode }) {
  const [showQr, setShowQr] = useState(false);
  const { t, locale } = useLang();
  const step = STATUSES.indexOf(batch.status);

  return (
    <article className="card">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="heading">{typesOf(batch).join(" + ")} · {batch.declared_kg} {t("kg")}</p>
          <p className="mt-0.5 text-sm text-stone-500">{batch.area} · {t("card.listed", { date: new Date(batch.created_at).toLocaleDateString(locale) })}</p>
        </div>
        <span className="flex items-center gap-1.5 pt-1.5 text-xs font-semibold whitespace-nowrap text-brand-800">
          <span className="h-1.5 w-1.5 rounded-full bg-brand-500" /> {t(`status.${batch.status}`)}
        </span>
      </div>

      <ItemsLine batch={batch} />

      <div role="progressbar" aria-label={t("card.progress")} aria-valuemin={1} aria-valuemax={STATUSES.length} aria-valuenow={step + 1} className="mt-3 flex gap-1">
        {STATUSES.map((s, i) => (
          <span key={s} className={`h-1 flex-1 rounded-full ${i <= step ? "bg-brand-600" : "bg-stone-200"}`} />
        ))}
      </div>

      <ul className="mt-2 space-y-1 text-sm">
        {batch.ai_type && (
          <li className="text-stone-600">
            {t("card.ai", { type: batch.ai_type === "UNCLEAR" ? t("feed.notPlastic") : batch.ai_type, pct: batch.ai_confidence === null ? "—" : `${Math.round(batch.ai_confidence * 100)}%` })}
          </li>
        )}
        {batch.actual_kg !== null && (
          <li>
            {t("card.weighed", { kg: batch.actual_kg, grade: batch.quality_grade ?? "" })}
            {batch.actual_type !== batch.final_type && ` · ${t("card.found", { type: batch.actual_type ?? "" })}`}
          </li>
        )}
        {batch.weight_flag && <li className="font-medium text-red-700">{t("card.flag")}</li>}
        {Number(batch.pickup_fee) > 0 && <li className="font-medium text-brand-900">{t("card.fee", { fee: batch.pickup_fee!, km: batch.distance_km ?? "" })}</li>}
      </ul>

      {children}

      <div className="mt-4 flex gap-5 border-t border-stone-200 pt-3 text-sm font-medium text-brand-700">
        <button onClick={() => setShowQr(!showQr)} className="hover:text-brand-950">{showQr ? t("card.hideQr") : t("card.qr")}</button>
        <Link href={`/batch/${batch.id}`} className="hover:text-brand-950">{t("card.history")}</Link>
      </div>
      {showQr && (
        <div className="mt-3 flex flex-col items-center gap-1">
          <QRCodeSVG value={`${window.location.origin}/batch/${batch.id}`} size={160} bgColor="transparent" fgColor="#31572c" />
          <p className="text-xs text-stone-500">{t("card.scan", { id: batch.id.slice(0, 8) })}</p>
        </div>
      )}
    </article>
  );
}
