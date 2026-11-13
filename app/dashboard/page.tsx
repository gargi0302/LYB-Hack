"use client";
import { useEffect, useState } from "react";
import { RotateCcw } from "lucide-react";
import Shell from "@/components/Shell";
import { AreaChart, TYPE_COLOR, WeeklyChart } from "@/components/Charts";
import { useProfile } from "@/lib/useProfile";
import { supabase } from "@/lib/supabase";
import { PLASTICS } from "@/lib/plastics";
import { ownCorrections, ownImpact, ownQuality, type Impact, type OwnBatch, type Quality } from "@/lib/impact";
import { useLang, type Key } from "@/lib/i18n";

type Factor = { plastic: string; kg_co2e_per_kg: number; source: string };
type Leader = { id: string; name: string; area: string; coins: number };
// own: a user, collector or recycler sees only their own batches; Plant X sees every area
type Data = { impact: Impact[]; factors: Factor[]; quality: Quality[]; leaders: Leader[]; corrections: number; asOf: number; own: boolean };

const sum = (list: number[]) => list.reduce((a, b) => a + b, 0);
const indian = (n: number) => Math.round(n).toLocaleString("en-IN"); // 1,74,50,776 style grouping

// Straight line through the weekly totals (least squares), carried 4 weeks ahead.
function nextFourWeeks(weekly: number[]) {
  const n = weekly.length;
  const meanX = (n - 1) / 2;
  const meanY = sum(weekly) / n;
  const slope = sum(weekly.map((y, x) => (x - meanX) * (y - meanY))) / sum(weekly.map((_, x) => (x - meanX) ** 2));
  return sum([n, n + 1, n + 2, n + 3].map((x) => Math.max(0, meanY + slope * (x - meanX))));
}

