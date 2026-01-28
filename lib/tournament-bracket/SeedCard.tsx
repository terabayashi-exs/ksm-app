"use client";

interface SeedCardProps {
  teamName: string;
  className?: string;
}

/**
 * シード（不戦勝）チームを表示するカード
 * 1チームのみ表示し、対戦相手なし
 */
export function SeedCard({ teamName, className = "" }: SeedCardProps) {
  return (
    <div
      className={`relative bg-card border border-emerald-500 rounded-lg p-3 shadow-sm ${className}`}
    >
      {/* シードラベル */}
      <div className="absolute -top-2 left-3 border border-emerald-500 bg-emerald-500 px-2 py-1 rounded-full text-xs font-medium text-white">
        シード
      </div>

      {/* チーム名 */}
      <div className="flex items-center justify-between h-8 px-3 bg-emerald-500/20 text-emerald-500 border border-emerald-500 rounded font-medium">
        <span className="text-sm truncate">{teamName}</span>
      </div>
    </div>
  );
}
