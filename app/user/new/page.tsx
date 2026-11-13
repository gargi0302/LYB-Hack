"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Camera as CameraIcon, Check, GraduationCap, ImagePlus, MessageCircle, X } from "lucide-react";
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
import { findItems, type Box } from "@/lib/objects";
import { findHeldItem, findObjects } from "@/lib/detect";
import { teach, withCorrections } from "@/lib/teach";
import { band, hintFor, PLASTICS, TIP_COUNT, TYPICAL_GRAMS } from "@/lib/plastics";
import { useLang, type Key } from "@/lib/i18n";

const MAX_PHOTOS = 3;
type Photo = { src: string; boxes: Box[] | null; hash?: string; reused?: boolean; inHand?: boolean }; // boxes: null while looking, [] = one item
// An item comes from a photo (guess = our image model) or from the chat (suggested by the language model).
type Item = {
  key: string; src: string; crop: string; name: string; type: Plastic | ""; count: number; naming?: boolean;
  guess?: Guess; suggested?: Plastic; sure?: boolean; grams?: number;
  teaching?: "sending" | "failed"; taught?: Plastic; // "Teach Basellion" for this item
};
const wait = (ms: number) => new Promise((done) => setTimeout(done, ms));
const pct = (n: number) => `${Math.round(n * 100)}%`;
const unsure = (it: Item) => !!it.guess && band(it.guess.confidence) === "manual";
const aiType = (it: Item) => it.guess?.type ?? it.suggested; // what the AI said, from either model
const fromChat = (it: Item) => it.src === "chat";

