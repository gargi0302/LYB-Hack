"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, Camera as CameraIcon, Check, Cookie, CupSoda, Droplet, GraduationCap, ImagePlus, MessageCircle, Milk,
  Minus, Package, PaintBucket, PenLine, Plus, ScanLine, ShoppingBag, SprayCan, X,
} from "lucide-react";
import Shell from "@/components/Shell";
import Camera from "@/components/Camera";
import Monster, { type Mood } from "@/components/Monster";
import BookPickup from "@/components/BookPickup";
import AskBasellion, { type Suggested } from "@/components/AskBasellion";
import { useBatches, useProfile } from "@/lib/useProfile";
import { fedThisMonth, greenness, growth, STAGES } from "@/lib/growth";
import { Hills, worldStyle } from "@/components/World";
import { addressText } from "@/lib/areas";
import { supabase, type Address, type Batch, type Plastic } from "@/lib/supabase";
import { classifyMany, type Guess } from "@/lib/classify";
import { cropCanvas, photoHash, shrink, smallJpeg } from "@/lib/image";
import { findItems } from "@/lib/objects";
import { findHeldItem, findObjects } from "@/lib/detect";
import { teach, withCorrections } from "@/lib/teach";
import {
  BAG_SIZES, CATALOGUE, PLASTICS, TIP_COUNT, band, bagRange, crossCheck, gramsFor, hintFor, listKg, tally,
  type BagSize, type CatalogueId,
} from "@/lib/plastics";
import { translate } from "@/lib/strings";
import { useLang, type Key } from "@/lib/i18n";

// Households throw everything into one bag, so the Feed asks about the bag, not about each piece:
// 1. one photo of the bag (proof, re-use check) and its size, 2. tap what's inside and count it,
// 3. compare the list with the bag, choose the address and send. The photo AI is the helper for
// anything the user can't name ("Scan it"), on one item or on everything tipped out on the floor.

const ICONS = { CupSoda, Droplet, Milk, ShoppingBag, Cookie, Package, SprayCan, PaintBucket };

// type: null = "not sure" (saved, checked at pickup), "UNCLEAR" = not recyclable here (left out)
type Item = {
  key: string; source: "list" | "own" | "scan" | "chat"; name: string; type: Plastic | null; count: number; grams: number;
  catalogue?: CatalogueId; crop?: string; guess?: Guess; sure?: boolean;
  teaching?: "sending" | "failed"; taught?: Plastic; // "Teach Basellion" for a scanned item
};
type BagPhoto = { src: string; hash?: string; reused?: boolean };
type Step = 1 | 2 | 3;

const wait = (ms: number) => new Promise((done) => setTimeout(done, ms));
let keys = 0; // unique keys for typed, chatted and scanned items
const newKey = (source: string) => `${source}#${keys++}`;
const pct = (n: number) => `${Math.round(n * 100)}%`;

