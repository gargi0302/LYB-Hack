"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";
import AuthShell from "@/components/AuthShell";
import { supabase, homeFor } from "@/lib/supabase";
import { useLang } from "@/lib/i18n";

// Opened from the "Forgot password?" email. Supabase reads the link and signs the person in
// for this one purpose; they choose a new password and go to their home.
export default function ResetPassword() {
  const router = useRouter();
  const { t } = useLang();
  const [valid, setValid] = useState<boolean | null>(null); // null while the link is being checked
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((_event, session) => { if (session) setValid(true); });
    supabase.auth.getSession().then(({ data: { session } }) => setValid(!!session));
    return () => data.subscription.unsubscribe();
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const { data, error } = await supabase.auth.updateUser({ password });
    if (error) {
      setError(error.message);
      setBusy(false);
      return;
    }
    const { data: me } = await supabase.from("profiles").select("role").eq("id", data.user.id).single();
    router.replace(homeFor(me?.role));
  }

  return (
    <AuthShell title={t("reset.title")}>
      {valid === null && <p className="text-sm text-stone-500">{t("loading")}</p>}
      {valid === false && (
        <p className="text-sm text-stone-600">
          {t("reset.invalid")} <Link href="/" className="font-semibold text-brand-950">{t("login.title")}</Link>
        </p>
      )}
      {valid && (
        <form onSubmit={save} className="flex flex-1 flex-col gap-3">
          <div className="field pr-11">
            <label htmlFor="password" className="field-label">{t("reset.new")} <span className="font-normal">{t("signup.min")}</span></label>
            <input id="password" type={show ? "text" : "password"} required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)}
              className="field-input" autoComplete="new-password" />
            <button type="button" onClick={() => setShow(!show)} aria-label={show ? t("login.hide") : t("login.show")}
              className="absolute top-1/2 right-1.5 grid h-9 w-9 -transtone-y-1/2 place-items-center rounded-md text-stone-500 hover:text-brand-950">
              {show ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
          {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
          <div className="mt-auto pt-4">
            <button disabled={busy} className="btn-primary min-h-12 w-full rounded-lg! text-base">{t("reset.save")}</button>
          </div>
        </form>
      )}
    </AuthShell>
  );
}
