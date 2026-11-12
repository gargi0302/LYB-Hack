"use client";
import { Suspense, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import Logo from "@/components/Logo";
import LanguageSwitch from "@/components/LanguageSwitch";
import { supabase, type Plastic, type Role, type Status } from "@/lib/supabase";
import { useLang } from "@/lib/i18n";

type Step = { plastic: Plastic; area: string; kg: number; grade: string | null; status: Status; by_role: Role | null; at: string };

// The batch id is only known when someone opens the link, so Next needs a Suspense boundary here
export default function Page() {
  return (
    <Suspense fallback={<p className="p-8 text-center text-stone-500">…</p>}>
      <BatchHistory />
    </Suspense>
  );
}

// Public page the QR label opens. No login. Shows the chain of custody without any names.
function BatchHistory() {
  const { id } = useParams<{ id: string }>();
  const [steps, setSteps] = useState<Step[] | null>(null);
  const { t, locale } = useLang();

  useEffect(() => {
    supabase.rpc("batch_history", { batch: id }).then(({ data }) => setSteps(data ?? []));
  }, [id]);

  if (!steps) return <p className="p-10 text-center text-stone-500">{t("loading")}</p>;
  if (!steps.length) return <p className="p-10 text-center">{t("pub.notFound")}</p>;
  const last = steps.at(-1)!;

  return (
    <div className="min-h-screen">
      <header className="mx-auto flex h-16 max-w-xl items-center justify-between px-4"><Logo /><LanguageSwitch /></header>
      <main className="mx-auto max-w-xl px-4 pt-4 pb-10">
        <div className="card">
          <p className="flex items-center gap-1.5 text-sm font-medium text-brand-700"><ShieldCheck size={16} /> {t("pub.verified")}</p>
          <h1 className="mt-2 font-display text-2xl font-bold tracking-tight text-brand-950 md:text-3xl">{last.plastic} · {last.kg} {t("kg")}</h1>
          <p className="mt-1 text-sm text-stone-600">
            {last.area}{last.grade && ` · ${t("pub.grade", { g: last.grade })}`} · {t("pub.batch", { id: id.slice(0, 8) })}
          </p>

          <ol className="mt-5 ml-1.5 border-l-2 border-brand-300 pl-5">
            {steps.map((s, i) => (
              <li key={i} className="relative mb-4 last:mb-0">
                <span className="absolute top-1.5 -left-[27px] h-3 w-3 rounded-full bg-brand-600 ring-4 ring-paper" />
                <p className="text-sm font-semibold text-brand-950">{t(`status.${s.status}`)}</p>
                <p className="text-sm text-stone-500">
                  {t("pub.by", { role: s.by_role ? t(`role.${s.by_role}`) : t("pub.system") })} ·{" "}
                  {new Date(s.at).toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" })}
                </p>
              </li>
            ))}
          </ol>
        </div>
        <p className="mt-4 text-center text-xs text-stone-500">{t("pub.footer")}</p>
      </main>
    </div>
  );
}
