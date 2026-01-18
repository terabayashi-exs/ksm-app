"use client";

import { TournamentBlock } from "./TournamentBlock";
import type { BracketMatch, SportScoreConfig } from "./types";

interface BlockData {
  /** ブロック識別子（例: "A", "B", "C", "D"） */
  blockId: string;
  /** ブロックタイトル */
  title: string;
  /** ブロック内の試合データ（0-7試合） */
  matches: BracketMatch[];
  /** ラウンドラベル */
  roundLabels: string[];
}

interface MultiBlockBracketProps {
  /** 各ブロックのデータ（2, 4, 8ブロック） */
  blocks: BlockData[];
  /** 決勝ブロックのタイトル */
  finalBlockTitle?: string;
  /** 決勝ブロックの試合データ（ブロック勝者同士の対戦） */
  finalBlockMatches?: BracketMatch[];
  /** 決勝ブロックのラウンドラベル */
  finalBlockRoundLabels?: string[];
  /** スポーツ設定 */
  sportConfig?: SportScoreConfig;
}

/**
 * 複数ブロック構成のトーナメントを描画するコンポーネント
 *
 * - 2ブロック（9-16チーム）: Block A, B + 決勝（P2）
 * - 4ブロック（17-32チーム）: Block A, B, C, D + 決勝（P4）
 * - 8ブロック（33-64チーム）: Block A-H + 決勝（P8）
 *
 * 各ブロックは縦に配置され、最後に決勝ブロックが追加される。
 */
export function MultiBlockBracket({
  blocks,
  finalBlockTitle = "決勝トーナメント",
  finalBlockMatches = [],
  finalBlockRoundLabels = [],
  sportConfig,
}: MultiBlockBracketProps) {
  // ブロック数のバリデーション
  if (blocks.length < 2) {
    throw new Error("MultiBlockBracket requires at least 2 blocks");
  }

  return (
    <div className="space-y-8">
      {/* 各ブロックを縦に配置 */}
      {blocks.map((block) => (
        <div
          key={block.blockId}
          className="border border-border rounded-lg p-4 bg-card"
        >
          <TournamentBlock
            blockId={block.blockId}
            title={block.title}
            matches={block.matches}
            roundLabels={block.roundLabels}
            sportConfig={sportConfig}
          />
        </div>
      ))}

      {/* 決勝ブロック */}
      {finalBlockMatches.length > 0 && (
        <div className="border border-border rounded-lg p-4 bg-card">
          <TournamentBlock
            blockId="FINAL"
            title={finalBlockTitle}
            matches={finalBlockMatches}
            roundLabels={finalBlockRoundLabels}
            sportConfig={sportConfig}
          />
        </div>
      )}
    </div>
  );
}