export default function ImpactDashboard() {
  const profile = useProfile();
  const { t, locale } = useLang();
  const [data, setData] = useState<Data | null>(null);

  useEffect(() => {
    if (!profile) return;
    if (profile.role !== "plantx") {
      // the database lets each person read only the batches they listed, collected or recycled
      Promise.all([
        supabase.from("batches").select("area, final_type, actual_type, actual_kg, ai_type, status, status_events(to_status, created_at)"),
        supabase.from("emission_factors").select("*"),
      ]).then(([b, f]) => {
        const batches = (b.data ?? []) as OwnBatch[];
        const factors = f.data ?? [];
        setData({
          impact: ownImpact(batches, factors), factors, quality: ownQuality(batches), leaders: [],
          corrections: ownCorrections(batches), asOf: Date.now(), own: true,
        });
      });
      return;
    }
    Promise.all([
      supabase.from("impact_weekly").select("*").order("week"),
      supabase.from("emission_factors").select("*"),
      supabase.from("sorting_quality").select("*").order("match_pct"),
      supabase.from("leaderboard").select("id, name, area, coins").order("coins", { ascending: false }).limit(5),
      supabase.from("model_corrections").select("id", { count: "exact", head: true }),
    ]).then(([i, f, q, l, c]) => setData({
      impact: i.data ?? [], factors: f.data ?? [], quality: q.data ?? [], leaders: l.data ?? [], corrections: c.count ?? 0,
      asOf: Date.now(), // shown as "As on 12-11-2026"
      own: false,
    }));
  }, [profile]);

  async function resetDemo() {
    if (!confirm(t("dash.resetConfirm"))) return;
    const { error } = await supabase.rpc("reset_demo");
    if (error) alert(error.message);
    else location.reload();
  }

  if (!data) return <Shell profile={profile} title={t("nav.impact")}>{null}</Shell>;

  const { impact, factors, quality, leaders } = data;
  const weeks = [...new Set(impact.map((r) => r.week))];
  const areas = [...new Set(impact.map((r) => r.area))];
  const kgOf = (filter: (r: Impact) => boolean) => sum(impact.filter(filter).map((r) => Number(r.kg)));

  const totalKg = kgOf(() => true);
  const totalCo2 = sum(impact.map((r) => Number(r.co2e_kg)));
  // "per day" is the daily average over the last 4 finished weeks (the current week is still filling up)
  const lastFourWeeks = (r: Impact) => weeks.slice(-5, -1).includes(r.week);
  const kgPerDay = kgOf(lastFourWeeks) / 28;
  const co2PerDay = sum(impact.filter(lastFourWeeks).map((r) => Number(r.co2e_kg))) / 28;
  const checked = sum(quality.map((q) => q.checked));
  const matchPct = checked ? sum(quality.map((q) => q.match_pct * q.checked)) / checked : 0;
  const nothingYet = data.own && impact.length === 0;
  const weekly = weeks.map((w) => ({
    week: new Date(w).toLocaleDateString(locale, { day: "numeric", month: "short" }),
    ...Object.fromEntries(PLASTICS.map((p) => [p, kgOf((r) => r.week === w && r.plastic === p)])),
  }));
  // forecast uses the last 8 finished weeks (the current week is still filling up)
  const forecast = (p: string) => nextFourWeeks(weeks.slice(-9, -1).map((w) => kgOf((r) => r.week === w && r.plastic === p)));
  const colorOf = (p: string) => TYPE_COLOR[p as keyof typeof TYPE_COLOR];

  return (
    <Shell profile={profile} title={t("nav.impact")}>
      {/* headline counters, laid out like government impact dashboards (e.g. PM E-DRIVE's "CO2 Reduction per day") */}
      <section className="card overflow-hidden p-0 sm:p-0">
        <div className="flex flex-wrap items-baseline justify-between gap-2 px-4 pt-4 sm:px-5">
          <h2 className="heading">{t("dash.env")}</h2>
          <p className="muted">{t("dash.asOn", { date: new Date(data.asOf).toLocaleDateString("en-IN").replaceAll("/", "-") })}</p>
        </div>
        <dl className="mt-3 grid grid-cols-2 gap-px border-y border-stone-200 bg-stone-200 lg:grid-cols-4">
          {[
            [t("dash.co2Day"), co2PerDay],
            [t("dash.co2Total"), totalCo2],
            [t("dash.kgDay"), kgPerDay],
            [t("dash.kgTotal"), totalKg],
          ].map(([label, value]) => (
            <div key={label} className="bg-paper px-4 py-4 sm:px-5">
              <dt className="text-sm text-stone-500">{label}</dt>
              <dd className="mt-1 font-display text-2xl font-bold tracking-tight text-brand-950 tabular-nums lg:text-3xl">{indian(Number(value))}</dd>
            </div>
          ))}
        </dl>
        <p className="px-4 py-3 text-xs text-stone-500 sm:px-5">{t("dash.footnote")}</p>
      </section>
      <p className="mt-3 text-sm font-medium text-brand-800">{t(`dash.scope.${profile!.role}` as Key)}</p>

      {nothingYet && (
        <section className="card mt-4 text-center">
          <h2 className="heading">{t("dash.empty")}</h2>
          <p className="muted mt-1">{t("dash.emptyText")}</p>
        </section>
      )}

      {!nothingYet && (
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <section className="card lg:col-span-2">
          <h2 className="heading">{t("dash.weekly")}</h2>
          <div className="mt-3"><WeeklyChart data={weekly} unit={t("kg")} /></div>
          <p className="text-xs text-stone-500">{t("dash.lastBar")}</p>
        </section>

        {checked > 0 && (
        <section className="card">
          <h2 className="heading">{t("dash.quality")}</h2>
          <p className="muted mt-0.5">{t("dash.qualityHelp")}</p>
          <dl className="mt-3 flex gap-8">
            <div>
              <dt className="text-sm text-stone-500">{t("dash.sorted")}</dt>
              <dd className="font-display text-2xl font-bold text-brand-950">{Math.round(matchPct)}%</dd>
            </div>
            <div>
              <dt className="text-sm text-stone-500">{t("dash.checked")}</dt>
              <dd className="font-display text-2xl font-bold text-brand-950">{checked}</dd>
            </div>
          </dl>
          <AreaChart unit="%" max={100} data={quality.map((q) => ({ area: q.area, value: Number(q.match_pct) }))} />
        </section>
        )}

        {areas.length > 1 && (
        <section className="card">
          <h2 className="heading">{t("dash.byArea")}</h2>
          <AreaChart unit={` ${t("kg")}`} data={areas.map((a) => ({ area: a, value: kgOf((r) => r.area === a) })).sort((x, y) => y.value - x.value)} />
        </section>
        )}

        <section className="card">
          <h2 className="heading">{t("dash.co2How")}</h2>
          <p className="mt-3 rounded-lg bg-brand-50 px-3 py-2 font-mono text-[13px] text-brand-900">{t("dash.formula")}</p>
          <table className="mt-3 w-full text-sm">
            <thead className="text-left text-stone-500">
              <tr><th className="pb-2 font-medium">{t("dash.type")}</th><th className="pb-2 text-right font-medium">{t("kg")}</th><th className="pb-2 text-right font-medium">{t("dash.factor")}</th><th className="pb-2 text-right font-medium">{t("dash.co2kg")}</th></tr>
            </thead>
            <tbody className="tabular-nums">
              {PLASTICS.map((p) => {
                const kg = kgOf((r) => r.plastic === p);
                const factor = Number(factors.find((f) => f.plastic === p)?.kg_co2e_per_kg ?? 0);
                return (
                  <tr key={p} className="border-t border-stone-200">
                    <td className="py-2"><span className="mr-2 inline-block h-2.5 w-2.5 rounded-sm" style={{ background: colorOf(p) }} />{p}</td>
                    <td className="text-right">{Math.round(kg)}</td><td className="text-right">{factor}</td><td className="text-right font-medium">{Math.round(kg * factor)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-stone-500">
            <li>{t("dash.b1")}</li>
            <li>{t("dash.b2", { source: factors[0]?.source ?? "" })}</li>
            <li>{t("dash.b3")}</li>
          </ul>
        </section>

        {!data.own && (
        <section className="card">
          <h2 className="heading">{t("dash.forecast")}</h2>
          <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-3">
            {PLASTICS.map((p) => (
              <div key={p} className="border-l-2 pl-3" style={{ borderColor: colorOf(p) }}>
                <dt className="text-sm text-stone-500">{p}</dt>
                <dd className="font-display text-xl font-bold text-brand-950 tabular-nums">~{indian(forecast(p))} {t("kg")}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-3 text-xs text-stone-500">{t("dash.forecastHelp")}</p>
        </section>
        )}

        {!data.own && (
        <section className="card">
          <h2 className="heading">{t("dash.top")}</h2>
          <p className="muted mt-0.5">{t("dash.topHelp")}</p>
          <ol className="mt-2 divide-y divide-stone-200 text-sm">
            {leaders.map((l, i) => (
              <li key={l.id} className="flex items-center justify-between gap-3 py-2">
                <span><span className="mr-3 text-stone-400 tabular-nums">{i + 1}</span>{l.name} <span className="text-stone-500">· {l.area}</span></span>
                <b className="font-semibold text-brand-600 tabular-nums">{l.coins}</b>
              </li>
            ))}
          </ol>
        </section>
        )}

        <section className="card">
          <h2 className="heading">{t("dash.ai")}</h2>
          <p className="mt-2 text-sm text-stone-600">
            <b className="font-display text-2xl font-bold text-brand-950">{data.corrections}</b> {t("dash.aiText")}
          </p>
        </section>
      </div>
      )}

      {/* only Plant X can reload the demo data */}
      {!data.own && (
        <div className="mt-6 flex justify-end">
          <button onClick={resetDemo} className="btn-secondary min-h-9 px-4 text-xs"><RotateCcw size={14} /> {t("dash.reset")}</button>
        </div>
      )}
    </Shell>
  );
}
