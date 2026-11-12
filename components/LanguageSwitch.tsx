"use client";
import { ChevronDown } from "lucide-react";
import { LANGS, setLang, useLang, type Lang } from "@/lib/i18n";

// EN · हिं · मरा — shown in the header of every page
const SHORT: Record<Lang, string> = { en: "EN", hi: "हिं", mr: "मरा" };

// dark: for the dark panel of the sign-in pages
export default function LanguageSwitch({ dark = false }: { dark?: boolean }) {
  const { lang, t } = useLang();
  return (
    <div role="group" aria-label={t("language")} className={`flex items-center rounded-full border p-0.5 ${dark ? "border-white/15 bg-white/10" : "border-stone-200 bg-paper"}`}>
      {(Object.keys(LANGS) as Lang[]).map((l) => (
        <button key={l} onClick={() => setLang(l)} aria-pressed={lang === l} title={LANGS[l]} lang={l}
          className={`h-8 min-w-9 rounded-full px-2 text-xs font-semibold transition-colors ${lang === l
            ? "bg-brand-300 text-brand-950"
            : dark ? "text-brand-100 hover:text-white" : "text-stone-500 hover:text-brand-950"}`}>
          {SHORT[l]}
        </button>
      ))}
    </div>
  );
}

// compact "EN ⌄" for the app header: the phone's own picker opens on tap
export function LanguageMenu() {
  const { lang, t } = useLang();
  return (
    <label className="relative flex h-9 cursor-pointer items-center gap-1.5 rounded-full bg-brand-100 pr-3 pl-3.5 text-xs font-semibold text-brand-950 transition-colors hover:bg-brand-200">
      <select value={lang} onChange={(e) => setLang(e.target.value as Lang)} aria-label={t("language")}
        className="absolute inset-0 cursor-pointer appearance-none opacity-0">
        {(Object.keys(LANGS) as Lang[]).map((l) => <option key={l} value={l} lang={l}>{LANGS[l]}</option>)}
      </select>
      <span lang={lang}>{SHORT[lang]}</span>
      <ChevronDown size={14} aria-hidden />
    </label>
  );
}
