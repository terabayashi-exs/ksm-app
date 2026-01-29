"use client";

import { useState, useEffect } from "react";
import { Trophy } from "lucide-react";
import {
  TournamentBlock,
  MultiBlockBracket,
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

  // 不戦勝試合と実際の対戦試合を分離
  const separateByeMatches = (matches: BracketMatch[]) => {
    const actualMatches: BracketMatch[] = [];
    const seedTeams: string[] = [];

    matches.forEach((match) => {
      if (match.is_walkover) {
        // 不戦勝試合：勝者チーム名をシードとして抽出
        // 1. winner_team_idが設定されている場合はそれを使用
        // 2. なければ、team1_idまたはteam2_idが設定されている方を使用
        // 3. どちらもなければdisplay_nameを使用
        let winnerName = "シード";

        if (match.winner_team_id) {
          // winner_team_idが設定されている場合
          winnerName = match.winner_team_id === match.team1_id
            ? match.team1_display_name
            : match.team2_display_name;
        } else if (match.team1_id && !match.team2_id) {
          // team1のみ設定されている（team1が勝者）
          winnerName = match.team1_display_name;
        } else if (match.team2_id && !match.team1_id) {
          // team2のみ設定されている（team2が勝者）
          winnerName = match.team2_display_name;
        } else if (match.team1_display_name && match.team1_display_name !== "") {
          // display_nameを使用（テンプレート名の可能性）
          winnerName = match.team1_display_name;
        } else if (match.team2_display_name && match.team2_display_name !== "") {
          winnerName = match.team2_display_name;
        }

        seedTeams.push(winnerName);
      } else {
        // 実際の対戦試合
        actualMatches.push(match);
      }
    });

    return { actualMatches, seedTeams };
  };

  // block_nameでグループ化（試合数に関わらず実行）
  const blockMap = new Map<string, BracketMatch[]>();
  mainMatches.forEach((match) => {
    const blockName = match.block_name || "main";
    if (!blockMap.has(blockName)) {
      blockMap.set(blockName, []);
    }
    blockMap.get(blockName)!.push(match);
  });

  // ブロックデータを作成
  const blockData = Array.from(blockMap.entries()).map(([blockName, matches]) => {
    // 不戦勝試合を分離
    const { actualMatches, seedTeams } = separateByeMatches(matches);

    // ブロック内のラウンドラベルを生成
    const blockRoundLabels: string[] = [];
    const hasQuarterFinal = actualMatches.some(m => m.match_code.startsWith("M3") || m.match_code.startsWith("T3"));
    const hasSemiFinal = actualMatches.some(m => m.match_code.startsWith("M5") || m.match_code.startsWith("T5"));
    const hasFinal = actualMatches.some(m => m.match_code.startsWith("M6") || m.match_code.startsWith("T6"));

    if (hasQuarterFinal) blockRoundLabels.push("準々決勝");
    if (hasSemiFinal) blockRoundLabels.push("準決勝");
    if (hasFinal) blockRoundLabels.push("決勝");

    return {
      blockId: blockName,
      title: blockName === "main" ? "メイントーナメント" : blockName,
      matches: actualMatches.sort((a, b) => a.match_code.localeCompare(b.match_code)),
      seedTeams,
      roundLabels: blockRoundLabels,
    };
  });

  // 表示方法を判定
  // - ブロック数が2以上: MultiBlockBracket使用
  // - それ以外: TournamentBlock使用（試合数に関わらず）
  const shouldUseMultiBlock = blockData.length >= 2;

  return (
    <>
      {/* 印刷用スタイル - レイアウトに影響するCSSは最小限に */}
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
          }

          .print-container {
            overflow: visible !important;
            box-shadow: none !important;
            border: none !important;
          }

          [data-match] {
            break-inside: avoid !important;
            page-break-inside: avoid !important;
            border: 1px solid #666 !important;
            background: white !important;
          }

          svg path {
            stroke: #333 !important;
            stroke-width: 2px !important;
          }

          /* トーナメントブロックの改ページ制御 */
          .tournament-block {
            break-inside: avoid !important;
            page-break-inside: avoid !important;
          }

          /* 3位決定戦セクション - 内部での分割を避ける */
          .third-place-section {
            break-inside: avoid !important;
            page-break-inside: avoid !important;
          }
        }
      `}</style>

      <div className="print-container relative bg-card border border-border rounded-lg p-6 shadow-sm overflow-x-auto">
        <div className="space-y-8">
          {/* 試合数に応じて表示方法を切り替え */}
          {shouldUseMultiBlock ? (
            // 8試合以上: MultiBlockBracket使用
            <MultiBlockBracket
              blocks={blockData}
              sportConfig={sportConfig || undefined}
            />
          ) : (
            // 7試合以下: TournamentBlock使用
            (() => {
              const { actualMatches, seedTeams } = separateByeMatches(mainMatches);
              return (
                <TournamentBlock
                  blockId="main"
                  matches={actualMatches}
                  seedTeams={seedTeams}
                  sportConfig={sportConfig || undefined}
                  roundLabels={roundLabels}
                />
              );
            })()
          )}

          {/* 3位決定戦ブロック */}
          {thirdPlaceMatch && (
            <div className="third-place-section">
              <TournamentBlock
                blockId="third"
                matches={[thirdPlaceMatch]}
                sportConfig={sportConfig || undefined}
                title="3位決定戦"
                roundLabels={["3位決定戦"]}
              />
            </div>
          )}
        </div>
      </div>
    </>
  );
}
