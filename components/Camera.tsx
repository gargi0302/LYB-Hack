"use client";
import { useEffect, useRef, useState } from "react";
import { LONGEST } from "@/lib/image";
import { X } from "lucide-react";
import { useLang } from "@/lib/i18n";

// Live camera inside the app: asks for permission, shows the back camera, and hands back each photo taken.
// Browsers only allow this on https:// or localhost.
export default function Camera({ taken, max, onPhoto, onClose }: {
  taken: number;
  max: number;
  onPhoto: (src: string) => void;
  onClose: () => void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const [blocked, setBlocked] = useState(false);
  const [ready, setReady] = useState(false); // the video is showing; before that a photo would be empty
  const [saving, setSaving] = useState(false);
  // photos taken since the camera opened, counted here at once (the Feed adds them one by one, later)
  const [shots, setShots] = useState(0);
  const [atOpen] = useState(taken);
  const count = atOpen + shots;
  const { t } = useLang();
  const supported = typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia;

  useEffect(() => {
    if (!supported) return;
    let stream: MediaStream | null = null;
    let closed = false;
    navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false })
      .then((s) => {
        stream = s;
        if (closed) s.getTracks().forEach((t) => t.stop());
        else if (video.current) video.current.srcObject = s;
      })
      .catch(() => setBlocked(true));
    // turn the camera off when this closes
    return () => {
      closed = true;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [supported]);

  // takes the photo at most LONGEST pixels long: the AI needs far less, and full size froze slow phones
  function snap() {
    const v = video.current;
    if (!v?.videoWidth || saving || count >= max) return;
    setSaving(true);
    const scale = Math.min(1, LONGEST / Math.max(v.videoWidth, v.videoHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(v.videoWidth * scale);
    canvas.height = Math.round(v.videoHeight * scale);
    canvas.getContext("2d")!.drawImage(v, 0, 0, canvas.width, canvas.height);
    canvas.toBlob((blob) => {
      setSaving(false);
      if (!blob) return;
      setShots(shots + 1);
      onPhoto(URL.createObjectURL(blob));
      if (count + 1 >= max) onClose(); // that was the last photo allowed
    }, "image/jpeg", 0.9);
  }

  return (
    <div role="dialog" aria-label={t("cam.title")} className="fixed inset-0 z-50 flex flex-col bg-black text-white">
      <p className="bg-black/60 px-4 pt-[calc(1rem+env(safe-area-inset-top))] pb-3 text-center text-sm">
        {t("cam.tip")}
      </p>
      {!supported || blocked ? (
        <p className="m-auto max-w-xs text-center">{supported ? t("cam.blocked") : t("cam.https")}</p>
      ) : (
        <video ref={video} autoPlay playsInline muted onPlaying={() => setReady(true)} className="min-h-0 flex-1 object-cover" />
      )}
      <div className="flex items-center justify-between px-8 pt-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
        <button onClick={onClose} aria-label={t("cam.close")} className="grid h-12 w-12 place-items-center rounded-full bg-white/15">
          <X size={24} />
        </button>
        <button onClick={snap} disabled={!supported || blocked || !ready || saving || count >= max} aria-label={t("cam.take")}
          className="h-18 w-18 rounded-full border-4 border-white bg-white/30 active:bg-white disabled:opacity-30" />
        <span className="w-12 text-center text-sm">{count}/{max}</span>
      </div>
    </div>
  );
}
