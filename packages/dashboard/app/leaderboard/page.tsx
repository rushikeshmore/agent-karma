import Link from "next/link";
import { WalletRow } from "@/lib/api";
import { shortAddr, scoreToTier, tierColor } from "@/lib/utils";

export const dynamic = "force-dynamic";

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ||
  "https://agent-karma.rushikeshmore271.workers.dev";

interface WalletsResponse {
  wallets: WalletRow[];
  total: number;
  limit: number;
  offset: number;
}

export default async function LeaderboardPage() {
  let wallets: WalletRow[] = [];
  let error = false;

  try {
    const res = await fetch(`${API_BASE}/wallets?sort=score&limit=100`, {
      next: { revalidate: 60 },
    });
    if (res.ok) {
      const data: WalletsResponse = await res.json();
      wallets = data.wallets;
    } else {
      error = true;
    }
  } catch {
    error = true;
  }

  if (error || wallets.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[40vh] gap-4">
        <p className="text-zinc-400">
          {error ? "Failed to load leaderboard. API may be waking up — try refreshing." : "No wallets found."}
        </p>
        <Link href="/" className="text-amber-400 text-sm hover:underline">
          Back to search
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Leaderboard</h1>
        <p className="text-zinc-400 text-sm mt-1">
          Top agent wallets ranked by trust score
        </p>
      </div>

      <div className="border border-zinc-800 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-zinc-900 text-zinc-400 text-left text-xs uppercase tracking-wider">
              <th className="px-4 py-3 w-12">#</th>
              <th className="px-4 py-3">Address</th>
              <th className="px-4 py-3">Source</th>
              <th className="px-4 py-3 text-right">Txns</th>
              <th className="px-4 py-3 text-right">Score</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800/50">
            {wallets.map((w, i) => {
              const tier = scoreToTier(w.trust_score ?? 0);
              return (
                <tr
                  key={w.address}
                  className="hover:bg-zinc-900/50 transition"
                >
                  <td className="px-4 py-3 text-zinc-500 font-mono">
                    {i + 1}
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/wallet/${w.address}`}
                      className="font-mono text-amber-400/80 hover:text-amber-400 transition"
                    >
                      {shortAddr(w.address)}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-block px-2 py-0.5 rounded text-xs font-medium bg-zinc-800 text-zinc-300">
                      {w.source}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-zinc-300">
                    {w.tx_count.toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span
                      className={`font-bold font-mono ${tierColor(tier)}`}
                    >
                      {w.trust_score ?? "—"}
                    </span>
                    <span className={`ml-2 text-xs ${tierColor(tier)}`}>
                      {tier}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
