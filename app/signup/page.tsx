"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BarChart3, Eye, EyeOff, Factory, House, Truck, type LucideIcon } from "lucide-react";
import AuthShell from "@/components/AuthShell";
import { Field, PersonalFields, PlaceFields } from "@/components/ProfileFields";
import { addressFrom, detailsFrom, placeFrom } from "@/lib/areas";
import { PLASTICS } from "@/lib/plastics";
import { supabase, homeFor, type Role } from "@/lib/supabase";
import { useLang, type Key } from "@/lib/i18n";

// the four account types; one email gets exactly one, fixed at sign-up (enforced in the database)
const ROLES: { role: Role; Icon: LucideIcon; hint: Key }[] = [
  { role: "generator", Icon: House, hint: "rh.generator" },
  { role: "collector", Icon: Truck, hint: "rh.collector" },
  { role: "recycler", Icon: Factory, hint: "rh.recycler" },
  { role: "plantx", Icon: BarChart3, hint: "login.plantxHint" },
];
const STEPS: Key[] = ["signup.type", "signup.step1", "signup.step2", "signup.signin"];
const LAST = STEPS.length - 1;

// Anyone can create an account here, in four short steps that each fit one screen:
// 1. account type, 2. personal details, 3. address and location (from a PIN code), 4. email and password.
// All steps stay in the one form (the others hidden), so the last submit sends everything.
export default function SignUp() {
  const router = useRouter();
  const [role, setRole] = useState<Role>("generator");
  const [step, setStep] = useState(0);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const { t } = useLang();
  const business = role === "collector" || role === "recycler"; // they take plastic, so matching needs types and capacity

  // the browser's own checks (required, email, phone pattern...) for the fields of the step on screen
  function stepIsValid(form: HTMLFormElement) {
    const fields = form.querySelectorAll<HTMLInputElement>(`[data-step="${step}"] :is(input, select)`);
    const invalid = [...fields].find((el) => !el.checkValidity());
    invalid?.reportValidity();
    return !invalid;
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    if (!stepIsValid(e.currentTarget)) return;
    const form = new FormData(e.currentTarget);
    const types = form.getAll("types").map(String);
    if (step === 2 && business && !types.length) return setError(t("signup.pickType"));
    if (step < LAST) return setStep(step + 1);

    setBusy(true);
    const fail = (message: string, backTo?: number) => {
      setError(message);
      setBusy(false);
      if (backTo !== undefined) setStep(backTo);
    };

    // where they are, before creating anything: a user's first pickup address, or everyone else's work area
    const address = role === "generator" ? await addressFrom(form) : null;
    const place = address ?? (await placeFrom(form));
    if (typeof place === "string") return fail(t(place), 2);

    // 1. the login itself (an email that already has an account is refused)
    const { data, error } = await supabase.auth.signUp({ email: String(form.get("email")), password: String(form.get("password")) });
    if (error?.code === "user_already_exists" || (data.user && !data.user.identities?.length)) return fail(t("signup.exists"));
    if (error || !data.user) return fail(error?.message ?? t("signup.failed"));

    // 2. the profile with the chosen role, placed at that address or area
    const { pincode, area, city, state, lat, lng } = place;
    const profile = await supabase.from("profiles").insert({
      id: data.user.id, role, pincode, area, city, state, lat, lng,
      ...(role === "generator"
        ? detailsFrom(form)
        : { name: String(form.get("name")), phone: String(form.get("phone")) || null }),
      ...(business && { accepted_types: types, capacity_kg: Number(form.get("capacity")) }),
    });
    if (profile.error) return fail(profile.error.message);

    // 3. a user's first saved address
    if (address && typeof address !== "string") {
      const saved = await supabase.from("addresses").insert(address);
      if (saved.error) return fail(saved.error.message);
    }
    router.replace(homeFor(role));
    setBusy(false); // this page stays alive in the background
  }

  return (
    <AuthShell title={t("signup.title")} eyebrow={`${t("signup.step", { n: step + 1 })} · ${t(STEPS[step])}`} progress={(step + 1) / STEPS.length}>
      <form onSubmit={submit} noValidate className="flex flex-1 flex-col">
        {/* 1. account type: one list, one choice */}
        <div data-step={0} hidden={step !== 0}>
          <div role="group" aria-label={t("signup.type")} className="divide-y divide-stone-200 overflow-hidden rounded-lg border border-stone-200 bg-white">
            {ROLES.map(({ role: r, Icon, hint }) => (
              <button key={r} type="button" onClick={() => setRole(r)} aria-pressed={role === r}
                className="group flex w-full items-center gap-3 px-3.5 py-3 text-left transition-colors hover:bg-stone-50 aria-pressed:bg-brand-50">
                <Icon size={18} strokeWidth={1.8} className="shrink-0 text-stone-400 group-aria-pressed:text-brand-800" />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-brand-950">{t(`role.${r}`)}</span>
                  <span className="block truncate text-xs text-stone-500">{t(hint)}</span>
                </span>
                <span className="grid h-4 w-4 shrink-0 place-items-center rounded-full border border-stone-300 group-aria-pressed:border-brand-700">
                  <span className="hidden h-2 w-2 rounded-full bg-brand-700 group-aria-pressed:block" />
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* 2. who you are */}
        <div data-step={1} hidden={step !== 1}>
          {role === "generator" ? (
            <PersonalFields />
          ) : (
            <div className="grid grid-cols-2 gap-2.5">
              <Field label={t("f.name")}>
                <input name="name" required className="field-input" autoComplete="organization" />
              </Field>
              <Field label={t("f.phone")}>
                <input name="phone" type="tel" pattern="[0-9 +\-]{10,15}" title={t("f.phoneTitle")} className="field-input" autoComplete="tel" />
              </Field>
            </div>
          )}
        </div>

        {/* 3. where you are */}
        <div data-step={2} hidden={step !== 2} className="space-y-2.5">
          <PlaceFields withAddress={role === "generator"} />
          {business && (
            <div className="grid grid-cols-[1fr_auto] items-end gap-2.5">
              <fieldset>
                <legend className="text-xs font-medium text-stone-500">{t("signup.accepts")}</legend>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {PLASTICS.map((p) => (
                    <label key={p} className="flex h-9 cursor-pointer items-center rounded-md border border-stone-300 bg-white px-3 text-xs font-semibold transition-colors has-checked:border-brand-700 has-checked:bg-brand-50 has-checked:text-brand-950 has-focus-visible:ring-2 has-focus-visible:ring-brand-600">
                      <input type="checkbox" name="types" value={p} className="sr-only" /> {p}
                    </label>
                  ))}
                </div>
              </fieldset>
              <Field label={t("kg")} className="w-24">
                <input name="capacity" type="number" min="1" step="1" required inputMode="numeric" aria-label={t("signup.capacity")} title={t("signup.capacity")} className="field-input" />
              </Field>
            </div>
          )}
        </div>

        {/* 4. how you log in */}
        <div data-step={3} hidden={step !== 3} className="space-y-2.5">
          <Field label={t("login.email")}>
            <input name="email" type="email" required className="field-input" autoComplete="email" />
          </Field>
          <Field label={<>{t("login.password")} <span className="font-normal">{t("signup.min")}</span></>} className="pr-11">
            <input name="password" type={showPassword ? "text" : "password"} required minLength={6} className="field-input" autoComplete="new-password" />
            <button type="button" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? t("login.hide") : t("login.show")}
              className="absolute top-1/2 right-1.5 grid h-9 w-9 -transtone-y-1/2 place-items-center rounded-md text-stone-500 hover:text-brand-950">
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </Field>
          {role === "generator" && <p className="text-xs leading-relaxed text-stone-500">{t("signup.privacy")}</p>}
        </div>

        {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}

        {/* actions: at the foot of the screen on phones, right under the fields on wide screens */}
        <div className="mt-auto pt-6">
          <div className={`grid gap-2 ${step > 0 ? "grid-cols-[auto_1fr]" : ""}`}>
            {step > 0 && (
              <button type="button" onClick={() => { setError(""); setStep(step - 1); }} disabled={busy} className="btn-secondary min-h-12 rounded-lg! px-5">{t("signup.back")}</button>
            )}
            <button disabled={busy} className="btn-primary min-h-12 rounded-lg! text-base">
              {step < LAST ? t("signup.next") : busy ? t("signup.busy") : t("signup.button")}
            </button>
          </div>
          <p className="mt-3 text-center text-sm text-stone-500">
            {t("signup.have")} <Link href="/" className="font-semibold text-brand-950 hover:text-brand-700">{t("login.title")}</Link>
          </p>
        </div>
      </form>
    </AuthShell>
  );
}
