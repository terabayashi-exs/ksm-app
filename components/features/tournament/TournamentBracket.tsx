'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Trophy, Download } from 'lucide-react';

interface BracketMatch {
  match_id: number;
  match_code: string;
  team1_id?: string;
  team2_id?: string;
  team1_display_name: string;
  team2_display_name: string;
  team1_goals: number;
  team2_goals: number;
  // 多競技対応の拡張フィールド
  team1_scores?: number[];
  team2_scores?: number[];
  active_periods?: number[];
  winner_team_id?: string;
  is_draw: boolean;
  is_walkover: boolean;
  match_status: 'scheduled' | 'ongoing' | 'completed' | 'cancelled';
  is_confirmed: boolean;
  execution_priority: number;
  start_time?: string;
  court_number?: number;
  execution_group?: number;
  // サッカー専用データ（該当する場合のみ）
  soccer_data?: {
    regular_goals_for: number;
    regular_goals_against: number;
    pk_goals_for?: number;
    pk_goals_against?: number;
    is_pk_game: boolean;
    pk_winner?: boolean;
  };
}

interface BracketProps {
  tournamentId: number;
}

// 多競技対応のスポーツ設定インターフェース
interface SportScoreConfig {
  sport_code: string;
  score_label: string;
  score_against_label: string;
  difference_label: string;
  supports_pk: boolean;
}

interface BracketGroup {
  groupId: number;
  groupName: string;
  matches: BracketMatch[];
}

interface BracketStructure {
  groups: BracketGroup[];
  columnCount: number;
}

