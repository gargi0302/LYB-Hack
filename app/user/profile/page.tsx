"use client";
import { useCallback, useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import Shell from "@/components/Shell";
import { PersonalFields, PlaceFields } from "@/components/ProfileFields";
import { useProfile } from "@/lib/useProfile";
import { addressFrom, addressText, detailsFrom } from "@/lib/areas";
import { supabase, type Address, type Profile } from "@/lib/supabase";
import { useLang } from "@/lib/i18n";

export default function ProfilePage() {
  const loaded = useProfile("generator");
  const { t } = useLang();
  const [edited, setEdited] = useState<Profile | null>(null); // shows the new name right after saving
  const profile = edited ?? loaded;
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [adding, setAdding] = useState(false);
  const [saved, setSaved] = useState(false);
  const [addError, setAddError] = useState("");
  const [adding2, setAdding2] = useState(false); // saving a new address (looking up its map point)

  const loadAddresses = useCallback(() => {
    supabase.from("addresses").select("*").order("created_at").then(({ data }) => setAddresses(data ?? []));
  }, []);
  useEffect(() => {
    if (loaded) loadAddresses();
  }, [loaded, loadAddresses]);

  async function saveDetails(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const details = detailsFrom(new FormData(e.currentTarget));
    const { error } = await supabase.from("profiles").update(details).eq("id", profile!.id);
    if (error) return alert(error.message);
    setEdited({ ...profile!, ...details });
    setSaved(true);
  }

  async function addAddress(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setAddError("");
    setAdding2(true);
    const address = await addressFrom(new FormData(e.currentTarget));
    if (typeof address === "string") {
      setAdding2(false);
      return setAddError(t(address));
    }
    const { error } = await supabase.from("addresses").insert(address);
    setAdding2(false);
    if (error) return setAddError(error.message);
    setAdding(false);
    loadAddresses();
  }

  async function removeAddress(id: string) {
    await supabase.from("addresses").delete().eq("id", id);
    loadAddresses();
  }

  return (
    <Shell profile={profile} title={t("nav.profile")}>
      <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
        <form onSubmit={saveDetails} onChange={() => setSaved(false)} className="card space-y-4">
          <h2 className="heading">{t("prof.details")}</h2>
          {profile && <PersonalFields profile={profile} />}
          <p className="text-xs text-stone-500">{t("prof.privacy")}</p>
          <div className="flex items-center gap-3">
            <button className="btn-primary">{t("prof.save")}</button>
            {saved && <span role="status" className="text-sm font-medium text-brand-700">{t("prof.saved")}</span>}
          </div>
        </form>

        <section className="card">
          <h2 className="heading">{t("prof.addresses")}</h2>
          <ul className="mt-2 divide-y divide-stone-200">
            {addresses.map((a) => (
              <li key={a.id} className="flex items-center gap-3 py-3">
                <span className="min-w-0 flex-1 text-sm">
                  <b className="font-semibold text-brand-950">{a.label}</b>
                  <span className="block text-stone-600">{addressText(a)}</span>
                </span>
                <button onClick={() => removeAddress(a.id)} disabled={addresses.length === 1} aria-label={t("prof.delete", { label: a.label })}
                  title={addresses.length === 1 ? t("prof.keepOne") : t("prof.delete", { label: a.label })}
                  className="grid h-9 w-9 place-items-center rounded-full text-stone-500 transition-colors hover:bg-red-50 hover:text-red-700 disabled:opacity-30">
                  <Trash2 size={16} />
                </button>
              </li>
            ))}
          </ul>
          {adding ? (
            <form onSubmit={addAddress} className="mt-2 space-y-4 border-t border-stone-200 pt-4">
              <PlaceFields withAddress />
              {addError && <p role="alert" className="text-sm text-red-700">{addError}</p>}
              <div className="flex gap-2">
                <button disabled={adding2} className="btn-primary">{t("prof.saveAddress")}</button>
                <button type="button" onClick={() => setAdding(false)} className="btn-secondary">{t("prof.cancel")}</button>
              </div>
            </form>
          ) : (
            <button onClick={() => setAdding(true)} className="btn-secondary mt-2"><Plus size={16} /> {t("prof.add")}</button>
          )}
        </section>
      </div>
    </Shell>
  );
}
