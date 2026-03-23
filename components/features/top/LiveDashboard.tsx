'use client';

import { Radio } from 'lucide-react';

interface LiveDashboardProps {
  ongoingCount: number;
  totalMatches: number;
  recentUpdates: {
    tournamentName: string;
    description: string;
    badge: 'live' | 'finished' | 'updated';
    homeTeam?: string;
    awayTeam?: string;
    homeScore?: number;
    awayScore?: number;
  }[];
}

const badgeConfig = {
  live: { label: 'LIVE', className: 'bg-green-500' },
  finished: { label: '終了', className: 'bg-red-500' },
  updated: { label: '更新', className: 'bg-blue-500' },
} as const;

export function LiveDashboard({
  ongoingCount,
  totalMatches,
  recentUpdates,
}: LiveDashboardProps) {
  const isLive = ongoingCount > 0;

  if (!isLive) {
    return (
      <section className="rounded-2xl bg-gray-100 px-6 py-10 text-center text-gray-500">
        <Radio className="h-8 w-8 mx-auto mb-3 text-gray-400" />
        <p className="text-lg font-medium">次の大会をお楽しみに！</p>
        <p className="text-sm mt-1">大会が開催されるとここにリアルタイム情報が表示されます</p>
      </section>
    );
  }

  return (
    <section className="overflow-hidden rounded-2xl bg-live-gradient px-6 py-10 sm:px-10 text-white">
      {/* Header */}
      <div className="text-center mb-8">
        <div className="inline-flex items-center gap-2 mb-2">
          <Radio className="h-5 w-5 animate-pulse" />
          <h2 className="text-2xl font-bold">ただいま熱戦中！</h2>
        </div>
      </div>

      {/* Stats — centered */}
      <div className="flex justify-center gap-10 sm:gap-16 mb-8">
        <div className="text-center">
          <p className="text-5xl font-bold leading-none">{ongoingCount}</p>
          <p className="text-sm text-white/80 mt-2">開催中の大会</p>
        </div>
        <div className="text-center">
          <p className="text-5xl font-bold leading-none">{totalMatches}</p>
          <p className="text-sm text-white/80 mt-2">本日の試合数</p>
        </div>
      </div>

      {/* Ticker */}
      {recentUpdates.length > 0 && (
        <div className="max-w-2xl mx-auto rounded-xl bg-white/15 p-4 backdrop-blur-sm">
          <div className="space-y-2">
            {recentUpdates.map((update, index) => {
              const badge = badgeConfig[update.badge];
              return (
                <div
                  key={index}
                  className="rounded-lg bg-white/90 px-4 py-2.5 text-sm text-gray-800"
                >
                  <div className="flex items-center gap-3">
                    <span
                      className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-bold text-white ${badge.className}`}
                    >
                      {badge.label}
                    </span>
                    <span className="truncate font-medium">{update.tournamentName}</span>
                  </div>
                  {update.homeTeam && update.awayTeam && (
                    <div className="mt-1.5 pl-14 flex items-center gap-2 text-sm">
                      <span className="font-semibold text-gray-900 truncate max-w-[120px] sm:max-w-[160px]">{update.homeTeam}</span>
                      {update.homeScore != null && update.awayScore != null ? (
                        <span className="font-bold text-primary tabular-nums">
                          {update.homeScore} - {update.awayScore}
                        </span>
                      ) : (
                        <span className="text-gray-400 font-medium">vs</span>
                      )}
                      <span className="font-semibold text-gray-900 truncate max-w-[120px] sm:max-w-[160px]">{update.awayTeam}</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}
