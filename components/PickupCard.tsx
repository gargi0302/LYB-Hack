"use client";
import BatchCard from "./BatchCard";
import { type Batch } from "@/lib/supabase";
import { estimateValue } from "@/lib/plastics";
import { slotLabel } from "@/lib/slots";
import { useLang } from "@/lib/i18n";

// A batch as a collector sees it: slot, then address and phone (only once they confirmed, RLS hides it before),
// and what a recycler would pay for it. The page puts its own buttons inside.
export default function PickupCard({ batch: b, children }: { batch: Batch; children?: React.ReactNode }) {
  const { t, lang } = useLang();
  return (
    <BatchCard batch={b}>
      <dl className="mt-3 space-y-1 border-t border-stone-200 pt-3 text-sm [&_dd]:inline [&_dt]:inline [&_dt]:text-stone-500">
        {b.scheduled_at && b.status !== "picked_up" && (
          <div><dt>{t("col.slot")}: </dt><dd className="font-semibold text-brand-950">{slotLabel(new Date(b.scheduled_at), lang)}</dd></div>
        )}
        {b.batch_addresses && (
          <>
            <div><dt>{t("col.address")}: </dt><dd className="font-semibold text-brand-950">{b.batch_addresses.address}</dd></div>
            {b.batch_addresses.phone && (
              <div><dt>{t("col.phone")}: </dt><dd><a href={`tel:${b.batch_addresses.phone}`} className="font-semibold text-brand-700">{b.batch_addresses.phone}</a></dd></div>
            )}
          </>
        )}
        <div><dt>{t("col.value")}: </dt><dd>{estimateValue(b.final_type, b.declared_kg)}</dd></div>
      </dl>
      {b.verify_at_pickup && <p className="mt-1 text-sm font-medium text-brand-800">{t("col.verify")}</p>}
      {children}
    </BatchCard>
  );
}
