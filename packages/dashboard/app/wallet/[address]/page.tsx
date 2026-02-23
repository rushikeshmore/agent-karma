import Link from "next/link";
import { type WalletRow } from "@/lib/api";
import {
  shortAddr,
  tierColor,
  tierBg,
  scoreToTier,
  timeAgo,
} from "@/lib/utils";

export const dynamic = "force-dynamic";

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ||
  "https://agent-karma.rushikeshmore271.workers.dev";

const BREAKDOWN_ORDER = [
  { key: "loyalty", label: "Loyalty", weight: "32%" },
  { key: "activity", label: "Activity", weight: "20%" },
  { key: "diversity", label: "Diversity", weight: "18%" },
  { key: "feedback", label: "Feedback", weight: "15%" },
  { key: "age", label: "Age", weight: "9%" },
  { key: "recency", label: "Recency", weight: "6%" },
];

function barColor(tier: string): string {
  switch (tier) {
    case "HIGH":
      return "bg-emerald-400";
    case "MEDIUM":
      return "bg-amber-400";
    case "LOW":
      return "bg-orange-400";
    default:
      return "bg-zinc-500";
  }
}

export default async function WalletPage({
  params,
}: {
  params: Promise<{ address: string }>;
}) {
  const { address } = await params;

  let wallet: WalletRow;
  try {
    const res = await fetch(`${API_BASE}/wallet/${address}`, {
      next: { revalidate: 60 },
    });
    if (!res.ok) throw new Error("not found");
    const data: { wallet: WalletRow } = await res.json();
    wallet = data.wallet;
  } catch {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] gap-4">
        <div className="text-zinc-500 text-6xl">?</div>
        <h1 className="text-xl font-semibold">Wallet not found</h1>
        <p className="text-zinc-400 text-sm font-mono">{shortAddr(address)}</p>
        <Link
          href="/"
          className="mt-4 text-amber-400 text-sm hover:underline"
        >
          Back to search
        </Link>
      </div>
    );
  }

  const hasScore = wallet.trust_score !== null && wallet.trust_score !== undefined;
  const tier = hasScore ? scoreToTier(wallet.trust_score!) : "MINIMAL";

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <p className="text-zinc-500 text-sm mb-1">Wallet</p>
          <h1 className="text-lg font-mono font-semibold break-all">
            {wallet.address}
          </h1>
        </div>
        <Link
          href="/"
          className="text-zinc-400 text-sm hover:text-zinc-100 transition shrink-0"
        >
          Back
        </Link>
      </div>

      {/* Trust Score */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center space-y-3">
        {hasScore ? (
          <>
            <p className="text-zinc-500 text-sm uppercase tracking-wide">
              Trust Score
            </p>
            <div className={`text-6xl font-bold ${tierColor(tier)}`}>
              {wallet.trust_score}
            </div>
            <span
              className={`inline-block text-xs font-semibold px-3 py-1 rounded-full border ${tierBg(tier)} ${tierColor(tier)}`}
            >
              {tier}
            </span>
          </>
        ) : (
          <>
            <p className="text-zinc-500 text-sm uppercase tracking-wide">
              Trust Score
            </p>
            <div className="text-5xl font-bold text-zinc-600">&mdash;</div>
            <p className="text-zinc-500 text-sm">Not yet scored</p>
          </>
        )}
      </div>

      {/* Score Breakdown */}
      {hasScore && wallet.score_breakdown && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 space-y-4">
          <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wide">
            Score Breakdown
          </h2>
          <div className="space-y-3">
            {BREAKDOWN_ORDER.map(({ key, label, weight }) => {
              const value = wallet.score_breakdown?.[key] ?? 0;
              return (
                <div key={key} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-zinc-300">
                      {label}{" "}
                      <span className="text-zinc-600 text-xs">({weight})</span>
                    </span>
                    <span className="font-mono text-zinc-400">{value}</span>
                  </div>
                  <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${barColor(tier)} transition-all`}
                      style={{ width: `${value}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Metadata */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
        <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wide mb-4">
          Wallet Details
        </h2>
        <dl className="grid grid-cols-2 gap-x-8 gap-y-4 text-sm">
          <div>
            <dt className="text-zinc-500">Source</dt>
            <dd className="font-mono mt-0.5">{wallet.source}</dd>
          </div>
          <div>
            <dt className="text-zinc-500">Chain</dt>
            <dd className="font-mono mt-0.5">{wallet.chain}</dd>
          </div>
          <div>
            <dt className="text-zinc-500">Transactions</dt>
            <dd className="font-mono mt-0.5">
              {wallet.tx_count.toLocaleString()}
            </dd>
          </div>
          {wallet.erc8004_id !== null && (
            <div>
              <dt className="text-zinc-500">ERC-8004 ID</dt>
              <dd className="font-mono mt-0.5">#{wallet.erc8004_id}</dd>
            </div>
          )}
          <div>
            <dt className="text-zinc-500">First Seen</dt>
            <dd className="mt-0.5">
              {timeAgo(wallet.first_seen_at)}
              <span className="text-zinc-600 text-xs ml-2">
                {new Date(wallet.first_seen_at).toLocaleDateString()}
              </span>
            </dd>
          </div>
          <div>
            <dt className="text-zinc-500">Last Seen</dt>
            <dd className="mt-0.5">
              {timeAgo(wallet.last_seen_at)}
              <span className="text-zinc-600 text-xs ml-2">
                {new Date(wallet.last_seen_at).toLocaleDateString()}
              </span>
            </dd>
          </div>
        </dl>
      </div>
    </div>
  );
}
