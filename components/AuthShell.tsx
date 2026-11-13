"use client";
import { ArrowLeft, MapPin, QrCode, ScanLine } from "lucide-react";
import Logo from "./Logo";
import Monster from "./Monster";
import LanguageSwitch from "./LanguageSwitch";
import { useLang, type Key } from "@/lib/i18n";

const FEATURES: { Icon: typeof ScanLine; text: Key }[] = [
  { Icon: ScanLine, text: "login.f1" },
  { Icon: MapPin, text: "login.f2" },
  { Icon: QrCode, text: "login.f3" },
];

// Frame for the login, sign-up and reset pages. Nothing should need scrolling, so extras only show on
// screens tall enough ("fits", "roomy", "tall" in globals.css).
//
// Wide screens: the dark brand panel on the left (unchanged), the form centred on the right.
// Phones: the green band is 40% of the screen and the cream part 60%, meeting at a straight edge. The band
// carries who we are and where you are (title, step); the cream part carries only the task, with its
// buttons at the bottom where the thumb is (see the forms). A small Basellion stands on the edge.
//
// title/eyebrow/progress: the page heading, e.g. "Create your account", "Step 2 of 4 · Personal details"
// and a 0–1 progress line. Without a title (login) the band shows the app's headline instead.
// greet: Basellion's speech bubble (login only, it says hello once).
// onBack: shows a small "Back" link above the form (the previous sign-up step, or the login page).
export default function AuthShell({ title, eyebrow, progress, greet = false, onBack, children }: {
  title?: string;
  eyebrow?: string;
  progress?: number;
  greet?: boolean;
  onBack?: () => void;
  children: React.ReactNode;
}) {
  const { t } = useLang();
  const line = progress !== undefined && (
    <div aria-hidden className="h-[3px] w-full bg-white/10 lg:rounded-full lg:bg-stone-200">
      <div className="h-full bg-brand-300 transition-[width] duration-500 lg:rounded-full lg:bg-brand-600" style={{ width: `${progress * 100}%` }} />
    </div>
  );

  return (
    <div className="flex h-svh flex-col lg:grid lg:h-auto lg:min-h-svh lg:grid-cols-2">
      <section className="relative flex min-h-[5.5rem] shrink basis-[40svh] flex-col overflow-hidden bg-brand-900 px-5 pt-[calc(1rem+env(safe-area-inset-top))] text-white sm:px-8 lg:sticky lg:top-0 lg:h-svh lg:justify-between lg:px-14 lg:py-10">
        {/* soft rings, as on Basellion's panels inside the app */}
        <div aria-hidden className="pointer-events-none absolute -right-48 -bottom-48 aspect-square w-[640px] rounded-full border-[64px] border-white/[0.04]" />
        <div aria-hidden className="pointer-events-none absolute -right-16 -bottom-16 aspect-square w-[340px] rounded-full bg-white/[0.04]" />

        <div className="relative flex shrink-0 items-center justify-between gap-3">
          <Logo light />
          <LanguageSwitch dark />
        </div>

        {/* the app's headline: always on the wide panel; on phones only for login, and only if tall enough */}
        <div className={`relative mt-5 max-w-xl lg:mt-0 lg:block ${title ? "hidden" : "hidden roomy:block"}`}>
          <h2 className="font-display text-[26px] leading-[1.15] font-bold tracking-tight sm:text-4xl xl:text-5xl xl:leading-[1.12]">
            {t("login.headline")} <span className="text-brand-100">{t("login.accent")}</span>
          </h2>
          <p className="mt-3 hidden text-[15px] leading-relaxed text-white/80 tall:block sm:mt-4 sm:text-base lg:block lg:text-lg">{t("login.sub")}</p>
          <ul className="mt-8 hidden space-y-3 lg:roomy:block">
            {FEATURES.map(({ Icon, text }) => (
              <li key={text} className="flex items-center gap-3 text-brand-50">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/10 text-brand-200"><Icon size={18} /></span>
                {t(text)}
              </li>
            ))}
          </ul>
        </div>

        {/* phones: the page title at the foot of the band, Basellion standing on the edge beside it */}
        <div className="relative mt-auto flex items-end justify-between gap-3 pt-4 lg:hidden">
          {title ? (
            <div className="min-w-0 pb-4">
              {eyebrow && <p className="text-[11px] font-semibold tracking-[0.14em] text-brand-300 uppercase">{eyebrow}</p>}
              <h1 className="mt-1 font-display text-[26px] leading-tight font-bold tracking-tight">{title}</h1>
            </div>
          ) : (
            <span />
          )}
          <div className="hidden shrink-0 items-end gap-1.5 fits:flex">
            {greet && (
              <p className="relative mb-6 max-w-[170px] rounded-lg bg-white px-2.5 py-1.5 text-xs leading-snug font-medium text-brand-950">
                {t("m.hello")}
                <span aria-hidden className="absolute -right-1 bottom-2.5 h-2 w-2 rotate-45 bg-white" />
              </p>
            )}
            <Monster mood="happy" message="" size={60} />
          </div>
        </div>
        <div className="relative -mx-5 sm:-mx-8 lg:hidden">{line}</div>

        {/* wide screens: Basellion in the panel's corner */}
        <div className="relative hidden justify-end lg:tall:flex">
          <Monster mood="happy" message={t("m.hello")} size={150} />
        </div>
      </section>

      <section className="flex flex-1 shrink-0 flex-col bg-cream px-5 pt-5 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:px-8 lg:justify-center lg:py-8">
        <div className="mx-auto flex w-full max-w-[400px] flex-1 flex-col lg:flex-none">
          {onBack && (
            <button type="button" onClick={onBack}
              className="-ml-2 mb-3 inline-flex items-center gap-1.5 self-start rounded-full px-2 py-1 text-sm font-medium text-brand-700 hover:bg-brand-50 hover:text-brand-950">
              <ArrowLeft size={16} /> {t("signup.back")}
            </button>
          )}
          {title && (
            <div className="mb-6 hidden lg:block">
              {eyebrow && <p className="text-[11px] font-semibold tracking-[0.14em] text-brand-600 uppercase">{eyebrow}</p>}
              <h1 className="mt-1 font-display text-[30px] leading-tight font-bold tracking-tight text-brand-950">{title}</h1>
              {line && <div className="mt-4">{line}</div>}
            </div>
          )}
          {children}
        </div>
      </section>
    </div>
  );
}