// Basellion eats (or spits out) a picture of the item. Items from the chat have no photo, so they get
// a small tile with their plastic code instead: dark green for recyclable, pale with a cross if not.
function tile(type: Plastic) {
  const bad = type === "UNCLEAR";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 56 56"><rect width="56" height="56" rx="12" fill="${bad ? "#dae1c6" : "#31572c"}"/>`
    + `<text x="28" y="35" font-family="Arial,sans-serif" font-size="${bad ? 26 : 15}" font-weight="700" text-anchor="middle" fill="${bad ? "#31572c" : "#ecf39e"}">${bad ? "✕" : type}</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

export default function FeedBasellion() {
  const profile = useProfile("generator");
  const router = useRouter();
  const { t } = useLang();
  const typeName = (p: Plastic) => (p === "UNCLEAR" ? t("feed.notPlastic") : p);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [camera, setCamera] = useState(false);
  const [kg, setKg] = useState("");
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [addressId, setAddressId] = useState("");
  const [eating, setEating] = useState(false);
  const [batch, setBatch] = useState<Batch | null>(null);
  // a short eat or spit when chat items are added (photo items are eaten when the listing is sent)
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

  // Photos are read one after another: several at once (quick camera taps) used to freeze the page
  const queue = useRef<Promise<void>>(Promise.resolve());
  function addPhoto(original: string) {
    queue.current = queue.current.then(() => readPhoto(original)).catch(() => {});
  }

  // Read a photo: find the items in it (ignoring people, tables, walls...), then let our model
  // look at each item on its own. All of this runs on the phone.
  async function readPhoto(original: string) {
    const src = await shrink(original);
    setPhotos((list) => (list.length >= MAX_PHOTOS ? list : [...list, { src, boxes: null }]));
    const img = new Image();
    img.src = src;
    await img.decode();
    // 1. items laid out on a plain surface are found by comparing with the background,
    // 2. on a busy background the detector finds objects and drops people, tables, walls...,
    // 3. otherwise the whole photo is one item
    let boxes = findItems(img);
    let inHand = false;
    if (!boxes.length) {
      const found = await findObjects(img);
      boxes = found.boxes;
      inHand = found.person && !boxes.length; // only a person/hand found: the item is probably being held
      if (inHand) boxes = await findHeldItem(img); // then look for the part of the photo that is plastic
    }
    const hash = photoHash(img);
    const { data: reused } = await supabase.rpc("photo_used", { hash });
    setPhotos((list) => list.map((p) => (p.src === src ? { ...p, boxes, hash, reused: !!reused, inHand } : p)));

    const parts = boxes.length ? boxes.map((box) => cropCanvas(img, box)) : [img];
    setItems((list) => [...list, ...parts.map((part, i) => ({
      key: `${src}#${i}`, src, name: "", type: "" as const, count: 1,
      crop: part instanceof HTMLCanvasElement ? part.toDataURL("image/jpeg", 0.8) : src,
    }))]);
    const guesses = await classifyMany(parts);
    for (const [i, found] of guesses.entries()) {
      const guess = await withCorrections(found); // a photo like one people corrected gets their answer
      // a fairly sure answer is filled in (the user can change it); an unsure one the user names and picks
      update(`${src}#${i}`, { guess, name: guess.name ?? "", type: band(guess.confidence) === "manual" ? "" : guess.type });
    }
  }

  // Items suggested by "Ask Basellion" join the list like photo items, with their count
  function addFromChat(suggested: Suggested[]) {
    const stamp = Date.now();
    setItems((list) => [...list, ...suggested.map((s, i) => {
      const plastic: Plastic = s.plastic === "NOT_RECYCLABLE" ? "UNCLEAR" : s.plastic;
      return { key: `chat#${stamp}#${i}`, src: "chat", crop: tile(plastic), name: s.name, count: Math.max(1, s.count), type: plastic, suggested: plastic, sure: s.sure, grams: s.grams_each };
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

  // the user picked a different type than the AI: save it so the AI learns (lib/memory.ts)
  async function teachItem(it: Item) {
    update(it.key, { teaching: "sending" });
    const error = await teach(it.guess!, it.type as Plastic, await smallJpeg(it.crop), it.name.trim());
    update(it.key, error ? { teaching: "failed" } : { teaching: undefined, taught: it.type as Plastic });
  }

  function removePhoto(src: string) {
    setPhotos((list) => list.filter((p) => p.src !== src));
    setItems((list) => list.filter((it) => it.src !== src));
  }

  // items in photo order, numbered 1, 2, 3 ... (left to right inside each photo)
  const ordered = [...photos.flatMap((p) => items.filter((it) => it.src === p.src)), ...items.filter(fromChat)];
  const number = (key: string) => ordered.findIndex((it) => it.key === key) + 1;
  const checking = photos.some((p) => !p.boxes) || items.some((it) => !fromChat(it) && !it.guess);
  const recyclable = ordered.filter((it) => it.type && it.type !== "UNCLEAR");
  const missing = ordered.filter((it) => (it.guess || fromChat(it)) && (!it.type || (unsure(it) && !it.name.trim())));
  const types = [...new Set(recyclable.map((it) => it.type as Plastic))];
  const howMany = (t: Plastic) => recyclable.filter((it) => it.type === t).reduce((sum, it) => sum + it.count, 0);
  const main = [...types].sort((a, b) => howMany(b) - howMany(a))[0]; // the listing's headline type
  const estimatedGrams = recyclable.reduce((sum, it) => sum + (it.grams ?? 0) * it.count, 0); // from the chat only
  const allNotPlastic = !checking && ordered.length > 0 && ordered.every((it) => it.type === "UNCLEAR");
  const lastItem = items.at(-1); // the newest item (chat items are listed after photos, but may be older)
  const reused = photos.some((p) => p.reused);
  const ready = !checking && recyclable.length > 0 && missing.length === 0;
  const address = addresses.find((a) => a.id === addressId);
  // the weight is optional: left blank, it is Basellion's estimate (the chat's grams, or typical grams per item)
  const guessGrams = estimatedGrams || recyclable.reduce((sum, it) => sum + (TYPICAL_GRAMS[it.type] ?? 0) * it.count, 0);
  const guessKg = Math.max(0.1, Math.round(guessGrams / 100) / 10);
  const weight = Number(kg) > 0 ? Number(kg) : guessKg;
  const canSend = ready && !!address && !eating;

  // what is still needed before sending, shown under the button
  let todo = "";
  if (!ordered.length) todo = t("todo.start");
  else if (checking) todo = t("todo.checking");
  else if (!recyclable.length && !missing.length) todo = t("todo.plastic");
  else if (missing.length) {
    const it = missing[0];
    todo = t(unsure(it) && !it.name.trim() ? "todo.name" : "todo.category", { n: number(it.key) });
  } else if (!address) todo = t("todo.address");

  // save the listing while Basellion eats it (the animation takes about 1.5 s anyway)
  async function send() {
    if (!profile || !canSend || !address) return;
    setEating(true);
    window.scrollTo({ top: 0, behavior: "smooth" }); // so the user sees Basellion eat it
    const aiTypes = recyclable.map(aiType);
    const aiMain = aiTypes.sort((a, b) => aiTypes.filter((t) => t === b).length - aiTypes.filter((t) => t === a).length)[0];
    const scored = recyclable.filter((it) => it.guess); // the image model gives a confidence, the chat doesn't
    const [{ data, error }] = await Promise.all([
      supabase.from("batches").insert({
        area: address.area,
        lat: Math.round(address.lat * 1000) / 1000, // ~100 m, the exact spot is in the address
        lng: Math.round(address.lng * 1000) / 1000,
        ai_type: aiMain,
        ai_confidence: scored.length ? Math.round((scored.reduce((sum, it) => sum + it.guess!.confidence, 0) / scored.length) * 100) / 100 : null,
        final_type: main,
        user_confirmed: recyclable.some((it) => it.type !== aiType(it) || (it.guess ? band(it.guess.confidence) !== "auto" : !it.sure)),
        verify_at_pickup: recyclable.some((it) => unsure(it) || (fromChat(it) && !it.sure)) || reused,
        photo_hashes: photos.map((p) => p.hash),
        declared_kg: weight,
        last_note: `${types.map((p) => `${howMany(p)} ${p}`).join(", ")}${reused ? ", a photo was used before" : ""}`, // the log stays in English
      }).select("*").single(),
      wait(1600),
    ]);
    if (error) {
      alert(error.message);
      setEating(false);
      return;
    }
    const rows = recyclable.map((it) => ({
      batch_id: data.id, position: number(it.key), name: it.name.trim() || null, count: it.count,
      ai_type: aiType(it), ai_confidence: it.guess ? Math.round(it.guess.confidence * 100) / 100 : null, type: it.type as Plastic,
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
    setPhotos([]);
    setItems([]);
    setKg("");
    setBatch(null);
  }

  // what Basellion does and says at each step
  let mood: Mood = "hungry";
  let message: string | undefined = t("m.happy");
  let item = recyclable.find((it) => it.crop)?.crop || photos[0]?.src;
  if (batch) [mood, message] = ["happy", t("m.done")];
  else if (eating) [mood, message] = ["eating", undefined];
  else if (snack) [mood, message, item] = [snack.mood, snack.mood === "eating" ? t("m.eating") : t("m.spitting"), snack.item];
  else if (checking) [mood, message] = ["thinking", undefined];
  else if (allNotPlastic) [mood, message, item] = ["spitting", t("m.allNot"), lastItem!.crop];
  else if (missing.length) [mood, message] = ["thinking", t("m.missing", { n: number(missing[0].key) })];
  else if (lastItem?.type === "UNCLEAR") [mood, message, item] = ["spitting", t("m.skip", { n: number(lastItem.key) }), lastItem.crop];
  else if (ready) [mood, message] = ["happy", t("m.ready", { what: types.map((p) => `${howMany(p)} ${p}`).join(` ${t("and")} `) })];

  const step = (n: number, title: string) => (
    <h2 className="heading flex items-baseline gap-2 text-base">
      <span className="text-brand-400 tabular-nums">{n}.</span> {title}
    </h2>
  );
  const badge = (n: number) => (
    <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-brand-800 text-xs font-bold text-white ring-2 ring-white">{n}</span>
  );
  const full = photos.length >= MAX_PHOTOS;

  return (
    <Shell profile={profile} title={t("home.feed")}>
      <div className="grid gap-4 lg:grid-cols-[360px_minmax(0,1fr)] lg:items-start lg:gap-6">
        <div className="space-y-3 lg:sticky lg:top-24">
          {/* the same world as the home card: pale for a new user, greener with this month's recycling */}
          <section className="relative grid place-items-center overflow-hidden rounded-[1.75rem] border border-white/80 bg-brand-50 px-4 py-5" style={worldStyle(greenness(month.kg, month.meals))}>
            <Hills green={greenness(month.kg, month.meals)} className="h-[34%]" />
            <div className="relative"><Monster mood={mood} message={message} item={item} size={loadedAt ? after.size : STAGES[1].size} /></div>
          </section>
          {batch && (
            <p role="status" className="text-center text-sm font-medium text-brand-800">
              {t("feed.grew", { from: before.happiness, to: after.happiness })}
            </p>
          )}
          {!batch && (
            <>
              <button onClick={send} disabled={!canSend} className="btn-primary min-h-12 w-full text-base">
                {eating ? t("feed.eating") : t("feed.send")}
              </button>
              {todo && <p className="text-center text-sm text-stone-500">{todo}</p>}
            </>
          )}
        </div>

        <div className="space-y-4">
          {!batch && (
            <section className="card">
              {step(1, t("feed.step1"))}
              <p className="mt-1 text-sm text-stone-500">{t("feed.step1Help", { max: MAX_PHOTOS })}</p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <button onClick={() => setCamera(true)} disabled={full} className="btn-primary">
                  <CameraIcon size={18} /> {t("feed.camera")}
                </button>
                <label className={`btn-secondary cursor-pointer ${full ? "pointer-events-none opacity-40" : ""}`}>
                  <ImagePlus size={18} /> {t("feed.device")}
                  <input type="file" accept="image/*" multiple className="sr-only" disabled={full}
                    onChange={(e) => {
                      Array.from(e.target.files ?? []).slice(0, MAX_PHOTOS - photos.length).forEach((f) => addPhoto(URL.createObjectURL(f)));
                      e.target.value = ""; // so the same file can be picked again
                    }} />
                </label>
              </div>
              {photos.some((p) => p.inHand) && (
                <p className="mt-3 rounded-lg bg-brand-50 p-3 text-sm text-brand-800">{t("feed.hand")}</p>
              )}
              {photos.length > 0 && (
                <ul className="mt-4 flex flex-wrap gap-3">
                  {photos.map((p) => (
                    <li key={p.src} className="relative w-fit">
                      {/* eslint-disable-next-line @next/next/no-img-element -- local photo preview */}
                      <img src={p.src} alt={t("feed.yourPhoto")} className="block max-h-56 w-auto max-w-full rounded-xl ring-1 ring-stone-200" />
                      {/* a numbered box around every item found */}
                      {p.boxes?.map((b, i) => (
                        <span key={i} className="absolute rounded-lg border-2 border-brand-400"
                          style={{ left: `${b.x * 100}%`, top: `${b.y * 100}%`, width: `${b.w * 100}%`, height: `${b.h * 100}%` }}>
                          <span className="absolute -top-3 -left-3">{badge(number(`${p.src}#${i}`))}</span>
                        </span>
                      ))}
                      {p.boxes?.length === 0 && <span className="absolute top-2 left-2">{badge(number(`${p.src}#0`))}</span>}
                      {!p.boxes && <span className="absolute inset-x-0 bottom-0 rounded-b-xl bg-black/50 py-1 text-center text-xs text-white">{t("feed.finding")}</span>}
                      <button onClick={() => removePhoto(p.src)} aria-label={t("feed.removePhoto")}
                        className="absolute -top-2 -right-2 grid h-7 w-7 place-items-center rounded-full bg-brand-950 text-white ring-2 ring-white">
                        <X size={14} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          {!batch && <AskBasellion onAdd={addFromChat} />}

          {ordered.length > 0 && !batch && (
            <section className="card">
              {step(2, t("feed.step2", { n: ordered.length }))}
              <ol className="mt-2 divide-y divide-stone-200">
                {ordered.map((it) => {
                  const n = number(it.key);
                  const g = it.guess;
                  const hint = it.name.trim() ? hintFor(it.name) : null;
                  const askName = unsure(it) || it.naming || fromChat(it); // unknown items always, the rest on request
                  return (
                    <li key={it.key} className="flex gap-3 py-3 last:pb-0">
                      {badge(n)}
                      {fromChat(it) ? (
                        <span className="grid h-14 w-14 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-700"><MessageCircle size={20} /></span>
                      ) : (
                        // eslint-disable-next-line @next/next/no-img-element -- local photo crop
                        <img src={it.crop} alt={t("feed.item", { n })} className="h-14 w-14 shrink-0 rounded-lg object-cover ring-1 ring-stone-200" />
                      )}
                      <div className="min-w-0 flex-1 space-y-2">
                        <p className="text-sm">
                          {fromChat(it) && (
                            <>{t("feed.fromChat")} <b>{it.suggested === "UNCLEAR" ? t("feed.notRecyclable") : it.suggested}</b>{!it.sure && ` · ${t("feed.typical")}`}</>
                          )}
                          {!g && !fromChat(it) && t("feed.checking")}
                          {g && unsure(it) && <span className="font-medium text-brand-800">{t("feed.cant")}</span>}
                          {g && !unsure(it) && g.type === "UNCLEAR" && `AI: ${t("feed.notPlastic")} · ${pct(g.confidence)}`}
                          {g && !unsure(it) && g.type !== "UNCLEAR" && (
                            <>AI: <b>{g.type}</b>{g.name && <> · <b>{g.name}</b></>} · {g.learned ? t("teach.learned", { n: g.learned }) : pct(g.confidence)}
                              {!g.learned && band(g.confidence) === "confirm" && ` · ${t("feed.check")}`}</>
                          )}
                        </p>
                        {(g || fromChat(it)) && (
                          <label className="flex items-center gap-2 text-sm text-stone-600">
                            {t("feed.howMany")}
                            <input type="number" min="1" value={it.count} onChange={(e) => update(it.key, { count: Math.max(1, Number(e.target.value) || 1) })}
                              className="input mt-0 w-20 py-1.5" />
                          </label>
                        )}
                        {g && !askName && (
                          <button onClick={() => update(it.key, { naming: true })} className="text-sm font-medium text-brand-700 underline">
                            {t("feed.notRight")}
                          </button>
                        )}
                        {askName && (
                          <input value={it.name} onChange={(e) => update(it.key, { name: e.target.value })} aria-label={t("feed.whatIs", { n })}
                            placeholder={t("feed.whatPh")} className="input mt-0 py-2" />
                        )}
                        {hint && hint !== it.type && (
                          <p className="text-sm">
                            {t("feed.usually", { name: it.name.trim(), type: hint })}{" "}
                            <button onClick={() => update(it.key, { type: hint })} className="font-semibold text-brand-700 underline">{t("feed.use", { type: hint })}</button>
                          </p>
                        )}
                        {(g || fromChat(it)) && (
                          <select value={it.type} onChange={(e) => update(it.key, { type: e.target.value as Plastic | "" })}
                            aria-label={t("feed.categoryOf", { n })} className="input mt-0 py-2">
                            <option value="">{t("feed.choose")}</option>
                            {PLASTICS.map((p) => <option key={p} value={p}>{p}: {t(`desc.${p}`).split(" · ")[1]}</option>)}
                            <option value="UNCLEAR">{t("feed.leaveOut")}</option>
                          </select>
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
              </ol>

              <details open={ordered.some(unsure)} className="mt-3 border-t border-stone-200 pt-3 text-sm">
                <summary className="cursor-pointer font-medium text-brand-800">{t("feed.howToTell")}</summary>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-stone-600">
                  {[0, 1, 2, 3].map((i) => <li key={i}>{t(`tell.${i}` as Key)}</li>)}
                </ul>
              </details>
              {reused && (
                <p role="alert" className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-800">{t("feed.reused")}</p>
              )}
              {ready && (
                <ul className="mt-3 space-y-1 rounded-xl bg-brand-50 px-4 py-3 text-sm text-brand-900">
                  {types.flatMap((p) => Array.from({ length: TIP_COUNT }, (_, i) => (
                    <li key={p + i} className="flex items-start gap-2">
                      <Check size={16} className="mt-0.5 shrink-0" /> {types.length > 1 && <b>{p}:</b>} {t(`tip.${p}.${i}` as Key)}
                    </li>
                  )))}
                </ul>
              )}
            </section>
          )}

          {allNotPlastic && !batch && (
            <section className="card border-brand-300 bg-brand-50/60 text-sm text-stone-700">
              <h2 className="heading text-base">{t("feed.notRecTitle")}</h2>
              <p className="mt-1">{t("feed.notRecText")}</p>
            </section>
          )}

          {ready && !batch && (
            <section className="card space-y-3">
              {step(3, t("feed.step3"))}
              <label className="label">
                {t("feed.weight")} <span className="font-normal text-stone-500">({t("feed.optional")})</span>
                <input type="number" min="0.1" step="0.1" inputMode="decimal" value={kg} onChange={(e) => setKg(e.target.value)} placeholder={`≈ ${guessKg}`} className="input" />
              </label>
              {estimatedGrams > 0 && (
                <p className="text-sm text-stone-600">
                  {t("feed.estimate", { g: Math.round(estimatedGrams) })}{" "}
                  <button onClick={() => setKg(String(Math.max(0.1, Math.round(estimatedGrams / 100) / 10)))} className="font-semibold text-brand-700 underline">
                    {t("feed.useIt")}
                  </button>
                </p>
              )}
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
              {/* phones: a second Send button here, so nobody has to scroll back up to Basellion */}
              <div className="space-y-2 pt-1 lg:hidden">
                <button onClick={send} disabled={!canSend} className="btn-primary min-h-12 w-full text-base">
                  {eating ? t("feed.eating") : t("feed.send")}
                </button>
                {todo && <p className="text-center text-sm text-stone-500">{todo}</p>}
              </div>
            </section>
          )}

          {batch && (
            <section className="card">
              {step(4, t("feed.step4"))}
              <p className="mt-1 text-sm text-stone-500">{types.join(" + ")} · {batch.declared_kg} {t("kg")} · {t("feed.from", { label: address?.label ?? "" })}</p>
              <BookPickup batch={batch} onBooked={finish} />
            </section>
          )}
        </div>
      </div>

      {camera && (
        <Camera taken={photos.length} max={MAX_PHOTOS} onClose={() => setCamera(false)} onPhoto={addPhoto} />
      )}
    </Shell>
  );
}
