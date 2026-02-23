const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ||
  "https://agent-karma.rushikeshmore271.workers.dev";

export async function apiFetch<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, { next: { revalidate: 60 } });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json() as Promise<T>;
}

export interface WalletRow {
  address: string;
  source: string;
  chain: string;
  erc8004_id: number | null;
  tx_count: number;
  trust_score: number | null;
  score_breakdown: Record<string, number> | null;
  scored_at: string | null;
  first_seen_at: string;
  last_seen_at: string;
}

export interface ScoreResult {
  address: string;
  score: number;
  tier: string;
  breakdown: Record<string, number>;
  scored_at: string;
}

export interface StatsResult {
  wallets: number;
  transactions: number;
  feedback_entries: number;
  db_size_mb: string;
  version: string;
  score_distribution?: { tier: string; count: number; avg_score: number }[];
}

export interface LeaderboardEntry {
  address: string;
  trust_score: number;
  source: string;
  tx_count: number;
  score_breakdown: Record<string, number>;
}
