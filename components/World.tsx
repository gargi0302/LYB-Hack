// Basellion's world, shared by the home card and the Feed page: a background that goes from pale (nothing
// recycled this month) to green (500 kg), with soft hills and a leaf sprig that fill in as it gets greener.
// green is 0–1, from greenness() in lib/growth.ts.

export function worldStyle(green: number) {
  return {
    "--g": `${Math.round(green * 100)}%`,
    backgroundImage: "linear-gradient(to bottom, color-mix(in oklab, var(--color-paper), var(--color-brand-200) var(--g)), color-mix(in oklab, var(--color-brand-50), var(--color-brand-300) var(--g)))",
  } as React.CSSProperties;
}

// soft hills along the bottom (Leaf and Moss)
export function Hills({ green, className = "h-[38%]" }: { green: number; className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 600 160" preserveAspectRatio="none" className={`pointer-events-none absolute inset-x-0 bottom-0 w-full ${className}`}>
      <path d="M0 70 C110 20 220 30 320 72 S500 110 600 60 V160 H0 Z" fill="#ecf39e" fillOpacity={0.45 + 0.5 * green} />
      <path d="M0 115 C130 85 250 92 370 118 S530 130 600 108 V160 H0 Z" fill="#90a955" fillOpacity={0.2 + 0.45 * green} />
    </svg>
  );
}

// a leaf sprig for a corner (Moss and Grass)
export function Sprig({ green, className }: { green: number; className: string }) {
  return (
    <svg aria-hidden viewBox="0 0 120 120" className={`pointer-events-none ${className}`} fill="#90a955" fillOpacity={0.3 + 0.35 * green}>
      <path d="M30 118 C50 90 70 60 100 18" stroke="#4f772d" strokeOpacity="0.55" strokeWidth="2" fill="none" />
      <ellipse cx="96" cy="26" rx="9" ry="20" transform="rotate(35 96 26)" />
      <ellipse cx="76" cy="46" rx="8" ry="18" transform="rotate(-50 76 46)" />
      <ellipse cx="82" cy="64" rx="8" ry="18" transform="rotate(60 82 64)" />
      <ellipse cx="58" cy="78" rx="7" ry="16" transform="rotate(-55 58 78)" />
      <ellipse cx="62" cy="94" rx="7" ry="15" transform="rotate(55 62 94)" />
    </svg>
  );
}