// Basellion eats (or spits out) a picture of the item. Items from the chat have no photo, so they get
// a small tile with their plastic code instead: dark green for recyclable, pale with a cross if not.
function tile(type: Plastic) {
  const bad = type === "UNCLEAR";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 56 56"><rect width="56" height="56" rx="12" fill="${bad ? "#dae1c6" : "#31572c"}"/>`
    + `<text x="28" y="35" font-family="Arial,sans-serif" font-size="${bad ? 26 : 15}" font-weight="700" text-anchor="middle" fill="${bad ? "#31572c" : "#ecf39e"}">${bad ? "✕" : type}</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}
const kgText = (n: number) => String(Math.round(n * 100) / 100);

export default function FeedBasellion() {
  const profile = useProfile("generator");
  const router = useRouter();
  const { t } = useLang();
  const [step, setStep] = useState<Step>(1);
  const [bag, setBag] = useState<BagPhoto | null>(null);
  const [size, setSize] = useState<BagSize | null>(null);
  const [full, setFull] = useState<boolean | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [other, setOther] = useState("");
  const [scanning, setScanning] = useState(0); // photos still being read
  const [camera, setCamera] = useState<"bag" | "scan" | null>(null);
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [addressId, setAddressId] = useState("");
  const [eating, setEating] = useState(false);
  const [batch, setBatch] = useState<Batch | null>(null);
  // a short eat or spit when chat items are added
  const [snack, setSnack] = useState<{ mood: Mood; item: string } | null>(null);
  // how big and happy Basellion is now, and a little more once it has eaten this listing (lib/growth.ts)
  const [earlier, , , loadedAt] = useBatches(profile);
  const month = fedThisMonth(earlier, loadedAt);
  const before = growth(month.kg, month.meals);
  const after = batch ? growth(month.kg + Number(batch.declared_kg), month.meals + 1) : before;

  useEffect(() => {
    if (!profile) return;
    supabase.from("addresses").select("*").order("created_at").then(({ data }) => {
      setAddresses(data ?? []);
      setAddressId(data?.[0]?.id ?? "");
    });
  }, [profile]);

  const update = (key: string, change: Partial<Item>) => setItems((list) => list.map((it) => (it.key === key ? { ...it, ...change } : it)));
  const nameOf = (it: Item) => (it.catalogue ? t(`cat.${it.catalogue}` as Key) : it.name.trim() || t("items.scanned"));
  const typeName = (p: Plastic) => (p === "UNCLEAR" ? t("feed.notPlastic") : p);

  // 1. the bag photo: kept on the phone, only its fingerprint is checked against earlier listings
  async function addBag(original: string) {
    const src = await shrink(original);
    const img = new Image();
    img.src = src;
    await img.decode();
    const hash = photoHash(img);
    setBag({ src, hash });
    const { data: reused } = await supabase.rpc("photo_used", { hash });
    setBag({ src, hash, reused: !!reused });
  }

  // 2. tap a catalogue item to add one; the - button takes one away
  function bump(id: CatalogueId, by: number) {
    const entry = CATALOGUE.find((c) => c.id === id)!;
    setItems((list) => {
      const found = list.find((it) => it.catalogue === id);
      if (!found) return by > 0 ? [...list, { key: id, source: "list", catalogue: id, name: "", type: entry.type, count: by, grams: entry.grams }] : list;
      return list.map((it) => (it === found ? { ...it, count: it.count + by } : it)).filter((it) => it.source !== "list" || it.count > 0);
    });
  }
  const countOf = (id: CatalogueId) => items.find((it) => it.catalogue === id)?.count ?? 0;

  // "Something else": the name suggests a type (lib/plastics.ts hintFor); no hint means "not sure"
  function addOther(e: React.FormEvent) {
    e.preventDefault();
    const name = other.trim();
    if (!name) return;
    const type = hintFor(name);
    setItems((list) => [...list, { key: newKey("own"), source: "own", name, type, count: 1, grams: gramsFor(type) }]);
    setOther("");
  }

  // Items suggested by "Ask Basellion" join the list with their count and grams
  function addFromChat(suggested: Suggested[]) {
    setItems((list) => [...list, ...suggested.map((s) => {
      const type: Plastic = s.plastic === "NOT_RECYCLABLE" ? "UNCLEAR" : s.plastic;
      return { key: newKey("chat"), source: "chat" as const, name: s.name, type, count: Math.max(1, s.count), grams: s.grams_each || gramsFor(type), sure: s.sure };
    })]);
    // Basellion eats what can be recycled, then spits out what can't
    const good = suggested.find((s) => s.plastic !== "NOT_RECYCLABLE");
    const bad = suggested.find((s) => s.plastic === "NOT_RECYCLABLE");
    const steps: { mood: Mood; item: string }[] = [];
    if (good) steps.push({ mood: "eating", item: tile(good.plastic as Plastic) });
    if (bad) steps.push({ mood: "spitting", item: tile("UNCLEAR") });
    steps.forEach((step, i) => setTimeout(() => setSnack(step), i * 1300));
    setTimeout(() => setSnack(null), steps.length * 1300);
  }

  // "Scan it": the photo AI reads one item, or every item of a tipped-out bag laid apart.
  // Photos are read one after another: several at once used to freeze slow phones.
  const queue = useRef<Promise<void>>(Promise.resolve());
  function scan(original: string) {
    setScanning((n) => n + 1);
    queue.current = queue.current.then(() => readScan(original)).catch(() => {}).then(() => setScanning((n) => n - 1));
  }
  async function readScan(original: string) {
    const src = await shrink(original);
    const img = new Image();
    img.src = src;
    await img.decode();
    // items laid apart on a plain floor are split by colour; else the detector skips people and furniture;
    // an item held up in a hand is matched against taught items; otherwise the whole photo is one item
    let boxes = findItems(img);
    if (!boxes.length) {
      const found = await findObjects(img);
      boxes = found.boxes;
      if (found.person && !boxes.length) boxes = await findHeldItem(img);
    }
    const parts = boxes.length ? boxes.map((box) => cropCanvas(img, box)) : [img];
    const guesses = await Promise.all((await classifyMany(parts)).map(withCorrections));
    const added = guesses.map((guess, i) => {
      const part = parts[i];
      // a fairly sure answer is filled in (the user can change it); an unsure one is "not sure"
      const type = band(guess.confidence) === "manual" ? null : guess.type;
      return {
        key: newKey("scan"), source: "scan" as const, name: guess.name ?? "", type, count: 1, guess,
        grams: gramsFor(type === "UNCLEAR" ? null : type), crop: part instanceof HTMLCanvasElement ? part.toDataURL("image/jpeg", 0.8) : src,
      };
    });
    setItems((list) => [...list, ...added]);
  }

  // the user changed a scanned item's type, or named it: save it so the AI learns (lib/memory.ts)
  async function teachItem(it: Item) {
    update(it.key, { teaching: "sending" });
    const error = await teach(it.guess!, it.type as Plastic, await smallJpeg(it.crop!), it.name.trim());
    update(it.key, error ? { teaching: "failed" } : { teaching: undefined, taught: it.type as Plastic });
  }

  // what's in the bag, and how it compares with the bag
  const kept = items.filter((it) => it.type !== "UNCLEAR" && it.count > 0);
  const kg = listKg(items);
  const { types, unsure } = tally(items);
  const main = types[0]?.type; // the listing's headline type: the plastic with the most pieces
  const range = size && full !== null ? bagRange(size, full) : null;
  const check = range && kg ? crossCheck(kg, range) : "ok";
  const address = addresses.find((a) => a.id === addressId);
  const leftOut = items.filter((it) => it.type === "UNCLEAR" && it.count > 0);
  const summary = kept.length
    ? [...types.map((x) => `${x.count} ${x.type}`), ...(unsure ? [t("sum.unsure", { n: unsure })] : []), t("sum.about", { kg })].join(" · ")
    : t("sum.empty");

  // what is still missing on this step, shown under the button
  let todo = "";
  if (step === 1 && !bag) todo = t("todo.bagPhoto");
  else if (step === 1 && !range) todo = t("todo.bagSize");
  else if (step === 2 && scanning) todo = t("items.scanning");
  else if (step === 2 && !main) todo = kept.length ? t("todo.plastic") : t("todo.items");
  else if (step === 3 && !address) todo = t("todo.address");
  const canGo = step === 1 ? !!bag && !!range : step === 2 ? !!main && !scanning : !!main && !!address && !eating;

  // save the listing while Basellion eats it (the animation takes about 1.5 s anyway)
  async function send() {
    if (!profile || !canGo || !address || !main || !range || !size) return;
    setEating(true);
    window.scrollTo({ top: 0, behavior: "smooth" }); // so the user sees Basellion eat it
    const scanned = kept.filter((it) => it.guess);
    const aiTypes = scanned.map((it) => it.guess!.type);
    const aiMain = aiTypes.sort((a, b) => aiTypes.filter((x) => x === b).length - aiTypes.filter((x) => x === a).length)[0] ?? null;
    const sizeName = `${translate("en", `bag.${size}` as Key)} bag, ${full ? "full" : "half full"}`; // the log stays in English
    const [{ data, error }] = await Promise.all([
      supabase.from("batches").insert({
        area: address.area,
        lat: Math.round(address.lat * 1000) / 1000, // ~100 m, the exact spot is in the address
        lng: Math.round(address.lng * 1000) / 1000,
        ai_type: aiMain,
        ai_confidence: scanned.length ? Math.round((scanned.reduce((sum, it) => sum + it.guess!.confidence, 0) / scanned.length) * 100) / 100 : null,
        final_type: main,
        user_confirmed: true, // the user listed every item
        // checked at pickup: anything "not sure", an unsure scan or chat guess, a list that doesn't fit the bag, a re-used photo
        verify_at_pickup: unsure > 0 || check !== "ok" || !!bag?.reused
          || kept.some((it) => (it.guess && band(it.guess.confidence) !== "auto") || (it.source === "chat" && !it.sure)),
        photo_hashes: bag?.hash ? [bag.hash] : [],
        declared_kg: kg,
        last_note: [sizeName, ...types.map((x) => `${x.count} ${x.type}`), ...(unsure ? [`${unsure} not sure`] : []),
          ...(check !== "ok" ? ["list and bag size don't match"] : []), ...(bag?.reused ? ["the bag photo was used before"] : [])].join(", "),
      }).select("*").single(),
      wait(1600),
    ]);
    if (error) {
      alert(error.message);
      setEating(false);
      return;
    }
    const rows = kept.map((it, i) => ({
      batch_id: data.id, position: i + 1, count: it.count, type: it.type ?? ("UNCLEAR" as const),
      name: it.catalogue ? translate("en", `cat.${it.catalogue}` as Key) : it.name.trim() || null,
      ai_type: it.guess?.type ?? null, ai_confidence: it.guess ? Math.round(it.guess.confidence * 100) / 100 : null,
    }));
    await supabase.from("batch_items").insert(rows);
    await supabase.from("batch_addresses").insert({
      batch_id: data.id, address: `${address.label}: ${addressText(address)}`, phone: profile.phone,
    });
    setBatch({ ...data, batch_items: rows });
    setEating(false);
  }

  // Booked: show it under "My waste", and clear this page, which Next keeps alive for the next time Feed is opened
  function finish() {
    router.push("/user/waste");
    setStep(1);
    setBag(null);
    setSize(null);
    setFull(null);
    setItems([]);
    setBatch(null);
  }

  // what Basellion does and says
  const lastScan = [...items].reverse().find((it) => it.source === "scan");
  let mood: Mood = "hungry";
  let message: string | undefined = t("m.bag");
  let eaten = bag?.src;
  if (batch) [mood, message] = ["happy", t("m.done")];
  else if (eating) [mood, message] = ["eating", undefined];
  else if (snack) [mood, message, eaten] = [snack.mood, snack.mood === "eating" ? t("m.eating") : t("m.spitting"), snack.item];
  else if (scanning) [mood, message] = ["thinking", t("items.scanning")];
  else if (step === 2 && lastScan?.type === "UNCLEAR") [mood, message, eaten] = ["spitting", t("m.allNot"), lastScan.crop];
  else if (step === 3 && check === "fewer") [mood, message] = ["thinking", t("m.fewer")];
  else if (step === 3 && check === "more") [mood, message] = ["thinking", t("m.more")];
  else if (step > 1 && main) [mood, message] = ["happy", t("m.ready", { what: types.map((x) => `${x.count} ${x.type}`).join(` ${t("and")} `) })];
  else if (step === 2) message = t("m.inside");
  else if (bag) [mood, message] = ["happy", t("m.happy")];

  const monster = (
    // phones: a smaller Basellion (60% of his size) so the step below stays on screen
    <section className="relative grid place-items-center overflow-hidden rounded-[1.75rem] border border-white/80 bg-brand-50 px-4 py-3 lg:py-5"
      style={worldStyle(greenness(month.kg, month.meals))}>
      <Hills green={greenness(month.kg, month.meals)} className="h-[34%]" />
      <div className="relative lg:hidden"><Monster mood={mood} message={message} item={eaten} size={Math.round(0.6 * (loadedAt ? after.size : STAGES[1].size))} /></div>
      <div className="relative hidden lg:block"><Monster mood={mood} message={message} item={eaten} size={loadedAt ? after.size : STAGES[1].size} /></div>
    </section>
  );
  // a new photo from the camera or the gallery: the bag photo on step 1, an item to scan on step 2
  const takePhoto = (mode: "bag" | "scan", src: string) => (mode === "bag" ? addBag(src) : scan(src));
  const photoButtons = (mode: "bag" | "scan", many = false) => (
    <div className="grid grid-cols-2 gap-2">
      <button onClick={() => setCamera(mode)} className="btn-primary px-3"><CameraIcon size={18} /> {t("feed.camera")}</button>
      <label className="btn-secondary cursor-pointer px-3">
        <ImagePlus size={18} /> {t("feed.device")}
        <input type="file" accept="image/*" multiple={many} className="sr-only"
          onChange={(e) => {
            Array.from(e.target.files ?? []).slice(0, many ? 5 : 1).forEach((f) => takePhoto(mode, URL.createObjectURL(f)));
            e.target.value = ""; // so the same file can be picked again
          }} />
      </label>
    </div>
  );
  const counter = (it: Item, label: string) => (
    <div className="flex items-center gap-1">
      <button onClick={() => (it.source === "list" ? bump(it.catalogue!, -1) : update(it.key, { count: Math.max(1, it.count - 1) }))}
        aria-label={t("items.less", { name: label })} className="grid h-10 w-10 place-items-center rounded-full border border-stone-300 bg-white text-brand-800 active:bg-brand-50">
        <Minus size={16} />
      </button>
      <span className="w-8 text-center font-semibold tabular-nums">{it.count}</span>
      <button onClick={() => (it.source === "list" ? bump(it.catalogue!, 1) : update(it.key, { count: it.count + 1 }))}
        aria-label={t("items.more", { name: label })} className="grid h-10 w-10 place-items-center rounded-full bg-brand-800 text-white active:bg-brand-700">
        <Plus size={16} />
      </button>
    </div>
  );
  const extras = items.filter((it) => it.source !== "list");

  return (
    <Shell profile={profile} title={t("home.feed")}>
      <div className="grid gap-4 lg:grid-cols-[340px_minmax(0,1fr)] lg:items-start lg:gap-6">
        <div className="space-y-3 lg:sticky lg:top-24">
          {monster}
          {batch && (
            <p role="status" className="text-center text-sm font-medium text-brand-800">
              {t("feed.grew", { from: before.happiness, to: after.happiness })}
            </p>
          )}
        </div>

        <div className="min-w-0 space-y-4">
          {!batch && (
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold tracking-[0.12em] text-brand-600 uppercase">{t("bag.stepOf", { n: step })}</p>
                <h2 className="heading text-xl">{t(`bag.step.${step}` as Key)}</h2>
              </div>
              <div aria-hidden className="flex gap-1.5">
                {[1, 2, 3].map((n) => <span key={n} className={`h-2 w-6 rounded-full ${n <= step ? "bg-brand-600" : "bg-stone-200"}`} />)}
              </div>
            </div>
          )}

          {/* ---------- 1. the bag ---------- */}
          {!batch && step === 1 && (
            <>
              <section className="card space-y-3">
                <div>
                  <h3 className="font-semibold text-brand-950">{t("bag.photo")}</h3>
                  <p className="text-sm text-stone-500">{t("bag.photoHelp")}</p>
                </div>
                {bag && (
                  <div className="relative w-fit">
                    {/* eslint-disable-next-line @next/next/no-img-element -- local photo preview */}
                    <img src={bag.src} alt={t("bag.photo")} className="block max-h-44 w-auto max-w-full rounded-xl ring-1 ring-stone-200" />
                    <button onClick={() => setBag(null)} aria-label={t("bag.change")}
                      className="absolute -top-2 -right-2 grid h-8 w-8 place-items-center rounded-full bg-brand-950 text-white ring-2 ring-white">
                      <X size={15} />
                    </button>
                  </div>
                )}
                {bag?.reused && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{t("feed.reused")}</p>}
                {!bag && photoButtons("bag")}
              </section>

              <section className="card space-y-4">
                <fieldset>
                  <legend className="font-semibold text-brand-950">{t("bag.size")}</legend>
                  <div className="mt-2 grid grid-cols-3 gap-2">
                    {BAG_SIZES.map((s) => (
                      <button key={s} type="button" onClick={() => setSize(s)} aria-pressed={size === s} className="option px-2.5 text-left">
                        <b className="block text-brand-950">{t(`bag.${s}` as Key)}</b>
                        <span className="block text-xs leading-snug text-stone-500">{t(`bag.${s}Hint` as Key)}</span>
                      </button>
                    ))}
                  </div>
                </fieldset>
                <fieldset>
                  <legend className="font-semibold text-brand-950">{t("bag.fullness")}</legend>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    {[false, true].map((f) => (
                      <button key={String(f)} type="button" onClick={() => setFull(f)} aria-pressed={full === f} className="option text-center font-semibold text-brand-950">
                        {t(f ? "bag.full" : "bag.half")}
                      </button>
                    ))}
                  </div>
                </fieldset>
                {range && <p className="text-sm text-stone-600">{t("bag.range", { min: kgText(range[0]), max: kgText(range[1]) })}</p>}
              </section>
            </>
          )}

          {/* ---------- 2. what's inside ---------- */}
          {!batch && step === 2 && (
            <>
              <section className="card">
                <p className="text-sm text-stone-500">{t("items.tap")}</p>
                <ul className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {CATALOGUE.map((c) => {
                    const Icon = ICONS[c.icon];
                    const n = countOf(c.id);
                    const label = t(`cat.${c.id}` as Key);
                    const it = items.find((x) => x.catalogue === c.id);
                    return (
                      <li key={c.id} className={`flex flex-col rounded-2xl border transition-colors ${n ? "border-brand-600 bg-brand-50 ring-1 ring-brand-600" : "border-stone-200 bg-white"}`}>
                        <button onClick={() => bump(c.id, 1)} aria-label={t("items.more", { name: label })} className="flex flex-1 flex-col items-start gap-1.5 p-3 text-left">
                          <span className="flex w-full items-center justify-between">
                            <Icon size={22} className="text-brand-700" />
                            <span className="rounded-full bg-brand-100 px-2 py-0.5 text-[11px] font-bold text-brand-900">{c.type}</span>
                          </span>
                          <span className="text-sm leading-snug font-medium text-brand-950">{label}</span>
                        </button>
                        {it && <div className="flex justify-center border-t border-brand-200 px-2 py-1.5">{counter(it, label)}</div>}
                      </li>
                    );
                  })}
                </ul>

                <details className="mt-4 text-sm">
                  <summary className="cursor-pointer font-medium text-brand-800">{t("feed.howToTell")}</summary>
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-stone-600">
                    {[0, 1, 2, 3].map((i) => <li key={i}>{t(`tell.${i}` as Key)}</li>)}
                  </ul>
                </details>

                {/* something not in the catalogue */}
                <form onSubmit={addOther} className="mt-4">
                  <label className="text-sm font-semibold text-brand-950" htmlFor="other-item">{t("items.other")}</label>
                  <div className="mt-1.5 flex gap-2">
                    <span className="relative min-w-0 flex-1">
                      <PenLine size={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-stone-400" />
                      <input id="other-item" value={other} onChange={(e) => setOther(e.target.value)} placeholder={t("items.otherPh")}
                        className="input mt-0 pl-9 text-base" />
                    </span>
                    <button className="btn-secondary px-4" disabled={!other.trim()}><Plus size={16} /> {t("items.add")}</button>
                  </div>
                </form>

                {extras.length > 0 && (
                  <>
                    <h3 className="mt-5 text-sm font-semibold text-brand-950">{t("items.list")}</h3>
                    <ul className="mt-1 divide-y divide-stone-200">
                      {extras.map((it) => {
                        const g = it.guess;
                        const label = nameOf(it);
                        return (
                          <li key={it.key} className="flex gap-3 py-3">
                            {it.crop ? (
                              // eslint-disable-next-line @next/next/no-img-element -- local photo crop
                              <img src={it.crop} alt={label} className="h-14 w-14 shrink-0 rounded-lg object-cover ring-1 ring-stone-200" />
                            ) : (
                              <span className="grid h-14 w-14 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-700">
                                {it.source === "chat" ? <MessageCircle size={20} /> : <PenLine size={20} />}
                              </span>
                            )}
                            <div className="min-w-0 flex-1 space-y-2">
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                  {it.source === "scan" ? (
                                    <input value={it.name} onChange={(e) => update(it.key, { name: e.target.value })} aria-label={t("feed.whatPh")}
                                      placeholder={t("feed.whatPh")} className="input mt-0 py-1.5 text-base" />
                                  ) : (
                                    <p className="font-medium break-words text-brand-950">{label}</p>
                                  )}
                                  <p className="mt-1 text-xs text-stone-500">
                                    {g && <>AI: <b>{typeName(g.type)}</b> · {g.learned ? t("teach.learned", { n: g.learned }) : pct(g.confidence)}
                                      {!g.learned && band(g.confidence) === "confirm" && ` · ${t("feed.check")}`}</>}
                                    {it.source === "chat" && <>{t("feed.fromChat")} {it.type ? typeName(it.type) : ""}{!it.sure && ` · ${t("feed.typical")}`}</>}
                                    {it.source === "own" && !it.type && t("items.unsureNote")}
                                  </p>
                                </div>
                                <button onClick={() => setItems((list) => list.filter((x) => x.key !== it.key))} aria-label={t("items.remove", { name: label })}
                                  className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-stone-500 hover:bg-brand-50 hover:text-brand-950">
                                  <X size={16} />
                                </button>
                              </div>
                              {it.type === "UNCLEAR" ? (
                                <p className="text-sm text-brand-800">{t("items.leftOut")}</p>
                              ) : (
                                <div className="flex flex-wrap items-center gap-2">
                                  {counter(it, label)}
                                  <select value={it.type ?? ""} onChange={(e) => update(it.key, { type: (e.target.value || null) as Plastic | null, grams: it.source === "chat" ? it.grams : gramsFor((e.target.value || null) as Plastic | null) })}
                                    aria-label={t("items.typeOf", { name: label })} className="input mt-0 w-auto min-w-0 flex-1 py-2 text-base">
                                    {PLASTICS.map((p) => <option key={p} value={p}>{p}: {t(`desc.${p}`).split(" · ")[1]}</option>)}
                                    <option value="">{t("items.notSure")}</option>
                                    <option value="UNCLEAR">{t("feed.leaveOut")}</option>
                                  </select>
                                </div>
                              )}
                              {g && it.type && (it.type !== g.type || (it.name.trim() && it.name.trim() !== g.name)) && (
                                <div className="rounded-lg bg-brand-50 p-3 text-sm text-brand-900">
                                  {it.taught === it.type && !it.teaching ? (
                                    <p role="status" className="font-medium">{t("teach.done", { type: typeName(it.type) })}</p>
                                  ) : (
                                    <>
                                      <p>{it.type !== g.type ? t("teach.ask", { ai: typeName(g.type), type: typeName(it.type) })
                                        : t("teach.askName", { name: it.name.trim(), type: typeName(it.type) })}</p>
                                      <button onClick={() => teachItem(it)} disabled={it.teaching === "sending"} className="btn-secondary mt-2 py-1.5 text-sm">
                                        <GraduationCap size={16} /> {t("teach.button")}
                                      </button>
                                      <p className="mt-1 text-xs text-stone-500">{t("teach.note")}</p>
                                      {it.teaching === "failed" && <p role="alert" className="mt-1 text-red-700">{t("teach.failed")}</p>}
                                    </>
                                  )}
                                </div>
                              )}
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  </>
                )}
              </section>

              {/* the photo AI as the helper for anything the user can't name */}
              <section className="card space-y-3">
                <div className="flex gap-3">
                  <ScanLine size={22} className="mt-0.5 shrink-0 text-brand-700" />
                  <div>
                    <h3 className="font-semibold text-brand-950">{t("items.scanTitle")}</h3>
                    <p className="text-sm text-stone-500">{t("items.scanHelp")}</p>
                  </div>
                </div>
                {photoButtons("scan", true)}
                {scanning > 0 && <p role="status" className="text-sm font-medium text-brand-800">{t("items.scanning")}</p>}
              </section>

              <AskBasellion onAdd={addFromChat} />
            </>
          )}

          {/* ---------- 3. check and send ---------- */}
          {!batch && step === 3 && range && size && (
            <>
              <section className="card space-y-3">
                <h3 className="font-semibold text-brand-950">{t("check.title")}</h3>
                <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
                  <dt className="text-stone-500">{t("check.bag", { size: t(`bag.${size}` as Key), fullness: t(full ? "bag.full" : "bag.half") })}</dt>
                  <dd className="text-right font-medium tabular-nums">{t("check.bagKg", { min: kgText(range[0]), max: kgText(range[1]) })}</dd>
                  <dt className="text-stone-500">{t("check.list")}</dt>
                  <dd className="text-right font-medium tabular-nums">{t("sum.about", { kg })}</dd>
                </dl>
                {check === "ok" ? (
                  <p className="flex items-center gap-2 rounded-lg bg-brand-50 p-3 text-sm font-medium text-brand-900"><Check size={16} /> {t("check.ok")}</p>
                ) : (
                  <div className="space-y-2 rounded-lg bg-brand-50 p-3 text-sm text-brand-900">
                    <p className="font-medium">{t(check === "fewer" ? "check.fewer" : "check.more")}</p>
                    <p className="text-stone-600">{t("check.pickup")}</p>
                    <div className="flex flex-wrap gap-2 pt-1">
                      <button onClick={() => setStep(check === "fewer" ? 2 : 1)} className="btn-secondary min-h-10 px-4 text-sm">
                        {t(check === "fewer" ? "check.addMore" : "check.changeBag")}
                      </button>
                    </div>
                  </div>
                )}
                {leftOut.length > 0 && <p className="text-sm text-stone-500">{t("items.leftOut")}</p>}
                {bag?.reused && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{t("feed.reused")}</p>}
              </section>

              <section className="card">
                <fieldset>
                  <legend className="label">{t("signup.address")} <span className="font-normal text-stone-500">{t("feed.addressNote")}</span></legend>
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    {addresses.map((a) => (
                      <button key={a.id} type="button" onClick={() => setAddressId(a.id)} aria-pressed={a.id === addressId} className="option text-sm">
                        <b>{a.label}</b>
                        <span className="block text-stone-600">{addressText(a)}</span>
                      </button>
                    ))}
                  </div>
                  <Link href="/user/profile" className="mt-2 inline-block text-sm font-medium text-brand-700 hover:text-brand-950">
                    {addresses.length ? t("feed.editAddresses") : t("feed.addFirst")}
                  </Link>
                </fieldset>
              </section>

              {types.length > 0 && (
                <ul className="space-y-1 rounded-xl bg-brand-50 px-4 py-3 text-sm text-brand-900">
                  {types.map((x) => x.type).flatMap((p) => Array.from({ length: TIP_COUNT }, (_, i) => (
                    <li key={p + i} className="flex items-start gap-2">
                      <Check size={16} className="mt-0.5 shrink-0" /> {types.length > 1 && <b>{p}:</b>} {t(`tip.${p}.${i}` as Key)}
                    </li>
                  )))}
                </ul>
              )}
            </>
          )}

          {/* the step's buttons, always in reach of the thumb: above the tab bar on phones */}
          {!batch && (
            <div className="sticky bottom-[calc(6rem+env(safe-area-inset-bottom))] z-20 rounded-2xl border border-stone-200 bg-paper/95 p-3 shadow-[0_6px_24px_rgba(49,87,44,0.14)] backdrop-blur md:bottom-4">
              <p aria-live="polite" className="mb-2 truncate text-center text-sm font-medium text-brand-900 tabular-nums">{step > 1 ? summary : todo || t("bag.range", { min: kgText(range![0]), max: kgText(range![1]) })}</p>
              <div className={`grid gap-2 ${step > 1 ? "grid-cols-[auto_1fr]" : ""}`}>
                {step > 1 && (
                  <button onClick={() => setStep((step - 1) as Step)} disabled={eating} className="btn-secondary min-h-12 px-4" aria-label={t("signup.back")}>
                    <ArrowLeft size={18} /><span className="sr-only sm:not-sr-only">{t("signup.back")}</span>
                  </button>
                )}
                <button onClick={() => (step < 3 ? setStep((step + 1) as Step) : send())} disabled={!canGo} className="btn-primary min-h-12 text-base">
                  {step < 3 ? t("bag.next") : eating ? t("feed.eating") : t("feed.send")}
                </button>
              </div>
              {todo && step > 1 && <p className="mt-2 text-center text-xs text-stone-500">{todo}</p>}
            </div>
          )}

          {batch && (
            <section className="card">
              <h2 className="heading text-base">{t("feed.step4")}</h2>
              <p className="mt-1 text-sm text-stone-500">{summary} · {t("feed.from", { label: address?.label ?? "" })}</p>
              <BookPickup batch={batch} onBooked={finish} />
            </section>
          )}
        </div>
      </div>

      {camera && (
        <Camera taken={0} max={1} onClose={() => setCamera(null)} onPhoto={(src) => takePhoto(camera, src)} />
      )}
    </Shell>
  );
}
