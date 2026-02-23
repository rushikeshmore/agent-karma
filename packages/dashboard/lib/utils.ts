export function shortAddr(addr: string): string {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

export function tierColor(tier: string): string {
  switch (tier) {
    case "HIGH":
      return "text-emerald-400";
    case "MEDIUM":
      return "text-amber-400";
    case "LOW":
      return "text-orange-400";
    default:
      return "text-zinc-500";
  }
}

export function tierBg(tier: string): string {
  switch (tier) {
    case "HIGH":
      return "bg-emerald-400/10 border-emerald-400/20";
    case "MEDIUM":
      return "bg-amber-400/10 border-amber-400/20";
    case "LOW":
      return "bg-orange-400/10 border-orange-400/20";
    default:
      return "bg-zinc-400/10 border-zinc-400/20";
  }
}

export function scoreToTier(score: number): string {
  if (score >= 80) return "HIGH";
  if (score >= 50) return "MEDIUM";
  if (score >= 20) return "LOW";
  return "MINIMAL";
}

export function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  if (days === 0) return "today";
  if (days === 1) return "1 day ago";
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  return months === 1 ? "1 month ago" : `${months} months ago`;
}
