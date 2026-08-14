import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { SiteFooter, SiteHeader } from "@/components/site-shell";
import { siteOrigin } from "@/lib/origins";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "Opus 5 vs Grok 4.6 vs GPT-5.6 Sol",
    template: "%s · Frontier Build Battle",
  },
  description:
    "Twenty frozen build specifications, three frontier coding agents, blind triad grading, full receipts, and staged artifacts.",
  metadataBase: siteOrigin,
  openGraph: {
    title: "Opus 5 vs Grok 4.6 vs GPT-5.6 Sol",
    description:
      "A receipted 20-spec build battle with side-by-side staged artifact inspection.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`dark ${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-background text-foreground">
        <SiteHeader />
        <main className="flex-1">{children}</main>
        <SiteFooter />
      </body>
    </html>
  );
}
