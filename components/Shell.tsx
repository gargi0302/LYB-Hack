"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { BarChart3, Factory, House, LayoutDashboard, Leaf, LogOut, Sprout, Truck, UserRound, type LucideIcon } from "lucide-react";
import Logo, { LogoMark } from "./Logo";
import { LanguageMenu } from "./LanguageSwitch";
import { supabase, homeFor, type Profile, type Role } from "@/lib/supabase";
import { useLang, type Key } from "@/lib/i18n";

// what each role can open: label, page, icon
const NAV: Record<Role, [Key, string, LucideIcon][]> = {
  generator: [
    ["nav.home", "/user", House], ["nav.feed", "/user/new", Leaf], ["nav.waste", "/user/waste", BarChart3],
    ["nav.impact", "/dashboard", Sprout], ["nav.profile", "/user/profile", UserRound],
  ],
  collector: [["nav.dashboard", "/collector", LayoutDashboard], ["nav.pickups", "/collector/pickups", Truck], ["nav.impact", "/dashboard", Sprout]],
  recycler: [["nav.dashboard", "/recycler", LayoutDashboard], ["nav.incoming", "/recycler/incoming", Factory], ["nav.impact", "/dashboard", Sprout]],
  plantx: [["nav.impact", "/dashboard", Sprout]],
};

// the icon of the page you are on is filled in, lightly
const NavIcon = ({ Icon, active, size }: { Icon: LucideIcon; active: boolean; size: number }) => (
  <Icon size={size} strokeWidth={active ? 2.2 : 1.8} fill={active ? "currentColor" : "none"} fillOpacity={active ? 0.18 : 0} />
);

// Frame for every logged-in screen: top bar (tabs on wide screens), page title, and a floating tab bar on phones.
export default function Shell({ profile, title, children }: {
  profile: Profile | null;
  title: string;
  children: React.ReactNode;
}) {
  const path = usePathname();
  const router = useRouter();
  const { t } = useLang();

  if (!profile) {
    return (
      <div className="grid min-h-screen place-items-center">
        <div className="animate-pulse"><LogoMark size={48} /></div>
      </div>
    );
  }

  async function logout() {
    await supabase.auth.signOut();
    router.replace("/");
  }
  const nav = NAV[profile.role];

  return (
    <div className="min-h-screen pb-[calc(6rem+env(safe-area-inset-bottom))] md:pb-0">
      <header className="sticky top-0 z-30 border-b border-stone-200/60 bg-paper shadow-[0_1px_12px_rgba(49,87,44,0.04)]">
        <div className="flex h-16 w-full items-center gap-4 px-4 md:px-8 lg:px-[6vw]">
          <Logo href={homeFor(profile.role)} short />
          {nav.length > 1 && (
            <nav className="hidden items-center gap-1 rounded-full border border-stone-200/70 bg-white p-1 shadow-[0_2px_10px_rgba(49,87,44,0.05)] md:mx-auto md:flex">
              {nav.map(([label, href, Icon]) => (
                <Link key={href} href={href} aria-current={path === href ? "page" : undefined}
                  className={`flex items-center gap-2 rounded-full px-3 py-2 text-sm font-medium transition-colors lg:px-4 ${path === href ? "bg-brand-200 text-brand-950" : "text-stone-600 hover:text-brand-950"}`}>
                  <NavIcon Icon={Icon} active={path === href} size={17} /> {t(label)}
                </Link>
              ))}
            </nav>
          )}
          <div className={`ml-auto flex items-center gap-2.5 ${nav.length > 1 ? "md:ml-0" : ""}`}>
            <div className="mr-1 hidden border-r border-stone-200 pr-4 text-right leading-tight xl:block">
              <p className="text-sm font-semibold text-brand-950">{profile.name}</p>
              <p className="text-xs text-stone-500">{t(`role.${profile.role}`)} · {profile.area}</p>
            </div>
            <LanguageMenu />
            <button onClick={logout} aria-label={t("logout")} title={t("logout")}
              className="grid h-9 w-9 place-items-center rounded-full border border-stone-200/70 bg-white text-stone-600 shadow-[0_2px_8px_rgba(49,87,44,0.06)] transition-colors hover:text-brand-950">
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </header>

      {/* full width with even gutters (6% of the screen width on large screens), not a narrow centred column */}
      <main className="w-full px-4 pt-3 pb-6 md:px-8 md:pt-5 md:pb-8 lg:px-[6vw]">
        {/* the page title stays in place under the top bar while the page scrolls (same total height as before) */}
        <h1 className="sticky top-16 z-20 -mx-4 mb-2 bg-cream px-4 py-3 font-display text-2xl font-bold tracking-tight text-brand-950 md:-mx-8 md:px-8 md:text-3xl lg:-mx-[6vw] lg:px-[6vw]">{title}</h1>
        {children}
      </main>

      {nav.length > 1 && (
        // a solid strip at the bottom holds the tab bar, so page content never shows around or through it
        <nav className="fixed inset-x-0 bottom-0 z-30 bg-cream px-3 pt-2 pb-[calc(0.75rem+env(safe-area-inset-bottom))] md:hidden">
          <div className="grid h-[4.5rem] rounded-2xl border border-stone-200/70 bg-paper px-1 shadow-[0_6px_24px_rgba(49,87,44,0.12)]" style={{ gridTemplateColumns: `repeat(${nav.length}, 1fr)` }}>
            {nav.map(([label, href, Icon]) => (
              <Link key={href} href={href} aria-current={path === href ? "page" : undefined}
                className={`flex flex-col items-center justify-center gap-0.5 text-xs font-medium ${path === href ? "text-brand-900" : "text-stone-500"}`}>
                <span className={`grid h-10 w-10 place-items-center rounded-full ${path === href ? "bg-brand-200" : ""}`}>
                  <NavIcon Icon={Icon} active={path === href} size={22} />
                </span>
                {t(label)}
              </Link>
            ))}
          </div>
        </nav>
      )}
    </div>
  );
}
