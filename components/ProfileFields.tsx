"use client";
import { useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { lookupPin, type PinInfo } from "@/lib/pincode";
import type { Profile } from "@/lib/supabase";
import { useLang, type Key } from "@/lib/i18n";

// saved in English, shown in the chosen language
const GENDERS = ["Female", "Male", "Other", "Prefer not to say"];

// a compact field: the label sits inside the box, above the value (same look as the login form)
export function Field({ label, className = "", children }: { label: React.ReactNode; className?: string; children: React.ReactNode }) {
  return (
    <label className={`field ${className}`}>
      <span className="field-label truncate">{label}</span>
      {children}
    </label>
  );
}

// a dropdown in the same box, with one chevron that looks the same on iPhone, Android and desktop.
// The empty "Select" choice is grey, like a placeholder.
export function FieldSelect({ label, className = "", children, ...props }: { label: React.ReactNode; className?: string } & React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <Field label={label} className={`pr-9 ${className}`}>
      <select {...props} className="field-input cursor-pointer appearance-none [-webkit-appearance:none] has-[option[value='']:checked]:text-stone-400">{children}</select>
      <ChevronDown aria-hidden size={16} className="pointer-events-none absolute right-3 bottom-3 text-stone-400" />
    </Field>
  );
}

// Name, phone, age, gender, two per row. Used by sign-up and the profile page; values are read with detailsFrom().
export function PersonalFields({ profile }: { profile?: Profile | null }) {
  const { t } = useLang();
  return (
    <div className="grid grid-cols-2 gap-2.5">
      <Field label={t("f.name")}>
        <input name="name" required defaultValue={profile?.name} className="field-input" autoComplete="name" />
      </Field>
      <Field label={t("f.phone")}>
        <input name="phone" type="tel" required pattern="[0-9 +\-]{10,15}" title={t("f.phoneTitle")} defaultValue={profile?.phone ?? ""} className="field-input" autoComplete="tel" />
      </Field>
      <Field label={t("f.age")}>
        <input name="age" type="number" inputMode="numeric" min="10" max="120" defaultValue={profile?.age ?? ""} className="field-input" />
      </Field>
      <FieldSelect label={t("f.gender")} name="gender" defaultValue={profile?.gender ?? ""}>
        <option value="">{t("f.select")}</option>
        {GENDERS.map((g) => <option key={g} value={g}>{t(`g.${g}` as Key)}</option>)}
      </FieldSelect>
    </div>
  );
}

// PIN code first: six digits fill in the areas to choose from, the city and the state (lib/pincode.ts).
// withAddress adds the street line and a label, for pickup addresses. Values are read with placeFrom()/addressFrom().
export function PlaceFields({ withAddress = false }: { withAddress?: boolean }) {
  const { t } = useLang();
  const [pin, setPin] = useState("");
  const [info, setInfo] = useState<PinInfo | null>(null);
  const [status, setStatus] = useState<"" | "looking" | "notFound" | "failed">("");
  const latest = useRef(""); // ignore answers for a PIN the user has since changed

  async function changePin(value: string) {
    setPin(value);
    latest.current = value;
    setInfo(null);
    if (!/^\d{6}$/.test(value)) return setStatus("");
    setStatus("looking");
    try {
      const found = await lookupPin(value);
      if (latest.current !== value) return;
      setInfo(found);
      setStatus(found ? "" : "notFound");
    } catch {
      if (latest.current === value) setStatus("failed");
    }
  }

  const auto = "border-stone-200 bg-stone-100/70"; // filled in from the PIN code, not typed
  return (
    <div className="grid grid-cols-2 gap-2.5">
      {withAddress && (
        <Field label={t("f.address")} className="col-span-2">
          <input name="line" required placeholder={t("f.addressPh")} className="field-input" autoComplete="address-line1" />
        </Field>
      )}
      <Field label={t("f.pincode")}>
        <input name="pincode" required inputMode="numeric" pattern="[0-9]{6}" maxLength={6} value={pin}
          onChange={(e) => changePin(e.target.value.replace(/\D/g, ""))} className="field-input tracking-wider" autoComplete="postal-code" />
      </Field>
      <FieldSelect label={t("f.area")} name="area" required disabled={!info} className={info ? "" : auto}>
        {info
          ? info.areas.map((a) => <option key={a}>{a}</option>)
          : <option value="">{status === "looking" ? t("pin.looking") : "—"}</option>}
      </FieldSelect>
      <Field label={t("f.city")} className={auto}>
        <input name="city" readOnly tabIndex={-1} value={info?.city ?? ""} className="field-input text-stone-600" />
      </Field>
      <Field label={t("f.state")} className={auto}>
        <input name="state" readOnly tabIndex={-1} value={info?.state ?? ""} className="field-input text-stone-600" />
      </Field>
      {(status === "notFound" || status === "failed") && (
        <p role="alert" className="col-span-2 text-sm text-red-700">{t(status === "notFound" ? "pin.notFound" : "pin.failed")}</p>
      )}
      {withAddress && (
        <Field label={t("f.label")} className="col-span-2">
          <input name="label" required placeholder={t("f.labelPh")} defaultValue={t("f.labelDefault")} className="field-input" />
        </Field>
      )}
    </div>
  );
}