// 試合カードコンポーネント
function MatchCard({ 
  match,
  sportConfig,
  className = "",
  ...props
}: { 
  match: BracketMatch;
  sportConfig?: SportScoreConfig;
  className?: string;
  [key: string]: unknown;
}) {
  const getWinnerTeam = () => {
    if (!match.winner_team_id || !match.is_confirmed) return null;
    // winner_team_idとteam1_id/team2_idを正しく比較
    if (match.winner_team_id === match.team1_id) return 0; // team1が勝者
    if (match.winner_team_id === match.team2_id) return 1; // team2が勝者
    return null;
  };

  // 多競技対応のスコア表示ロジック
  const getScoreDisplay = (teamIndex: number) => {
    if (!hasResult || match.is_walkover) return null;

    const teamScores = teamIndex === 0 ? match.team1_scores : match.team2_scores;

    // 多競技スコアデータがある場合
    if (teamScores && teamScores.length > 0) {
      // サッカーでPK戦がある場合の特別処理
      if (sportConfig?.supports_pk && teamScores.length >= 5) {
        const regularGoals = teamScores.slice(0, 4).reduce((sum, score) => sum + score, 0);
        const pkGoals = teamScores.slice(4).reduce((sum, score) => sum + score, 0);
        
        if (pkGoals > 0) {
          return { regular: regularGoals, pk: pkGoals, isPkMatch: true };
        }
        return { regular: regularGoals, isPkMatch: false };
      }
      
      // 通常のスコア合計
      const totalScore = teamScores.reduce((sum, score) => sum + score, 0);
      return { regular: totalScore, isPkMatch: false };
    }

    // フォールバック: 従来のgoalsを使用
    const goals = teamIndex === 0 ? match.team1_goals : match.team2_goals;
    return { regular: goals || 0, isPkMatch: false };
  };
  
  const hasResult = match.is_confirmed && (
    match.team1_goals !== null || 
    match.team2_goals !== null || 
    match.is_draw || 
    match.is_walkover
  );

  // 試合コードからブロック色を取得
  const getMatchCodeColor = (matchCode: string): string => {
    // 新形式（M1-M8）に対応
    if (['M1', 'M2', 'M3', 'M4'].includes(matchCode)) return 'bg-blue-100 text-blue-800'; // 準々決勝
    if (['M5', 'M6'].includes(matchCode)) return 'bg-purple-100 text-purple-800'; // 準決勝
    if (matchCode === 'M7') return 'bg-yellow-100 text-yellow-800'; // 3位決定戦
    if (matchCode === 'M8') return 'bg-red-100 text-red-800'; // 決勝
    
    // 旧形式（T1-T8）にも対応（後方互換性）
    if (['T1', 'T2', 'T3', 'T4'].includes(matchCode)) return 'bg-blue-100 text-blue-800'; // 準々決勝
    if (['T5', 'T6'].includes(matchCode)) return 'bg-purple-100 text-purple-800'; // 準決勝
    if (matchCode === 'T7') return 'bg-yellow-100 text-yellow-800'; // 3位決定戦
    if (matchCode === 'T8') return 'bg-red-100 text-red-800'; // 決勝
    
    return 'bg-muted text-muted-foreground';
  };

  const winnerIndex = getWinnerTeam();

  return (
    <div className={`relative bg-card border border-border rounded-lg p-3 shadow-sm ${className}`} {...props}>
      {/* 試合コード */}
      <div className={`absolute -top-2 left-3 border px-2 py-1 rounded-full text-xs font-medium ${getMatchCodeColor(match.match_code)}`}>
        {match.match_code}
      </div>
      
      {/* チーム1 */}
      <div className={`flex items-center justify-between h-8 px-3 mb-2 border border-border rounded cursor-default transition-all ${
        winnerIndex === 0 
          ? 'bg-green-50 text-green-600 border-green-300 font-medium' 
          : hasResult && winnerIndex === 1
          ? 'bg-red-50 text-red-600 border-red-300' 
          : hasResult && match.is_draw
          ? 'bg-blue-50 text-blue-600 border-blue-300'
          : 'bg-muted text-muted-foreground'
      }`}>
        <span className="text-sm truncate flex-1">
          {winnerIndex === 0 && hasResult ? '👑 ' : ''}{match.team1_display_name || '未確定'}
        </span>
        {hasResult && !match.is_draw && (() => {
          const scoreData = getScoreDisplay(0);
          if (!scoreData) return null;
          
          return (
            <span className="text-sm font-bold ml-2">
              {scoreData.isPkMatch ? (
                <span className="flex flex-col items-end text-xs">
                  <span>{scoreData.regular}</span>
                  <span className="text-[10px] text-muted-foreground">PK{scoreData.pk}</span>
                </span>
              ) : (
                scoreData.regular
              )}
            </span>
          );
        })()}
        {hasResult && match.is_draw && (() => {
          const scoreData = getScoreDisplay(0);
          if (!scoreData) return null;
          
          return (
            <span className="text-sm font-bold ml-2 text-blue-600">
              {scoreData.isPkMatch ? (
                <span className="flex flex-col items-end text-xs">
                  <span>{scoreData.regular}</span>
                  <span className="text-[10px] text-muted-foreground">PK{scoreData.pk}</span>
                </span>
              ) : (
                scoreData.regular
              )}
            </span>
          );
        })()}
      </div>

      {/* チーム2 */}
      <div className={`flex items-center justify-between h-8 px-3 border border-border rounded cursor-default transition-all ${
        winnerIndex === 1 
          ? 'bg-green-50 text-green-600 border-green-300 font-medium' 
          : hasResult && winnerIndex === 0
          ? 'bg-red-50 text-red-600 border-red-300' 
          : hasResult && match.is_draw
          ? 'bg-blue-50 text-blue-600 border-blue-300'
          : 'bg-muted text-muted-foreground'
      }`}>
        <span className="text-sm truncate flex-1">
          {winnerIndex === 1 && hasResult ? '👑 ' : ''}{match.team2_display_name || '未確定'}
        </span>
        {hasResult && !match.is_draw && (() => {
          const scoreData = getScoreDisplay(1);
          if (!scoreData) return null;
          
          return (
            <span className="text-sm font-bold ml-2">
              {scoreData.isPkMatch ? (
                <span className="flex flex-col items-end text-xs">
                  <span>{scoreData.regular}</span>
                  <span className="text-[10px] text-muted-foreground">PK{scoreData.pk}</span>
                </span>
              ) : (
                scoreData.regular
              )}
            </span>
          );
        })()}
        {hasResult && match.is_draw && (() => {
          const scoreData = getScoreDisplay(1);
          if (!scoreData) return null;
          
          return (
            <span className="text-sm font-bold ml-2 text-blue-600">
              {scoreData.isPkMatch ? (
                <span className="flex flex-col items-end text-xs">
                  <span>{scoreData.regular}</span>
                  <span className="text-[10px] text-muted-foreground">PK{scoreData.pk}</span>
                </span>
              ) : (
                scoreData.regular
              )}
            </span>
          );
        })()}
      </div>

      {/* 状態表示 */}
      <div className="mt-2 text-center">
        {match.match_status === 'completed' && match.is_confirmed ? (
          <span className="text-xs bg-blue-50 text-blue-600 border border-blue-300 px-2 py-1 rounded-full">
            結果確定
          </span>
        ) : match.match_status === 'ongoing' ? (
          <span className="text-xs bg-orange-50 text-orange-600 border border-orange-300 px-2 py-1 rounded-full animate-pulse">
            試合中
          </span>
        ) : match.match_status === 'completed' ? (
          <span className="text-xs bg-purple-50 text-purple-600 border border-purple-300 px-2 py-1 rounded-full">
            試合完了
          </span>
        ) : (
          <span className="text-xs bg-muted text-muted-foreground border border-border px-2 py-1 rounded-full">
            未実施
          </span>
        )}
      </div>
    </div>
  );
}

