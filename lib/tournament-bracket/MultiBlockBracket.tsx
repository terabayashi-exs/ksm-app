"use client";

import { TournamentBlock } from "./TournamentBlock";
import type { BracketMatch, SportScoreConfig } from "./types";

interface BlockData {
  /** ブロック識別子（例: "A", "B", "C", "D"） */
  blockId: string;
  /** ブロックタイトル */
  title?: string;
  /** ブロック内の試合データ（0-7試合） */
  matches: BracketMatch[];
}

interface MultiBlockBracketProps {
  /** 各ブロックのデータ（2, 4, 8ブロック） */
  blocks: BlockData[];
  /** 決勝ブロックの試合データ（ブロック勝者同士の対戦） */
  finalBlockMatches?: BracketMatch[];
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
  finalBlockMatches = [],
  sportConfig,
}: MultiBlockBracketProps) {
  // ブロック数のバリデーション
  if (blocks.length < 2) {
    throw new Error("MultiBlockBracket requires at least 2 blocks");
  }

  // 決勝ブロックのタイトルを決定
  const getFinalBlockTitle = (): string => {
    switch (blocks.length) {
      case 2:
        return "決勝";
      case 4:
        return "準決勝・決勝";
      case 8:
        return "準々決勝・準決勝・決勝";
      default:
        return "決勝トーナメント";
    }
  };

  return (
    <div className="space-y-8">
      {/* 各ブロックを縦に配置 */}
      {blocks.map((block, index) => (
        <div
          key={block.blockId}
          className="border border-border rounded-lg p-4 bg-card"
        >
          <TournamentBlock
            blockId={block.blockId}
            title={block.title || `ブロック${block.blockId}`}
            matches={block.matches}
            sportConfig={sportConfig}
          />
          {/* 次のブロックへの矢印（最後のブロック以外） */}
          {index < blocks.length - 1 && (
            <div className="flex justify-center mt-4">
              <div className="text-muted-foreground text-2xl">↓</div>
            </div>
          )}
        </div>
      ))}

      {/* 決勝ブロック */}
      {finalBlockMatches.length > 0 && (
        <>
          <div className="flex justify-center">
            <div className="text-muted-foreground text-2xl">↓</div>
          </div>
          <div className="border-2 border-red-300 rounded-lg p-4 bg-red-50/30">
            <TournamentBlock
              blockId="FINAL"
              title={getFinalBlockTitle()}
              matches={finalBlockMatches}
              sportConfig={sportConfig}
            />
          </div>
        </>
      )}
    </div>
  );
}
