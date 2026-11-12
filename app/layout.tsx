import type { Metadata, Viewport } from "next";
import { Inter, Merriweather } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
// serif for headings and big numbers (the "heading" utility in globals.css)
const serif = Merriweather({ subsets: ["latin"], variable: "--font-serif" });

export const metadata: Metadata = {
  title: "Circular Plastics Exchange",
  description: "Sort, pick up and trace plastic waste from societies, campuses and shops",
  appleWebApp: { capable: true, title: "Circular Plastics", statusBarStyle: "default" },
};

// viewportFit "cover" lets the bottom tab bar sit above the phone's home indicator
export const viewport: Viewport = { themeColor: "#faf9f6", viewportFit: "cover" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${inter.variable} ${serif.variable}`}>
      <body className="min-h-screen bg-cream font-sans text-stone-800 antialiased">{children}</body>
    </html>
  );
}
