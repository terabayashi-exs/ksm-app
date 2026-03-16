"use client";

import { Clock, Coffee, Calendar, LayoutGrid, Monitor } from "lucide-react";

interface PhaseStat {
  phase: string;
  phase_name: string;
  order: number;
  block_count: number;
  max_court_number: number | null;
}

interface FormatDetailBadgesProps {
  sport_code?: string;
  default_match_duration?: number | null;
  default_break_duration?: number | null;
  matchday_count?: number;
  phase_stats?: PhaseStat[];
}

const getSportIcon = (sportCode: string) => {
  switch (sportCode) {
    case 'soccer': return '\u26BD';
    case 'baseball': return '\u26BE';
    case 'basketball': return '\u{1F3C0}';
    case 'pk': return '\u{1F945}';
    default: return '\u26BD';
  }
};

export { getSportIcon };

export default function FormatDetailBadges({
  default_match_duration,
  default_break_duration,
  matchday_count,
  phase_stats,
}: FormatDetailBadgesProps) {
  const hasDuration = default_match_duration != null || default_break_duration != null;
  const hasTemplates = (phase_stats && phase_stats.length > 0) || (matchday_count && matchday_count > 1);

  if (!hasDuration && !hasTemplates) return null;

  return (
    <div className="space-y-1 text-sm text-gray-500">
      {hasDuration && (
        <div className="flex items-center gap-3">
          {default_match_duration != null && (
            <span className="flex items-center gap-1">
              <Clock className="h-3.5 w-3.5" />
              試合時間 {default_match_duration}分
            </span>
          )}
          {default_break_duration != null && (
            <span className="flex items-center gap-1">
              <Coffee className="h-3.5 w-3.5" />
              休憩 {default_break_duration}分
            </span>
          )}
        </div>
      )}

      {hasTemplates && (
        <div>
          {(matchday_count ?? 0) > 1 ? (
            <div className="flex items-center gap-1">
              <Calendar className="h-3.5 w-3.5" />
              {matchday_count}節
            </div>
          ) : (phase_stats && phase_stats.length > 0) ? (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
              {phase_stats.map((ps) => (
                <span key={ps.phase} className="flex items-center gap-1">
                  <span className="font-medium text-gray-600">{ps.phase_name}</span>
                  {ps.block_count > 0 && (
                    <span className="flex items-center gap-0.5">
                      <LayoutGrid className="h-3.5 w-3.5" />
                      {ps.block_count}ブロック
                    </span>
                  )}
                  {ps.max_court_number != null && ps.max_court_number > 0 && (
                    <span className="flex items-center gap-0.5 ml-1">
                      <Monitor className="h-3.5 w-3.5" />
                      {ps.max_court_number}コート
                    </span>
                  )}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
