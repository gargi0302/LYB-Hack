import Link from "next/link";

// Same drawing as app/icon.svg
export function LogoMark({ size = 30, light = false }: { size?: number; light?: boolean }) {
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} aria-hidden>
      <rect width="64" height="64" rx="16" fill={light ? "#4f772d" : "#31572c"} />
      <g fill="none" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M19 33a13 13 0 0 1 22.2-9.2M42 15.5v9h-9" stroke="#fff" />
        <path d="M45 31a13 13 0 0 1-22.2 9.2M22 48.5v-9h9" stroke="#ecf39e" />
      </g>
    </svg>
  );
}

// short: the wordmark hides on tablet widths (the app header, where the tabs need the room)
// light: for the dark panel of the sign-in pages
export default function Logo({ href = "/", short = false, light = false }: { href?: string; short?: boolean; light?: boolean }) {
  return (
    <Link href={href} aria-label="Circular Plastics" className="flex shrink-0 items-center gap-2">
      <LogoMark light={light} />
      <span className={`font-display text-[17px] leading-none font-bold tracking-tight ${light ? "text-white" : "text-brand-950"} ${short ? "md:max-lg:hidden" : ""}`}>
        Circular Plastics
      </span>
    </Link>
  );
}
