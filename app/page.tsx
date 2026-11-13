"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";
import AuthShell from "@/components/AuthShell";
import { supabase, homeFor } from "@/lib/supabase";
import { rememberLogin } from "@/lib/remember";
import { useLang } from "@/lib/i18n";

// Sign in with email and password. Everyone lands on the home of the one role their account has.
export default function Login() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const { t } = useLang();

  async function login() {
    setBusy(true);
    setError("");
    setNotice("");
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setError(error.message === "Invalid login credentials" ? t("login.wrong") : error.message);
      setBusy(false);
      return;
    }
    rememberLogin(remember);
    const { data: me } = await supabase.from("profiles").select("role").eq("id", data.user.id).single();
    router.replace(homeFor(me?.role));
    // Next keeps this page alive in the background, so get it ready for the next sign-in (after log out)
    setBusy(false);
    setPassword("");
  }

  // emails a link to /reset. Supabase answers the same whether or not the email has an account.
  async function forgot() {
    setError("");
    setNotice("");
    if (!email.includes("@")) return setError(t("login.needEmail"));
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${location.origin}/reset` });
    if (error) setError(error.message);
    else setNotice(t("login.resetSent", { email }));
  }

  return (
    <AuthShell greet>
      <div className="text-center">
        <h2 className="font-display text-[26px] leading-tight font-bold tracking-tight text-brand-950 lg:text-[30px]">{t("login.welcome")}</h2>
        <p className="mt-1 text-sm text-stone-500">{t("login.enter")}</p>
      </div>

      <form onSubmit={(e) => { e.preventDefault(); login(); }} className="mt-5 flex flex-1 flex-col gap-3">
        <div className="field">
          <label htmlFor="email" className="field-label">{t("login.email")}</label>
          <input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="field-input" autoComplete="email" />
        </div>
        <div className="field pr-11">
          <label htmlFor="password" className="field-label">{t("login.password")}</label>
          <input id="password" type={showPassword ? "text" : "password"} required value={password} onChange={(e) => setPassword(e.target.value)}
            className="field-input" autoComplete="current-password" />
          <button type="button" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? t("login.hide") : t("login.show")}
            className="absolute top-1/2 right-1.5 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full text-stone-500 hover:text-brand-950">
            {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        </div>

        <div className="flex items-center justify-between gap-3 text-sm">
          <label className="flex cursor-pointer items-center gap-2 text-stone-600">
            <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} className="h-4 w-4 accent-brand-800" />
            {t("login.remember")}
          </label>
          <button type="button" onClick={forgot} className="text-stone-500 hover:text-brand-950">{t("login.forgot")}</button>
        </div>

        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
        {notice && <p role="status" className="rounded-xl bg-brand-50 px-3 py-2 text-sm text-brand-900">{notice}</p>}

        {/* actions: at the foot of the screen on phones, right under the fields on wide screens */}
        <div className="mt-auto pt-4">
          <button disabled={busy} className="btn-primary min-h-12 w-full text-base">{busy ? t("login.busy") : t("login.title")}</button>
          <p className="mt-3 text-center text-sm text-stone-500">
            {t("login.new")} <Link href="/signup" className="font-semibold text-brand-950 hover:text-brand-700">{t("login.create")}</Link>
          </p>
        </div>
      </form>
    </AuthShell>
  );
}
