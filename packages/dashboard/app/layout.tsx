import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
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
  title: "AgentKarma — Trust Scores for AI Agent Wallets",
  description:
    "Credit bureau for AI agent wallets. Look up trust scores for any wallet using public blockchain data.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-zinc-950 text-zinc-100 min-h-screen`}
      >
        <nav className="border-b border-zinc-800 px-6 py-4">
          <div className="max-w-5xl mx-auto flex items-center justify-between">
            <Link href="/" className="flex items-center gap-2">
              <span className="text-xl font-bold tracking-tight">
                Agent<span className="text-amber-400">Karma</span>
              </span>
            </Link>
            <div className="flex gap-6 text-sm text-zinc-400">
              <Link href="/" className="hover:text-zinc-100 transition">
                Search
              </Link>
              <Link
                href="/leaderboard"
                className="hover:text-zinc-100 transition"
              >
                Leaderboard
              </Link>
              <a
                href="https://github.com/rushikeshmore/agent-karma"
                target="_blank"
                rel="noopener"
                className="hover:text-zinc-100 transition"
              >
                GitHub
              </a>
            </div>
          </div>
        </nav>
        <main className="max-w-5xl mx-auto px-6 py-8">{children}</main>
        <footer className="border-t border-zinc-800 px-6 py-6 mt-16">
          <div className="max-w-5xl mx-auto text-center text-xs text-zinc-500">
            AgentKarma — Trust scores from public blockchain data (ERC-8004 +
            x402). Open source under MIT.
          </div>
        </footer>
      </body>
    </html>
  );
}
