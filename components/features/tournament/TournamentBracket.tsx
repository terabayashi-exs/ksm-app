"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Trophy } from "lucide-react";
import {
  CARD_HEIGHT,
  CARD_GAP,
  HEADER_HEIGHT,
  PADDING_BOTTOM,
  EXTRA_HEIGHT,
  FINE_ADJUSTMENT,
  MIN_SEPARATION,
  SEPARATION_RATIO,
  AVOIDANCE_GAP,
  LINE_OFFSET,
  MatchCard,
  organizeBracket,
} from "@/lib/tournament-bracket";
import type {
  BracketMatch,
  BracketProps,
  BracketGroup,
  SportScoreConfig,
} from "@/lib/tournament-bracket";

export default function TournamentBracket({
  tournamentId,
  phase = "final",
}: BracketProps) {
  const [matches, setMatches] = useState<BracketMatch[]>([]);
  const [sportConfig, setSportConfig] = useState<SportScoreConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const bracketRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const bracket = organizeBracket(matches);

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
          // 多競技対応：スポーツ設定も取得
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

  // SVG線を描画する関数
  const drawLines = useCallback(() => {
    if (!bracketRef.current || !svgRef.current) return;

    const svg = svgRef.current;
    const bracketElement = bracketRef.current;

    // 既存のpathをクリア
    while (svg.firstChild) {
      svg.removeChild(svg.firstChild);
    }

    const box = bracketElement.getBoundingClientRect();

    const midRight = (el: HTMLElement) => {
      const r = el.getBoundingClientRect();
      return { x: r.right - box.left, y: r.top - box.top + r.height / 2 };
    };

    const midLeft = (el: HTMLElement) => {
      const r = el.getBoundingClientRect();
      return { x: r.left - box.left, y: r.top - box.top + r.height / 2 };
    };

    const addPath = (fromId: string, toId: string, avoidThirdPlace = false) => {
      const from = bracketElement.querySelector(
        `[data-match="${fromId}"]`
      ) as HTMLElement;
      const to = bracketElement.querySelector(
        `[data-match="${toId}"]`
      ) as HTMLElement;

      if (!from || !to) return;

      const p1 = midRight(from);
      const p2 = midLeft(to);

      let d: string;

      if (avoidThirdPlace) {
        // 3位決定戦を迂回するルート（新形式・旧形式両対応）
        const thirdPlaceCard =
          bracketElement.querySelector(`[data-match="T7"]`) ||
          (bracketElement.querySelector(`[data-match="M7"]`) as HTMLElement);

        if (thirdPlaceCard) {
          const thirdPlaceRect = thirdPlaceCard.getBoundingClientRect();
          const boxRect = bracketElement.getBoundingClientRect();

          // 3位決定戦カードの上端と下端（relative位置）
          const thirdPlaceTop = thirdPlaceRect.top - boxRect.top;
          const thirdPlaceBottom = thirdPlaceRect.bottom - boxRect.top;

          // 迂回ポイントを計算（3位決定戦の上または下を通る）
          let avoidanceY: number;

          if (p1.y < thirdPlaceTop + thirdPlaceRect.height / 2) {
            // 準決勝が3位決定戦より上にある場合、上を迂回
            avoidanceY = thirdPlaceTop - AVOIDANCE_GAP;
          } else {
            // 準決勝が3位決定戦より下にある場合、下を迂回
            avoidanceY = thirdPlaceBottom + AVOIDANCE_GAP;
          }

          // 迂回ルート: 右→上/下→右→決勝位置→決勝
          const midX1 = p1.x + LINE_OFFSET;
          const midX2 = p2.x - LINE_OFFSET;

          d = `M ${p1.x} ${p1.y} L ${midX1} ${p1.y} L ${midX1} ${avoidanceY} L ${midX2} ${avoidanceY} L ${midX2} ${p2.y} L ${p2.x} ${p2.y}`;
        } else {
          // フォールバック：通常の直線
          const midX = p1.x + (p2.x - p1.x) * 0.5;
          d = `M ${p1.x} ${p1.y} L ${midX} ${p1.y} L ${midX} ${p2.y} L ${p2.x} ${p2.y}`;
        }
      } else {
        // 通常の直線の角ばった形（縦横のみ）
        const midX = p1.x + (p2.x - p1.x) * 0.5;
        d = `M ${p1.x} ${p1.y} L ${midX} ${p1.y} L ${midX} ${p2.y} L ${p2.x} ${p2.y}`;
      }

      const path = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "path"
      );
      path.setAttribute("d", d);
      path.setAttribute("stroke", "hsl(var(--muted-foreground))"); // dynamic color
      path.setAttribute("stroke-width", "2");
      path.setAttribute("fill", "transparent");

      svg.appendChild(path);
    };

    // 勝者進出の接続線のみを描画（敗者進出は線を引かない）
    // 明示的に接続パターンを定義
    bracket.groups.forEach((group) => {
      // 現在のグループから適切な次のグループへの接続を決定
      const targetGroups: BracketGroup[] = [];

      if (group.groupName.includes("準々決勝")) {
        // 準々決勝 → 準決勝
        const semiFinalGroup = bracket.groups.find((g) =>
          g.groupName.includes("準決勝")
        );
        if (semiFinalGroup) targetGroups.push(semiFinalGroup);
      } else if (group.groupName.includes("準決勝")) {
        // 準決勝 → 決勝（準決勝と3位決定戦は除外）
        const finalGroup = bracket.groups.find((g) => g.groupName === "決勝");
        if (finalGroup) targetGroups.push(finalGroup);
      }

      // 接続線を描画
      targetGroups.forEach((targetGroup) => {
        group.matches.forEach((match, matchIndex) => {
          const targetGroupMatches = targetGroup.matches.length;
          const targetMatchIndex = Math.floor(
            matchIndex / Math.ceil(group.matches.length / targetGroupMatches)
          );

          if (targetMatchIndex < targetGroupMatches) {
            const fromDataMatch = `G${group.groupId}M${matchIndex + 1}`;
            const toDataMatch = `G${targetGroup.groupId}M${
              targetMatchIndex + 1
            }`;

            // 準決勝→決勝の線は3位決定戦を迂回
            const avoidThirdPlace =
              group.groupName.includes("準決勝") &&
              targetGroup.groupName.includes("決勝");
            addPath(fromDataMatch, toDataMatch, avoidThirdPlace);
          }
        });
      });
    });

    // SVGサイズ設定
    svg.setAttribute("width", Math.ceil(box.width).toString());
    svg.setAttribute("height", Math.ceil(box.height).toString());
    svg.setAttribute(
      "viewBox",
      `0 0 ${Math.ceil(box.width)} ${Math.ceil(box.height)}`
    );
  }, [bracket.groups]);

  // リサイズ時に線を再描画
  useEffect(() => {
    const handleResize = () => drawLines();
    window.addEventListener("resize", handleResize);

    // 初回描画
    setTimeout(drawLines, 100);

    return () => window.removeEventListener("resize", handleResize);
  }, [matches, drawLines]);

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

          /* トーナメント表全体の印刷最適化 */
          .print-container {
            overflow: visible !important;
            box-shadow: none !important;
            border: none !important;
            transform: none !important;
            width: 100% !important;
            margin: 0 !important;
            padding: 8px !important;
          }

          /* 文字の明瞭性向上 */
          * {
            line-height: 1.2 !important;
            font-weight: 500 !important;
          }

          /* 試合カードの最適化 */
          [data-match] {
            break-inside: avoid !important;
            page-break-inside: avoid !important;
            border: 1px solid #666 !important;
            background: white !important;
          }

          /* チーム名とスコアの視認性向上 */
          [data-match] .text-sm {
            font-size: 10px !important;
            font-weight: 600 !important;
          }

          /* 試合コードバッジの最適化 */
          [data-match] .text-xs {
            font-size: 9px !important;
            font-weight: 700 !important;
          }

          /* SVG接続線の最適化 */
          svg path {
            stroke: #333 !important;
            stroke-width: 2px !important;
          }

          /* 位置精度向上 */
          .absolute {
            transform: translateZ(0);
          }

          /* グループヘッダーの最適化 */
          h3 {
            font-size: 11px !important;
            font-weight: 700 !important;
            margin-bottom: 6px !important;
          }

          /* コンパクト配置のための余白調整 */
          .space-y-6 > * + * {
            margin-top: 18px !important;
          }

          .gap-10 {
            gap: 32px !important;
          }
        }
      `}</style>

      <div>
        {/* トーナメントブラケット */}
        <div className="print-container relative bg-card border border-border rounded-lg p-6 shadow-sm overflow-x-auto">
          <div
            ref={bracketRef}
            className="relative grid gap-10 min-w-fit"
            style={{
              gridTemplateColumns: `repeat(${bracket.columnCount}, minmax(200px, 1fr))`,
              minWidth: `${
                bracket.columnCount * 220 + (bracket.columnCount - 1) * 40
              }px`,
              minHeight: `${(() => {
                // 最大試合数のグループに基づいて最小高さを計算
                // 決勝と3位決定戦の垂直配置を考慮してより大きな高さを設定
                const maxMatchCount = Math.max(
                  ...bracket.groups.map((g) => g.matches.length)
                );

                return (
                  HEADER_HEIGHT +
                  maxMatchCount * CARD_HEIGHT +
                  (maxMatchCount - 1) * CARD_GAP +
                  PADDING_BOTTOM +
                  EXTRA_HEIGHT
                );
              })()}px`,
            }}
          >
            {/* SVG接続線 */}
            <svg
              ref={svgRef}
              className="absolute inset-0 pointer-events-none"
              style={{ zIndex: 1 }}
            />

            {/* 動的にグループを表示 */}
            {bracket.groups.map((group, groupIndex) => {
              // グループごとの色を決定
              const getGroupColor = (groupName: string) => {
                if (groupName.includes("準々決勝"))
                  return "bg-blue-100 text-blue-800";
                if (groupName.includes("準決勝"))
                  return "bg-purple-100 text-purple-800";
                if (groupName.includes("3位決定戦"))
                  return "bg-yellow-100 text-yellow-800";
                if (groupName.includes("決勝"))
                  return "bg-red-100 text-red-800";
                return "bg-muted text-muted-foreground";
              };

              return (
                <div key={group.groupId} style={{ zIndex: 2 }}>
                  <h3
                    className={`text-sm font-medium px-3 py-1 rounded-full text-center tracking-wide mb-6 ${getGroupColor(
                      group.groupName
                    )}`}
                  >
                    {group.groupName}
                  </h3>

                  {groupIndex === 0 ? (
                    // 最初のグループ（準々決勝など）は通常配置
                    <div className="space-y-6">
                      {group.matches.map((match, matchIndex) => (
                        <MatchCard
                          key={match.match_id}
                          match={match}
                          sportConfig={sportConfig || undefined}
                          className="h-fit"
                          data-match={`G${group.groupId}M${matchIndex + 1}`}
                        />
                      ))}
                    </div>
                  ) : (
                    // 後続のグループは前のグループのカードの中央に配置
                    <div className="relative">
                      {group.matches.map((match, matchIndex) => {
                        let topMargin = 0;

                        // 決勝と3位決定戦の場合は特別な位置計算
                        if (
                          group.groupName === "決勝" ||
                          group.groupName === "3位決定戦"
                        ) {
                          // 準決勝グループ（T5, T6）を探す
                          const semiFinalGroup = bracket.groups.find((g) =>
                            g.groupName.includes("準決勝")
                          );

                          if (
                            semiFinalGroup &&
                            semiFinalGroup.matches.length >= 2
                          ) {
                            // 準決勝の実際の位置を計算（準決勝は準々決勝の中央に配置されている）
                            // 準々決勝グループを探して、その位置を基準に計算
                            const quarterFinalGroup = bracket.groups.find((g) =>
                              g.groupName.includes("準々決勝")
                            );
                            let semiFinalBaseY = 0;

                            if (
                              quarterFinalGroup &&
                              quarterFinalGroup.matches.length >= 2
                            ) {
                              // 準々決勝の中央位置を計算（準々決勝は space-y-6 で配置）
                              const qf1CenterY = CARD_HEIGHT / 2;
                              const qf2CenterY =
                                CARD_HEIGHT + CARD_GAP + CARD_HEIGHT / 2;
                              const qfCenterY = (qf1CenterY + qf2CenterY) / 2;
                              semiFinalBaseY = qfCenterY - CARD_HEIGHT / 2;
                            }

                            // T5とT6の実際の位置（準決勝の基準位置から計算）
                            const t5TopMargin = semiFinalBaseY;
                            const t6TopMargin =
                              semiFinalBaseY + CARD_HEIGHT + CARD_GAP;

                            // T5とT6のそれぞれの中央Y座標
                            const t5CenterY = t5TopMargin + CARD_HEIGHT / 2;
                            const t6CenterY = t6TopMargin + CARD_HEIGHT / 2;

                            // 準決勝の中央位置
                            const semiFinalCenterY =
                              (t5CenterY + t6CenterY) / 2;

                            // 決勝と3位決定戦を異なる位置に配置
                            if (group.groupName === "決勝") {
                              // 決勝は準決勝の中央に配置
                              topMargin =
                                semiFinalCenterY -
                                CARD_HEIGHT / 2 +
                                FINE_ADJUSTMENT;
                            } else if (group.groupName === "3位決定戦") {
                              // 3位決定戦はトーナメントの山から動的に離れた位置に配置
                              const semiFinalHeight = t6CenterY - t5CenterY;
                              const dynamicSeparationOffset = Math.max(
                                semiFinalHeight * SEPARATION_RATIO,
                                MIN_SEPARATION
                              );
                              topMargin =
                                t6CenterY +
                                CARD_HEIGHT / 2 +
                                dynamicSeparationOffset;
                            }
                          } else {
                            // フォールバック: 通常の計算
                            const prevGroup = bracket.groups[groupIndex - 1];
                            const matchesPerGroup = Math.ceil(
                              prevGroup.matches.length / group.matches.length
                            );
                            const startIdx = matchIndex * matchesPerGroup;
                            const endIdx = Math.min(
                              startIdx + matchesPerGroup,
                              prevGroup.matches.length
                            );
                            const avgPosition = (startIdx + endIdx - 1) / 2;
                            const centerPosition =
                              HEADER_HEIGHT +
                              CARD_HEIGHT / 2 +
                              avgPosition * (CARD_HEIGHT + CARD_GAP);
                            topMargin =
                              centerPosition - HEADER_HEIGHT - CARD_HEIGHT / 2;
                          }
                        } else {
                          // 通常のグループ（準決勝など）は従来の計算
                          const prevGroup = bracket.groups[groupIndex - 1];
                          const matchesPerGroup = Math.ceil(
                            prevGroup.matches.length / group.matches.length
                          );
                          const startIdx = matchIndex * matchesPerGroup;
                          const endIdx = Math.min(
                            startIdx + matchesPerGroup,
                            prevGroup.matches.length
                          );
                          const avgPosition = (startIdx + endIdx - 1) / 2;
                          const centerPosition =
                            HEADER_HEIGHT +
                            CARD_HEIGHT / 2 +
                            avgPosition * (CARD_HEIGHT + CARD_GAP);
                          topMargin =
                            centerPosition - HEADER_HEIGHT - CARD_HEIGHT / 2;
                        }

                        return (
                          <div
                            key={match.match_id}
                            className="absolute w-full"
                            style={{ top: `${topMargin}px` }}
                          >
                            <MatchCard
                              match={match}
                              sportConfig={sportConfig || undefined}
                              className="h-fit"
                              data-match={`G${group.groupId}M${matchIndex + 1}`}
                            />
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

      </div>
    </>
  );
}
