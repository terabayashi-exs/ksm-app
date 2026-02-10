"use client";

import { useState, useEffect } from "react";
import { Trophy } from "lucide-react";
import {
  TournamentBlock,
  MultiBlockBracket,
  organizeMatchesByMatchType,
  getPatternByMatchCount,
  getPatternByTeamCount,
  getPatternConfig,
  getP6PatternConfig,
} from "@/lib/tournament-bracket";
import type {
  BracketMatch,
  BracketProps,
  SportScoreConfig,
  PatternType,
  PatternConfig,
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

  const { mainMatches, thirdPlaceMatch } = organizeMatchesByMatchType(matches);

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
  // 統合ブロック（preliminary_unified, final_unified）の場合は、match_codeからブロック名を抽出
  const blockMap = new Map<string, BracketMatch[]>();
  mainMatches.forEach((match) => {
    let blockName = match.block_name || "main";

    // 統合ブロックの場合は、match_codeの先頭文字（A、B、Cなど）をブロック名として使用
    if (blockName === 'preliminary_unified' || blockName === 'final_unified') {
      const matchCodePrefix = match.match_code.match(/^([A-Z])/);
      if (matchCodePrefix) {
        blockName = matchCodePrefix[1];
      }
    }

    if (!blockMap.has(blockName)) {
      blockMap.set(blockName, []);
    }
    blockMap.get(blockName)!.push(match);
  });

  // ブロックデータを作成
  const blockData = Array.from(blockMap.entries()).map(([blockName, matches]) => {
    // 不戦勝試合を分離
    const { actualMatches, seedTeams } = separateByeMatches(matches);

    // 試合をmatch_codeでソート（BYE試合除外後）
    const sortedMatches = actualMatches.sort((a, b) => a.match_code.localeCompare(b.match_code));

    console.log(`[${blockName}] sortedMatches (BYE除外後):`, sortedMatches.map(m =>
      `${m.match_code}(${m.position_note}): ${m.team1_source || 'initial'} vs ${m.team2_source || 'initial'}`
    ));
    console.log(`[${blockName}] seedTeams:`, seedTeams);

    // ブロック内のラウンドラベルを生成（position_noteベース）
    const blockRoundLabels: string[] = [];

    // チーム数からパターンを判定
    let pattern: PatternType;
    let config: PatternConfig;
    let seedLayout: "dispersed" | "adjacent" = "dispersed";

    // ブロック内のチーム数を計算
    // 第1ラウンド試合の判定:
    // 1. team1_source/team2_sourceが空の試合
    // 2. または、予選ブロックの順位参照（例: "A_1", "B_2"）の試合
    const isFirstRoundMatch = (m: BracketMatch) => {
      // sourceが空の場合は第1ラウンド
      if ((!m.team1_source || m.team1_source === '') && (!m.team2_source || m.team2_source === '')) {
        return true;
      }

      // sourceが予選ブロックの順位参照（"A_1", "B_2" など）の場合も第1ラウンド
      // パターン: アルファベット大文字 + "_" + 数字
      const isLeagueReference = (source: string | undefined | null) => {
        if (!source) return false;
        return /^[A-Z]_\d+$/.test(source);
      };

      return isLeagueReference(m.team1_source) && isLeagueReference(m.team2_source);
    };

    const firstRoundMatches = matches.filter(isFirstRoundMatch);

    // 各第1ラウンド試合のチーム数をカウント
    let blockTeamCount = 0;
    firstRoundMatches.forEach(m => {
      if (m.is_bye_match) {
        // BYE試合は1チーム（シード）
        blockTeamCount += 1;
      } else {
        // 通常試合は2チーム
        blockTeamCount += 2;
      }
    });

    console.log(`[${blockName}] チーム数計算: 第1ラウンド試合=${firstRoundMatches.length}件 (BYE=${matches.filter(m => m.is_bye_match).length}) → 合計${blockTeamCount}チーム`);

    if (blockTeamCount >= 2 && blockTeamCount <= 8) {
      // ブロック内のチーム数を使用
      pattern = getPatternByTeamCount(blockTeamCount);

      // 6チームの場合のみ、シード同士の対戦有無でパターンを選択
      if (blockTeamCount === 6) {
        // BYE試合のmatch_codeリストを作成
        const byeMatchCodes = new Set<string>();
        matches.forEach((match) => {
          if (match.is_bye_match) {
            byeMatchCodes.add(match.match_code);
            console.log(`[P6判定] BYE試合検出: ${match.match_code}`);
          }
        });

        console.log(`[P6判定] BYE試合リスト:`, Array.from(byeMatchCodes));

        // シード同士が対戦する試合があるかチェック
        const hasSeedVsSeed = sortedMatches.some((match) => {
          const team1Source = match.team1_source || "";
          const team2Source = match.team2_source || "";

          // "A1_winner" のような形式から試合コードを抽出
          const team1SourceMatch = team1Source.match(/^([A-Z]\d+)_winner$/);
          const team2SourceMatch = team2Source.match(/^([A-Z]\d+)_winner$/);

          // 両方とも _winner 形式で、かつその試合がBYE試合の場合
          const team1IsSeed = team1SourceMatch && byeMatchCodes.has(team1SourceMatch[1]);
          const team2IsSeed = team2SourceMatch && byeMatchCodes.has(team2SourceMatch[1]);

          if (team1IsSeed || team2IsSeed) {
            console.log(`[P6判定] ${match.match_code}: team1=${team1Source}(${team1IsSeed}), team2=${team2Source}(${team2IsSeed})`);
          }

          return team1IsSeed && team2IsSeed;
        });

        console.log(`[P6判定] hasSeedVsSeed: ${hasSeedVsSeed}`);
        console.log(`[P6判定] 選択パターン: ${hasSeedVsSeed ? "adjacent" : "dispersed"}`);

        // シード同士が対戦する場合はP6_ADJACENT、しない場合はP6（分散）
        seedLayout = hasSeedVsSeed ? "adjacent" : "dispersed";
        config = getP6PatternConfig(seedLayout);

        console.log(`[P6判定] seedLayout: ${seedLayout}`);
      } else {
        config = getPatternConfig(pattern);
      }
    } else {
      // フォールバック: 試合数から判定（従来の動作）
      pattern = getPatternByMatchCount(sortedMatches.length);
      config = getPatternConfig(pattern);
    }

    // position_noteの優先度定義（数値が小さいほど優先）
    const labelPriority: Record<string, number> = {
      '決勝戦': 1,
      '決勝': 1,
      '3位決定戦': 2,
      '3位決定': 2,
      '準決勝': 3,
      '準々決勝': 4,
      '1回戦': 5,
    };

    let matchIndex = 0;
    // 各ラウンド（カラム）の最も優先度の高いposition_noteを取得
    for (const round of config.rounds) {
      const roundMatches = sortedMatches.slice(matchIndex, matchIndex + round.matchCount);

      // このラウンドの試合からposition_noteを収集
      const positionNotes = roundMatches
        .map(m => m.position_note)
        .filter((note): note is string => note !== null && note !== undefined && note !== '');

      if (positionNotes.length > 0) {
        // 優先度でソートして最も優先度の高いラベルを選択
        const bestLabel = positionNotes.sort((a, b) =>
          (labelPriority[a] || 99) - (labelPriority[b] || 99)
        )[0];

        // 末尾の「戦」を除去
        blockRoundLabels.push(bestLabel.replace(/戦$/, ''));
      } else {
        // position_noteがない場合は空文字
        blockRoundLabels.push('');
      }

      matchIndex += round.matchCount;
    }

    return {
      blockId: blockName,
      title: blockName === "main" ? "メイントーナメント" : blockName,
      matches: sortedMatches,
      seedTeams,
      roundLabels: blockRoundLabels,
      seedLayout,
      pattern, // 計算したパターンを渡す
    };
  });

  // 表示方法を判定
  // - ブロック数が2以上: MultiBlockBracket使用
  // - いずれかのブロックの試合数が8以上: MultiBlockBracket使用（大規模トーナメント対応）
  // - それ以外: TournamentBlock使用
  const hasLargeBlock = blockData.some(block => block.matches.length >= 8);
  const shouldUseMultiBlock = blockData.length >= 2 || hasLargeBlock;

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

              // ラウンドラベルを生成（position_noteベース）
              const sortedMatches = actualMatches.sort((a, b) => a.match_code.localeCompare(b.match_code));
              const pattern = getPatternByMatchCount(sortedMatches.length);
              const config = getPatternConfig(pattern);

              const labelPriority: Record<string, number> = {
                '決勝戦': 1,
                '決勝': 1,
                '3位決定戦': 2,
                '3位決定': 2,
                '準決勝': 3,
                '準々決勝': 4,
                '1回戦': 5,
              };

              const singleBlockRoundLabels: string[] = [];
              let matchIndex = 0;

              for (const round of config.rounds) {
                const roundMatches = sortedMatches.slice(matchIndex, matchIndex + round.matchCount);
                const positionNotes = roundMatches
                  .map(m => m.position_note)
                  .filter((note): note is string => note !== null && note !== undefined && note !== '');

                if (positionNotes.length > 0) {
                  const bestLabel = positionNotes.sort((a, b) =>
                    (labelPriority[a] || 99) - (labelPriority[b] || 99)
                  )[0];
                  singleBlockRoundLabels.push(bestLabel.replace(/戦$/, ''));
                } else {
                  singleBlockRoundLabels.push('');
                }

                matchIndex += round.matchCount;
              }

              return (
                <TournamentBlock
                  blockId="main"
                  matches={sortedMatches}
                  seedTeams={seedTeams}
                  sportConfig={sportConfig || undefined}
                  roundLabels={singleBlockRoundLabels}
                  seedLayout={blockData[0]?.seedLayout}
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
