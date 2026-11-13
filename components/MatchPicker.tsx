"use client";
import { useEffect, useState } from "react";
import { supabase, typesOf, type Batch, type Profile } from "@/lib/supabase";
import { topMatches } from "@/lib/match";
import { useLang } from "@/lib/i18n";

// Shows the 3 best collectors (or recyclers) for a batch with the reason, and lets the user pick one.
// ownReach: only collectors who go this far themselves, with the pickup charge for each.
export default function MatchPicker({ batch, role, label, onPick, maxKm, ownReach = false }: {
  batch: Batch;
  role: "collector" | "recycler";
  label: string;
  maxKm?: number;
  ownReach?: boolean;
  onPick: (who: Profile) => void;
}) {
  const [people, setPeople] = useState<Profile[] | null>(null);
  const { t } = useLang();

  useEffect(() => {
    supabase.from("profiles").select("*").eq("role", role).then(({ data }) => setPeople(data ?? []));
  }, [role]);

  if (!people) return <p className="mt-3 text-sm text-stone-500">{t("mp.finding")}</p>;
  const types = typesOf(batch);
  const matches = topMatches(people, types, batch.declared_kg, batch, maxKm, ownReach);
  if (!matches.length) {
    const vars = { km: maxKm ?? "", types: types.join(" + "), kg: batch.declared_kg };
    return <p className="mt-3 text-sm text-red-700">{maxKm ? t("mp.noneNear", vars) : t("mp.none", vars)}</p>;
  }

  return (
    <div className="mt-3 space-y-2">
      <p className="text-sm font-medium text-stone-700">{label}</p>
      {matches.map((m) => (
        <button key={m.id} onClick={() => onPick(m)} className="option">
          <span className="font-semibold text-brand-950">{m.name}</span>
          <span className="block text-sm text-stone-500">
            {t("mp.reason", { types: types.join(", "), km: m.km.toFixed(1), cap: m.capacity_kg })}
          </span>
          {ownReach && (
            <span className={`block text-sm font-medium ${m.fee ? "text-brand-900" : "text-brand-600"}`}>
              {m.fee ? t("bp.fee", { fee: m.fee }) : t("bp.feeFree")}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
