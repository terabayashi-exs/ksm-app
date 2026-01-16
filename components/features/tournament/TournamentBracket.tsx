"use client";

import { useState, useEffect } from "react";
import { Trophy } from "lucide-react";
import {
  TournamentBlock,
  organizeMatchesByMatchType,
} from "@/lib/tournament-bracket";
import type {
  BracketMatch,
  BracketProps,
  SportScoreConfig,
} from "@/lib/tournament-bracket";

/**
 * トーナメントブラケット表示コンポーネント
 *
 * 8チームブロック単位で描画し、複数ブロックは縦に並べる
 */
export default function TournamentBracket({
  tournamentId,
  phase = "final",
}: BracketProps) {
  const [matches, setMatches] = useState<BracketMatch[]>([]);
  const [sportConfig, setSportConfig] = useState<SportScoreConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchMatches = async () => {
      try {
        setLoading(true);
const response = await fetch(
          `/api/tournaments/${tournamentId}/bracket?phase=${phase}`
        );

        if (!response.ok) {
          if (response.status === 404) {
            setError("この大会にはトーナメント戦がありません");
            return;
          }
          throw new Error("データの取得に失敗しました");
        }

        const result = await response.json();
        if (result.success) {
          setMatches(result.data);
          if (result.sport_config) {
            setSportConfig(result.sport_config);
          }
        } else {
          throw new Error(result.error || "データの取得に失敗しました");
        }
      } catch (err) {
        console.error("Error fetching bracket:", err);
        setError(err instanceof Error ? err.message : "エラーが発生しました");
      } finally {
        setLoading(false);
      }
    };

    fetchMatches();
  }, [tournamentId, phase]);

  if (loading) {
    return (
      <div className="flex justify-center items-center py-16">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        <span className="ml-3 text-muted-foreground">
          トーナメント表を読み込み中...
        </span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-16">
        <Trophy className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
        <p className="text-muted-foreground text-lg mb-2">{error}</p>
        <p className="text-muted-foreground text-sm">
          この大会は予選リーグ戦のみで構成されています。
        </p>
      </div>
    );
  }

  const { mainMatches, thirdPlaceMatch, roundLabels } = organizeMatchesByMatchType(matches);

  // 試合がない場合
  if (mainMatches.length === 0) {
    return (
      <div className="text-center py-16">
        <Trophy className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
        <p className="text-muted-foreground text-lg">
          トーナメント表データがありません
        </p>
      </div>
    );
  }

  return (
    <>
      {/* 印刷用スタイル */}
      <style jsx>{`
        @page {
          size: A4 landscape;
          margin: 4mm;
        }

        @media print {
          .no-print {
            display: none !important;
          }

          body {
            background: white !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            font-size: 12px !important;
          }

          .print-container {
            overflow: visible !important;
            box-shadow: none !important;
            border: none !important;
            transform: none !important;
            width: 100% !important;
            margin: 0 !important;
            padding: 8px !important;
          }

          * {
            line-height: 1.2 !important;
            font-weight: 500 !important;
          }

          [data-match] {
            break-inside: avoid !important;
            page-break-inside: avoid !important;
            border: 1px solid #666 !important;
            background: white !important;
          }

          [data-match] .text-sm {
            font-size: 10px !important;
            font-weight: 600 !important;
          }

          [data-match] .text-xs {
            font-size: 9px !important;
            font-weight: 700 !important;
          }

          svg path {
            stroke: #333 !important;
            stroke-width: 2px !important;
          }

          .absolute {
            transform: translateZ(0);
          }

          h3 {
            font-size: 11px !important;
            font-weight: 700 !important;
            margin-bottom: 6px !important;
          }

          .space-y-6 > * + * {
            margin-top: 18px !important;
          }

          .gap-10 {
            gap: 32px !important;
          }
        }
      `}</style>

      <div className="print-container relative bg-card border border-border rounded-lg p-6 shadow-sm overflow-x-auto">
        <div className="space-y-8">
          {/* メインブロック */}
          <TournamentBlock
            blockId="main"
            matches={mainMatches}
            sportConfig={sportConfig || undefined}
            roundLabels={roundLabels}
          />

          {/* 3位決定戦ブロック */}
          {thirdPlaceMatch && (
            <TournamentBlock
              blockId="third"
              matches={[thirdPlaceMatch]}
              sportConfig={sportConfig || undefined}
              title="3位決定戦"
              roundLabels={["3位決定戦"]}
            />
          )}
        </div>
      </div>
    </>
  );
}
