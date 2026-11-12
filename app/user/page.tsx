"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Camera, Coins, Heart, Leaf, ShoppingBag, type LucideIcon } from "lucide-react";
import Shell from "@/components/Shell";
import Monster, { moodFor, type Mood } from "@/components/Monster";
import { Hills, Sprig, worldStyle } from "@/components/World";
import { useBatches, useProfile } from "@/lib/useProfile";
import { supabase } from "@/lib/supabase";
import { fedThisMonth, greenness, growth, STAGES } from "@/lib/growth";
import { useLang } from "@/lib/i18n";

const DAY = 86400000;
const PREVIEW: Mood[] = ["hungry", "sad", "happy"]; // tap Basellion to show each mood in a demo
const PREVIEW_HAPPINESS = [55, 10, 100];

// Home is just Basellion and the Feed button. Pickups and history are under "My waste".
export default function UserHome() {
  const profile = useProfile("generator");
  const [batches, , loaded] = useBatches(profile);
  const { t } = useLang();
  const [coins, setCoins] = useState(0);
  const [factors, setFactors] = useState<Record<string, number>>({});
  const [preview, setPreview] = useState(-1);
  const [now, setNow] = useState(0); // time of the last refresh, used for Basellion's mood

  // my coins (10 per kg picked up) and the CO2 factors for my own impact line
  useEffect(() => {
    if (!profile) return;
    supabase.from("leaderboard").select("coins").eq("id", profile.id).maybeSingle().then(({ data }) => {
      setCoins(data?.coins ?? 0);
      setNow(Date.now());
    });
    supabase.from("emission_factors").select("plastic, kg_co2e_per_kg")
      .then(({ data }) => setFactors(Object.fromEntries((data ?? []).map((f) => [f.plastic, Number(f.kg_co2e_per_kg)]))));
  }, [profile]);

  // Basellion's mood comes from the last time something recyclable was listed (batches are newest first)
  const fed = batches.filter((b) => b.final_type !== "UNCLEAR");
  const daysSince = fed[0] ? Math.floor((now - new Date(fed[0].created_at).getTime()) / DAY) : null;
  const ready = loaded && now > 0;
  const mood = preview >= 0 ? PREVIEW[preview] : ready ? moodFor(daysSince) : "thinking";
  // size, happiness and stage come from this month's kilos, plus a little for every listing eaten (lib/growth.ts)
  const month = fedThisMonth(batches, now);
  const grown = growth(month.kg, month.meals);
  const happiness = preview >= 0 ? PREVIEW_HAPPINESS[preview] : grown.happiness;
  // the card goes from pale (nothing recycled yet) to green as the month's recycling adds up
  const green = ready ? greenness(month.kg, month.meals) : 0;
  const world = worldStyle(green);

  // my share of the dashboard's CO2 figure: weighed kg × factor for the type the recycler found
  const myCo2 = batches.filter((b) => b.status === "recycled")
    .reduce((sum, b) => sum + Number(b.actual_kg) * (factors[b.actual_type ?? b.final_type] ?? 0), 0);

  return (
    <Shell profile={profile} title={t("home.hello", { name: profile?.name ?? "" })}>
      {/* Wide screens: Basellion on the left half, the numbers and the Feed button on the right. Phones: one column.
          The card fills the rest of the screen so nothing scrolls (header, title, page padding and the phone tab
          bar take about 16.5rem on phones, 11.75rem on wider screens); on large screens it stops at 38rem tall. */}
      <section className="relative grid h-[calc(100svh-16.5rem-env(safe-area-inset-bottom))] min-h-[380px] grid-rows-[minmax(0,1fr)_auto] overflow-hidden rounded-[2rem] border border-white/80 bg-brand-50 shadow-[0_2px_24px_rgba(49,87,44,0.06)] md:h-[calc(100svh-11.75rem)] md:min-h-[440px] lg:h-[min(calc(100svh-11.75rem),38rem)] lg:grid-cols-2 lg:grid-rows-1" style={world}>
        <div className="relative flex min-h-0 flex-col p-4 md:p-6 lg:p-8">
          <Hills green={green} />
          <Sprig green={green} className="absolute right-0 bottom-3 h-24 w-24 lg:hidden" />
          <div className="relative z-10 flex items-center justify-between gap-3">
            <h2 className="heading text-xl md:text-2xl lg:text-[28px]">{t("home.name")}</h2>
            <p className="flex items-center gap-1.5 rounded-full bg-paper px-3.5 py-1.5 text-sm font-semibold text-brand-950 shadow-[0_2px_10px_rgba(49,87,44,0.08)]">
              <Coins size={16} className="text-brand-600" /> {t("coins", { n: coins })}
            </p>
          </div>
          {/* Basellion: his stage size (lib/growth.ts) times --u, set so the biggest stage and his speech bubble
              just fit this area (container units). Phones: he stands on the hills at its foot; wide screens: centred
              a little low, so he stands on the hills there too. */}
          <div className="relative grid min-h-0 flex-1 items-end justify-items-center pb-1 [container-type:size] [--u:clamp(0.4px,calc((100cqh_-_3.5rem)/260),2px)] lg:[--u:clamp(0.4px,calc((100cqh_-_3.5rem)/260),1.25px)] lg:items-center lg:pt-[8%] lg:pb-0">
            <Monster mood={mood} size={`calc(${ready ? grown.size : STAGES[1].size} * var(--u))`} onTap={() => setPreview((p) => (p + 1 < PREVIEW.length ? p + 1 : -1))} />
          </div>
        </div>

        <div className="relative flex flex-col justify-center gap-2.5 px-4 pt-3.5 pb-4 md:gap-3 md:px-6 md:pt-5 md:pb-6 lg:border-l lg:border-brand-300 lg:p-8 xl:px-12">
          <Sprig green={green} className="absolute top-2 right-4 hidden h-40 w-40 lg:block" />
          <dl className="relative grid grid-cols-2 gap-2.5 max-md:tall:grid-cols-1 md:gap-3">
            <Stat Icon={ShoppingBag} label={t("home.fed")} value={ready ? `${Math.round(month.kg)} ${t("kg")}` : "…"} />
            <Stat Icon={Heart} label={t("home.happiness")} value={ready ? `${happiness}%` : "…"} />
          </dl>
          <p className="relative flex items-center gap-3 rounded-2xl bg-paper px-3.5 py-3 text-sm text-stone-700 shadow-[0_1px_6px_rgba(49,87,44,0.05)] md:px-5 md:py-4 md:text-base">
            <Leaf size={20} className="shrink-0 text-brand-800" />
            {t("home.co2", { kg: Math.round(myCo2).toLocaleString("en-IN") })}
          </p>
          <Link href="/user/new" className="btn-primary relative mt-1 min-h-12 w-full bg-gradient-to-b from-brand-700 to-brand-900 font-display text-base shadow-[0_6px_18px_rgba(49,87,44,0.18)] transition-[translate,box-shadow] hover:-transtone-y-px md:min-h-14 md:text-lg">
            <Camera size={20} /> {t("home.feed")}
          </Link>
        </div>
      </section>
    </Shell>
  );
}

// one number with its icon: side by side on wide screens, stacked rows on tall phones
function Stat({ Icon, label, value }: { Icon: LucideIcon; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-paper p-2.5 shadow-[0_1px_6px_rgba(49,87,44,0.05)] md:gap-4 md:p-4">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-800 text-brand-100 md:h-12 md:w-12"><Icon size={20} /></span>
      <span aria-hidden className="hidden h-9 w-px bg-stone-200 max-md:tall:block" />
      <div className="min-w-0">
        <dt className="truncate text-xs text-stone-500 md:text-sm">{label}</dt>
        <dd className="font-display text-xl font-bold tracking-tight text-brand-950 tabular-nums md:text-3xl">{value}</dd>
      </div>
    </div>
  );
}

