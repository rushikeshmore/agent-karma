"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function Home() {
  const [address, setAddress] = useState("");
  const router = useRouter();

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    const addr = address.trim().toLowerCase();
    if (/^0x[a-f0-9]{40}$/i.test(addr)) {
      router.push(`/wallet/${addr}`);
    }
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-8">
      <div className="text-center space-y-3">
        <h1 className="text-4xl font-bold tracking-tight">
          Agent<span className="text-amber-400">Karma</span>
        </h1>
        <p className="text-zinc-400 text-lg max-w-lg">
          Trust scores for AI agent wallets. Look up any wallet to see its
          reputation based on public blockchain data.
        </p>
      </div>

      <form onSubmit={handleSearch} className="w-full max-w-xl flex gap-2">
        <input
          type="text"
          placeholder="Enter wallet address (0x...)"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          className="flex-1 bg-zinc-900 border border-zinc-700 rounded-lg px-4 py-3 text-sm font-mono placeholder:text-zinc-600 focus:outline-none focus:border-amber-400/50 transition"
        />
        <button
          type="submit"
          className="bg-amber-400 text-zinc-900 font-semibold px-6 py-3 rounded-lg hover:bg-amber-300 transition"
        >
          Look up
        </button>
      </form>

      <div className="grid grid-cols-3 gap-6 mt-8 w-full max-w-xl">
        <StatCard label="Wallets Indexed" value="6,200+" />
        <StatCard label="Transactions" value="1,992" />
        <StatCard label="Data Sources" value="3" />
      </div>

      <div className="mt-8 text-center space-y-2">
        <p className="text-zinc-500 text-sm">
          Data from ERC-8004 Identity Registry, ERC-8004 Reputation Registry,
          and x402 payment protocol
        </p>
        <div className="flex gap-4 justify-center text-sm">
          <a
            href="https://github.com/rushikeshmore/agent-karma"
            target="_blank"
            rel="noopener"
            className="text-amber-400/80 hover:text-amber-400 transition"
          >
            View on GitHub
          </a>
          <span className="text-zinc-700">|</span>
          <span className="text-zinc-500 font-mono text-xs">
            npm install agentkarma
          </span>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 text-center">
      <div className="text-2xl font-bold text-zinc-100">{value}</div>
      <div className="text-xs text-zinc-500 mt-1">{label}</div>
    </div>
  );
}