// メインコンポーネント
export default function TournamentBracket({ tournamentId }: BracketProps) {
  const [matches, setMatches] = useState<BracketMatch[]>([]);
  const [sportConfig, setSportConfig] = useState<SportScoreConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const bracketRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  // トーナメント構造を整理（execution_group基準）
  const organizeBracket = (matches: BracketMatch[]): BracketStructure => {
    
    // execution_groupがない場合のフォールバック: 従来のロジック使用
    const hasExecutionGroup = matches.some(m => m.execution_group !== null && m.execution_group !== undefined);
    
    if (!hasExecutionGroup) {
      // フォールバック: 従来の試合コードベースのグループ化
      const groups: BracketGroup[] = [];
      
      // 新形式（M1-M8）に対応
      const quarterFinals = matches.filter(m => 
        ['T1', 'T2', 'T3', 'T4', 'M1', 'M2', 'M3', 'M4'].includes(m.match_code)
      );
      const semiFinals = matches.filter(m => 
        ['T5', 'T6', 'M5', 'M6'].includes(m.match_code)
      );
      const thirdPlace = matches.find(m => m.match_code === 'T7' || m.match_code === 'M7');
      const final = matches.find(m => m.match_code === 'T8' || m.match_code === 'M8');
      
      if (quarterFinals.length > 0) {
        groups.push({
          groupId: 1,
          groupName: '準々決勝',
          matches: quarterFinals.sort((a, b) => a.match_code.localeCompare(b.match_code))
        });
      }
      
      if (semiFinals.length > 0) {
        groups.push({
          groupId: 2,
          groupName: '準決勝',
          matches: semiFinals.sort((a, b) => a.match_code.localeCompare(b.match_code))
        });
      }
      
      if (thirdPlace) {
        groups.push({
          groupId: 3,
          groupName: '3位決定戦',
          matches: [thirdPlace]
        });
      }
      
      if (final) {
        groups.push({
          groupId: 4,
          groupName: '決勝',
          matches: [final]
        });
      }
      
      return { groups, columnCount: groups.length };
    }

    // execution_groupでグループ化
    const groupMap = new Map<number, BracketMatch[]>();
    
    matches.forEach(match => {
      const groupId = match.execution_group!;
      if (!groupMap.has(groupId)) {
        groupMap.set(groupId, []);
      }
      groupMap.get(groupId)!.push(match);
    });

    // グループ名を決定
    const getGroupName = (groupId: number, matchCount: number, matches: BracketMatch[]): string => {
      // 試合コードから判定（新形式・旧形式両対応）
      if (matches.some(m => ['T1', 'T2', 'T3', 'T4', 'M1', 'M2', 'M3', 'M4'].includes(m.match_code))) return '準々決勝';
      if (matches.some(m => ['T5', 'T6', 'M5', 'M6'].includes(m.match_code))) return '準決勝';
      if (matches.some(m => m.match_code === 'T7' || m.match_code === 'M7')) return '3位決定戦';
      if (matches.some(m => m.match_code === 'T8' || m.match_code === 'M8')) return '決勝';
      
      // フォールバック: 試合数から推測
      if (matchCount >= 4) return '準々決勝';
      if (matchCount === 2) return '準決勝';
      if (matchCount === 1) {
        const hasThirdPlace = matches.some(m => m.match_code === 'T7' || m.match_code === 'M7');
        return hasThirdPlace ? '3位決定戦' : '決勝';
      }
      return `グループ${groupId}`;
    };

    // グループを配列に変換してソート
    const groups: BracketGroup[] = Array.from(groupMap.entries())
      .sort(([a], [b]) => a - b) // execution_groupでソート
      .map(([groupId, matches]) => ({
        groupId,
        groupName: getGroupName(groupId, matches.length, matches),
        matches: matches.sort((a, b) => a.match_code.localeCompare(b.match_code))
      }));

    return {
      groups,
      columnCount: groups.length
    };
  };

  // bracket を早期に宣言（useEffect で使用するため）
  const bracket = organizeBracket(matches);

  useEffect(() => {
    const fetchMatches = async () => {
      try {
        setLoading(true);
        const response = await fetch(`/api/tournaments/${tournamentId}/bracket`);
        
        if (!response.ok) {
          if (response.status === 404) {
            setError('この大会にはトーナメント戦がありません');
            return;
          }
          throw new Error('データの取得に失敗しました');
        }

        const result = await response.json();
        if (result.success) {
          setMatches(result.data);
          // 多競技対応：スポーツ設定も取得
          if (result.sport_config) {
            setSportConfig(result.sport_config);
          }
        } else {
          throw new Error(result.error || 'データの取得に失敗しました');
        }
      } catch (err) {
        console.error('Error fetching bracket:', err);
        setError(err instanceof Error ? err.message : 'エラーが発生しました');
      } finally {
        setLoading(false);
      }
    };

    fetchMatches();
  }, [tournamentId]);

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
      const from = bracketElement.querySelector(`[data-match="${fromId}"]`) as HTMLElement;
      const to = bracketElement.querySelector(`[data-match="${toId}"]`) as HTMLElement;
      
      if (!from || !to) return;
      
      const p1 = midRight(from);
      const p2 = midLeft(to);
      
      let d: string;
      
      if (avoidThirdPlace) {
        // 3位決定戦を迂回するルート（新形式・旧形式両対応）
        const thirdPlaceCard = bracketElement.querySelector(`[data-match="T7"]`) || 
                               bracketElement.querySelector(`[data-match="M7"]`) as HTMLElement;
        
        if (thirdPlaceCard) {
          const thirdPlaceRect = thirdPlaceCard.getBoundingClientRect();
          const boxRect = bracketElement.getBoundingClientRect();
          
          // 3位決定戦カードの上端と下端（relative位置）
          const thirdPlaceTop = thirdPlaceRect.top - boxRect.top;
          const thirdPlaceBottom = thirdPlaceRect.bottom - boxRect.top;
          
          // 迂回ポイントを計算（3位決定戦の上または下を通る）
          const avoidanceGap = 20; // 迂回時の余白
          let avoidanceY: number;
          
          if (p1.y < thirdPlaceTop + (thirdPlaceRect.height / 2)) {
            // 準決勝が3位決定戦より上にある場合、上を迂回
            avoidanceY = thirdPlaceTop - avoidanceGap;
          } else {
            // 準決勝が3位決定戦より下にある場合、下を迂回
            avoidanceY = thirdPlaceBottom + avoidanceGap;
          }
          
          // 迂回ルート: 右→上/下→右→決勝位置→決勝
          const midX1 = p1.x + 30; // 準決勝から右に出る
          const midX2 = p2.x - 30; // 決勝の手前
          
          d = `M ${p1.x} ${p1.y} L ${midX1} ${p1.y} L ${midX1} ${avoidanceY} L ${midX2} ${avoidanceY} L ${midX2} ${p2.y} L ${p2.x} ${p2.y}`;
        } else {
          // フォールバック：通常の直線
          const midX = p1.x + ((p2.x - p1.x) * 0.5);
          d = `M ${p1.x} ${p1.y} L ${midX} ${p1.y} L ${midX} ${p2.y} L ${p2.x} ${p2.y}`;
        }
      } else {
        // 通常の直線の角ばった形（縦横のみ）
        const midX = p1.x + ((p2.x - p1.x) * 0.5);
        d = `M ${p1.x} ${p1.y} L ${midX} ${p1.y} L ${midX} ${p2.y} L ${p2.x} ${p2.y}`;
      }
      
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', d);
      path.setAttribute('stroke', 'hsl(var(--muted-foreground))'); // dynamic color
      path.setAttribute('stroke-width', '2');
      path.setAttribute('fill', 'transparent');
      
      svg.appendChild(path);
    };
    
    // 勝者進出の接続線のみを描画（敗者進出は線を引かない）
    // 明示的に接続パターンを定義
    bracket.groups.forEach((group) => {
      // 現在のグループから適切な次のグループへの接続を決定
      const targetGroups: BracketGroup[] = [];
      
      if (group.groupName.includes('準々決勝')) {
        // 準々決勝 → 準決勝
        const semiFinalGroup = bracket.groups.find(g => g.groupName.includes('準決勝'));
        if (semiFinalGroup) targetGroups.push(semiFinalGroup);
      } else if (group.groupName.includes('準決勝')) {
        // 準決勝 → 決勝（準決勝と3位決定戦は除外）
        const finalGroup = bracket.groups.find(g => 
          g.groupName === '決勝'
        );
        if (finalGroup) targetGroups.push(finalGroup);
      }
      
      // 接続線を描画
      targetGroups.forEach(targetGroup => {
        group.matches.forEach((match, matchIndex) => {
          const targetGroupMatches = targetGroup.matches.length;
          const targetMatchIndex = Math.floor(matchIndex / Math.ceil(group.matches.length / targetGroupMatches));
          
          if (targetMatchIndex < targetGroupMatches) {
            const fromDataMatch = `G${group.groupId}M${matchIndex + 1}`;
            const toDataMatch = `G${targetGroup.groupId}M${targetMatchIndex + 1}`;
            
            // 準決勝→決勝の線は3位決定戦を迂回
            const avoidThirdPlace = group.groupName.includes('準決勝') && targetGroup.groupName.includes('決勝');
            addPath(fromDataMatch, toDataMatch, avoidThirdPlace);
          }
        });
      });
    });
    
    // SVGサイズ設定
    svg.setAttribute('width', Math.ceil(box.width).toString());
    svg.setAttribute('height', Math.ceil(box.height).toString());
    svg.setAttribute('viewBox', `0 0 ${Math.ceil(box.width)} ${Math.ceil(box.height)}`);
  }, [bracket.groups]);

  // リサイズ時に線を再描画
  useEffect(() => {
    const handleResize = () => drawLines();
    window.addEventListener('resize', handleResize);
    
    // 初回描画
    setTimeout(drawLines, 100);
    
    return () => window.removeEventListener('resize', handleResize);
  }, [matches, drawLines]);

  // 印刷機能（PDF保存可）
  const handlePrint = () => {
    window.print();
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center py-16">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        <span className="ml-3 text-muted-foreground">トーナメント表を読み込み中...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-16">
        <Trophy className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
        <p className="text-muted-foreground text-lg mb-2">{error}</p>
        <p className="text-muted-foreground text-sm">この大会は予選リーグ戦のみで構成されています。</p>
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

      <div className="space-y-6">
        {/* ヘッダー */}
        <div className="text-center no-print">
          <div className="flex items-center justify-center mb-2">
            <Trophy className="h-6 w-6 mr-2 text-yellow-600" />
            <h2 className="text-2xl font-bold text-foreground">決勝トーナメント</h2>
            <Button
              onClick={handlePrint}
              variant="outline"
              size="sm"
              className="flex items-center gap-2 ml-4"
            >
              <Download className="h-4 w-4" />
              PDF出力（印刷）
            </Button>
          </div>
          <p className="text-muted-foreground">各ブロック上位2チームによるトーナメント表</p>
        </div>

        {/* トーナメントブラケット */}
        <div className="print-container relative bg-card border border-border rounded-lg p-6 shadow-sm overflow-x-auto">
        <div 
          ref={bracketRef}
          className="relative grid gap-10 min-w-fit"
          style={{ 
            gridTemplateColumns: `repeat(${bracket.columnCount}, minmax(200px, 1fr))`,
            minWidth: `${bracket.columnCount * 220 + (bracket.columnCount - 1) * 40}px`,
            minHeight: `${(() => {
              // 最大試合数のグループに基づいて最小高さを計算
              // 決勝と3位決定戦の垂直配置を考慮してより大きな高さを設定
              const maxMatchCount = Math.max(...bracket.groups.map(g => g.matches.length));
              const cardHeight = 140;
              const cardGap = 24;
              const headerHeight = 44;
              const paddingBottom = 100; // より多くのパディングを追加
              
              return headerHeight + (maxMatchCount * cardHeight) + ((maxMatchCount - 1) * cardGap) + paddingBottom + 200;
            })()}px`
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
              if (groupName.includes('準々決勝')) return 'bg-blue-100 text-blue-800';
              if (groupName.includes('準決勝')) return 'bg-purple-100 text-purple-800';
              if (groupName.includes('3位決定戦')) return 'bg-yellow-100 text-yellow-800';
              if (groupName.includes('決勝')) return 'bg-red-100 text-red-800';
              return 'bg-muted text-muted-foreground';
            };

            return (
              <div key={group.groupId} style={{ zIndex: 2 }}>
                <h3 className={`text-sm font-medium px-3 py-1 rounded-full text-center tracking-wide mb-6 ${getGroupColor(group.groupName)}`}>
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
                      const cardHeight = 140;
                      const cardGap = 24;
                      const headerHeight = 44;
                      
                      let topMargin = 0;
                      
                      // 決勝と3位決定戦の場合は特別な位置計算
                      if (group.groupName === '決勝' || group.groupName === '3位決定戦') {
                        // 準決勝グループ（T5, T6）を探す
                        const semiFinalGroup = bracket.groups.find(g => g.groupName.includes('準決勝'));
                        
                        if (semiFinalGroup && semiFinalGroup.matches.length >= 2) {
                          // 準決勝の実際の位置を計算（準決勝は準々決勝の中央に配置されている）
                          // 準々決勝グループを探して、その位置を基準に計算
                          const quarterFinalGroup = bracket.groups.find(g => g.groupName.includes('準々決勝'));
                          let semiFinalBaseY = 0;
                          
                          if (quarterFinalGroup && quarterFinalGroup.matches.length >= 2) {
                            // 準々決勝の中央位置を計算（準々決勝は space-y-6 で配置）
                            // space-y-6 = 1.5rem = 24px, しかし実際のmarginを確認してみる
                            const actualGap = 24; // Tailwind space-y-6 の実際の値
                            const qf1CenterY = (cardHeight / 2); // 70
                            const qf2CenterY = cardHeight + actualGap + (cardHeight / 2); // 140 + 24 + 70 = 234
                            const qfCenterY = (qf1CenterY + qf2CenterY) / 2; // 152
                            semiFinalBaseY = qfCenterY - (cardHeight / 2); // 82
                          }
                          
                          // T5とT6の実際の位置（準決勝の基準位置から計算）
                          const t5TopMargin = semiFinalBaseY; // 82
                          const t6TopMargin = semiFinalBaseY + cardHeight + cardGap; // 82 + 164 = 246
                          
                          // T5とT6のそれぞれの中央Y座標
                          const t5CenterY = t5TopMargin + (cardHeight / 2); // 82 + 70 = 152
                          const t6CenterY = t6TopMargin + (cardHeight / 2); // 246 + 70 = 316
                          
                          // 準決勝の中央位置
                          const semiFinalCenterY = (t5CenterY + t6CenterY) / 2; // (152 + 316) / 2 = 234
                          
                          // 決勝と3位決定戦を異なる位置に配置
                          if (group.groupName === '決勝') {
                            // 決勝は準決勝の中央に配置（微調整: +20px下に移動）
                            const fineAdjustment = 20;
                            topMargin = semiFinalCenterY - (cardHeight / 2) + fineAdjustment; // 234 - 70 + 20 = 184
                          } else if (group.groupName === '3位決定戦') {
                            // 3位決定戦はトーナメントの山から動的に離れた位置に配置
                            // 準決勝の高さ（T5からT6までの距離）を基準に分離距離を計算
                            const semiFinalHeight = t6CenterY - t5CenterY; // T5-T6間の距離
                            const dynamicSeparationOffset = Math.max(
                              semiFinalHeight * 0.8, // 準決勝高さの80%以上
                              120 // 最小120px
                            );
                            topMargin = t6CenterY + (cardHeight / 2) + dynamicSeparationOffset;
                            
                          }
                        } else {
                          // フォールバック: 通常の計算
                          const prevGroup = bracket.groups[groupIndex - 1];
                          const matchesPerGroup = Math.ceil(prevGroup.matches.length / group.matches.length);
                          const startIdx = matchIndex * matchesPerGroup;
                          const endIdx = Math.min(startIdx + matchesPerGroup, prevGroup.matches.length);
                          const avgPosition = (startIdx + endIdx - 1) / 2;
                          const centerPosition = headerHeight + (cardHeight / 2) + (avgPosition * (cardHeight + cardGap));
                          topMargin = centerPosition - headerHeight - (cardHeight / 2);
                        }
                      } else {
                        // 通常のグループ（準決勝など）は従来の計算
                        const prevGroup = bracket.groups[groupIndex - 1];
                        const matchesPerGroup = Math.ceil(prevGroup.matches.length / group.matches.length);
                        const startIdx = matchIndex * matchesPerGroup;
                        const endIdx = Math.min(startIdx + matchesPerGroup, prevGroup.matches.length);
                        const avgPosition = (startIdx + endIdx - 1) / 2;
                        const centerPosition = headerHeight + (cardHeight / 2) + (avgPosition * (cardHeight + cardGap));
                        topMargin = centerPosition - headerHeight - (cardHeight / 2);
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

      {/* 操作ガイドと注意事項 */}
      <div className="grid md:grid-cols-2 gap-6 mt-8">
        <Card className="bg-green-50 border-green-200">
          <CardContent className="pt-4">
            <div className="flex items-start space-x-3">
              <div className="flex-shrink-0 mt-0.5">
                <div className="h-2 w-2 bg-green-400 rounded-full"></div>
              </div>
              <div className="text-sm text-green-700">
                <p className="font-medium mb-1">PDF出力方法</p>
                <ul className="list-disc list-inside space-y-1 text-green-600">
                  <li>「PDF出力（印刷）」ボタンをクリック</li>
                  <li>印刷ダイアログで「送信先」を「PDFに保存」を選択</li>
                  <li>用紙サイズを「A4」、向きを「横」に設定</li>
                  <li>「詳細設定」で「背景のグラフィック」をオンにする</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-blue-50 border-blue-200">
          <CardContent className="pt-4">
            <div className="flex items-start space-x-3">
              <div className="flex-shrink-0 mt-0.5">
                <div className="h-2 w-2 bg-blue-400 rounded-full"></div>
              </div>
              <div className="text-sm text-blue-700">
                <p className="font-medium mb-1">トーナメント表の見方</p>
                <ul className="list-disc list-inside space-y-1 text-blue-600">
                  <li>実線は勝利チームの勝ち上がり、点線は敗者の進出先（3位決定戦）</li>
                  <li>太字は勝利チーム、数字は{sportConfig?.score_label || '得点'}を表示</li>
                  <li>［T1］などは試合コードを表示</li>
                  <li>各ブロック上位2チームが決勝トーナメントに進出</li>
                  {sportConfig?.supports_pk && (
                    <li>サッカーの場合、通常時間とPK戦の{sportConfig.score_label}を分けて表示</li>
                  )}
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
      </div>
    </>
  );
}