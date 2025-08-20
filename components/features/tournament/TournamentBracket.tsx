'use client';

import { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Trophy, Download } from 'lucide-react';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

interface BracketMatch {
  match_id: number;
  match_code: string;
  team1_id?: string;
  team2_id?: string;
  team1_display_name: string;
  team2_display_name: string;
  team1_goals: number;
  team2_goals: number;
  winner_team_id?: string;
  is_draw: boolean;
  is_walkover: boolean;
  match_status: 'scheduled' | 'ongoing' | 'completed' | 'cancelled';
  is_confirmed: boolean;
  execution_priority: number;
  start_time?: string;
  court_number?: number;
  execution_group?: number;
}

interface BracketProps {
  tournamentId: number;
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
  className = "",
  ...props
}: { 
  match: BracketMatch;
  className?: string;
  [key: string]: any;
}) {
  const getWinnerTeam = () => {
    if (!match.winner_team_id || !match.is_confirmed) return null;
    // winner_team_idとteam1_id/team2_idを正しく比較
    if (match.winner_team_id === match.team1_id) return 0; // team1が勝者
    if (match.winner_team_id === match.team2_id) return 1; // team2が勝者
    return null;
  };
  
  const hasResult = match.is_confirmed && (
    match.team1_goals !== null || 
    match.team2_goals !== null || 
    match.is_draw || 
    match.is_walkover
  );

  // 試合コードからブロック色を取得
  const getMatchCodeColor = (matchCode: string): string => {
    if (['T1', 'T2', 'T3', 'T4'].includes(matchCode)) return 'bg-blue-100 text-blue-800'; // 準々決勝
    if (['T5', 'T6'].includes(matchCode)) return 'bg-purple-100 text-purple-800'; // 準決勝
    if (matchCode === 'T7') return 'bg-yellow-100 text-yellow-800'; // 3位決定戦
    if (matchCode === 'T8') return 'bg-red-100 text-red-800'; // 決勝
    return 'bg-gray-100 text-gray-800';
  };

  const winnerIndex = getWinnerTeam();

  return (
    <div className={`relative bg-white border border-gray-300 rounded-lg p-3 shadow-sm ${className}`} {...props}>
      {/* 試合コード */}
      <div className={`absolute -top-2 left-3 border px-2 py-1 rounded-full text-xs font-medium ${getMatchCodeColor(match.match_code)}`}>
        {match.match_code}
      </div>
      
      {/* チーム1 */}
      <div className={`flex items-center justify-between h-8 px-3 mb-2 border border-gray-300 rounded cursor-default transition-all ${
        winnerIndex === 0 
          ? 'bg-green-50 text-green-600 border-green-300 font-medium' 
          : hasResult && winnerIndex === 1
          ? 'bg-red-50 text-red-600 border-red-300' 
          : hasResult && match.is_draw
          ? 'bg-blue-50 text-blue-600 border-blue-300'
          : 'bg-gray-50 text-gray-700'
      }`}>
        <span className="text-sm truncate flex-1">
          {winnerIndex === 0 && hasResult ? '👑 ' : ''}{match.team1_display_name || '未確定'}
        </span>
        {hasResult && !match.is_draw && (
          <span className="text-sm font-bold ml-2">
            {match.team1_goals}
          </span>
        )}
        {hasResult && match.is_draw && (
          <span className="text-sm font-bold ml-2 text-blue-600">
            {match.team1_goals}
          </span>
        )}
      </div>

      {/* チーム2 */}
      <div className={`flex items-center justify-between h-8 px-3 border border-gray-300 rounded cursor-default transition-all ${
        winnerIndex === 1 
          ? 'bg-green-50 text-green-600 border-green-300 font-medium' 
          : hasResult && winnerIndex === 0
          ? 'bg-red-50 text-red-600 border-red-300' 
          : hasResult && match.is_draw
          ? 'bg-blue-50 text-blue-600 border-blue-300'
          : 'bg-gray-50 text-gray-700'
      }`}>
        <span className="text-sm truncate flex-1">
          {winnerIndex === 1 && hasResult ? '👑 ' : ''}{match.team2_display_name || '未確定'}
        </span>
        {hasResult && !match.is_draw && (
          <span className="text-sm font-bold ml-2">
            {match.team2_goals}
          </span>
        )}
        {hasResult && match.is_draw && (
          <span className="text-sm font-bold ml-2 text-blue-600">
            {match.team2_goals}
          </span>
        )}
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
          <span className="text-xs bg-gray-100 text-gray-500 border border-gray-300 px-2 py-1 rounded-full">
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [tournamentName, setTournamentName] = useState<string>('');
  const bracketRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        
        // ブラケットデータと大会情報を並列取得
        const [bracketResponse, tournamentResponse] = await Promise.all([
          fetch(`/api/tournaments/${tournamentId}/bracket`),
          fetch(`/api/tournaments/${tournamentId}`)
        ]);
        
        if (!bracketResponse.ok) {
          if (bracketResponse.status === 404) {
            setError('この大会にはトーナメント戦がありません');
            return;
          }
          throw new Error('データの取得に失敗しました');
        }

        const bracketResult = await bracketResponse.json();
        if (bracketResult.success) {
          setMatches(bracketResult.data);
        } else {
          throw new Error(bracketResult.error || 'データの取得に失敗しました');
        }

        // 大会名を取得
        if (tournamentResponse.ok) {
          const tournamentData = await tournamentResponse.json();
          if (tournamentData.success) {
            setTournamentName(tournamentData.data.tournament_name);
          } else {
            setTournamentName(`大会${tournamentId}`);
          }
        } else {
          setTournamentName(`大会${tournamentId}`);
        }

      } catch (err) {
        console.error('Error fetching data:', err);
        setError(err instanceof Error ? err.message : 'エラーが発生しました');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [tournamentId]);

  // SVG線を描画する関数
  const drawLines = () => {
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
        // 3位決定戦を迂回するルート
        const thirdPlaceCard = bracketElement.querySelector(`[data-match="T"]`) as HTMLElement;
        
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
      path.setAttribute('stroke', '#9ca3af'); // gray-400
      path.setAttribute('stroke-width', '2');
      path.setAttribute('fill', 'transparent');
      
      svg.appendChild(path);
    };
    
    // 勝者進出の接続線のみを描画（敗者進出は線を引かない）
    // 明示的に接続パターンを定義
    bracket.groups.forEach((group, groupIndex) => {
      // 現在のグループから適切な次のグループへの接続を決定
      let targetGroups: BracketGroup[] = [];
      
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
  };

  // リサイズ時に線を再描画
  useEffect(() => {
    const handleResize = () => drawLines();
    window.addEventListener('resize', handleResize);
    
    // 初回描画
    setTimeout(drawLines, 100);
    
    return () => window.removeEventListener('resize', handleResize);
  }, [matches]);

  // PDFダウンロード機能
  const handleDownloadPdf = async () => {
    setDownloadingPdf(true);
    try {
      // 動的インポートでjsPDFとhtml2canvasを読み込み
      const [{ default: jsPDF }, { default: html2canvas }] = await Promise.all([
        import('jspdf'),
        import('html2canvas')
      ]);

      const pdf = new jsPDF('portrait', 'mm', 'a4'); // A4縦向きに変更
      const pageWidth = 210; // A4縦向きの幅（mm）
      const pageHeight = 297; // A4縦向きの高さ（mm）

      // 簡易テスト用のPDF生成関数
      const generateSimplePdfContent = () => `
        <div style="
          width: 1120px; 
          height: 1000px; 
          font-family: Arial, sans-serif; 
          background: white; 
          padding: 20px;
          box-sizing: border-box;
        ">
          <h1 style="text-align: center; margin-bottom: 20px;">
            ${tournamentName} - 決勝トーナメント表
          </h1>
          <div style="border: 2px solid red; padding: 20px; margin: 20px 0;">
            <h2>テスト表示</h2>
            <p>ブラケット数: ${bracket.groups.length}</p>
            ${bracket.groups.map(group => `
              <div style="margin: 10px 0; padding: 10px; border: 1px solid #ccc;">
                <h3>${group.groupName}</h3>
                <p>試合数: ${group.matches.length}</p>
              </div>
            `).join('')}
          </div>
        </div>
      `;

      // 現在のページレイアウトに合わせたPDF専用HTMLを生成
      const generatePdfContent = () => {
        const maxMatchCount = Math.max(...bracket.groups.map(g => g.matches.length));
        const cardHeight = 90; // 高さを縮小
        const cardGap = 20; // ギャップも縮小
        const headerHeight = 44;
        const paddingBottom = 150; // 下部パディングを増加
        
        // 3位決定戦の位置を考慮した高さ計算
        const thirdPlaceGroup = bracket.groups.find(g => g.groupName.includes('3位決定戦'));
        let adjustedHeight = headerHeight + (maxMatchCount * cardHeight) + ((maxMatchCount - 1) * cardGap) + paddingBottom + 200;
        
        if (thirdPlaceGroup) {
          // 3位決定戦がある場合、さらに高さを追加
          adjustedHeight += 300; // 3位決定戦用の追加高さ
        }
        
        const minHeight = Math.max(adjustedHeight, 900); // 最小高さを900pxに設定

        return `
        <div style="
          width: 800px; 
          height: 1100px; 
          font-family: Arial, sans-serif; 
          background: white; 
          padding: 20px;
          box-sizing: border-box;
          overflow: visible;
        ">
          <div style="text-align: center; margin-bottom: 20px; border-bottom: 2px solid #333; padding-bottom: 10px;">
            <h1 style="font-size: 18px; margin: 0;">${tournamentName} - 決勝トーナメント表</h1>
          </div>
          
          <div style="
            position: relative;
            background: white;
            border: 1px solid #d1d5db;
            border-radius: 8px;
            padding: 24px;
            box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
            overflow-x: auto;
            min-height: ${minHeight}px;
          ">
            <div style="
              position: relative;
              display: grid;
              grid-template-columns: repeat(${bracket.columnCount}, minmax(120px, 1fr));
              gap: 20px;
              min-width: ${bracket.columnCount * 140 + (bracket.columnCount - 1) * 20}px;
              min-height: ${minHeight}px;
            " id="bracket-container">
              
              <!-- SVG接続線 -->
              <svg style="
                position: absolute; 
                top: 0; 
                left: 0; 
                width: 100%; 
                height: 100%; 
                pointer-events: none; 
                z-index: 1;
              " id="connection-lines">
              </svg>

              ${bracket.groups.map((group, groupIndex) => {
                // グループごとの色を決定
                const getGroupColor = (groupName: string) => {
                  if (groupName.includes('準々決勝')) return 'background: #dbeafe; color: #1e40af;';
                  if (groupName.includes('準決勝')) return 'background: #e9d5ff; color: #7c3aed;';
                  if (groupName.includes('3位決定戦')) return 'background: #fef3c7; color: #d97706;';
                  if (groupName.includes('決勝')) return 'background: #fee2e2; color: #dc2626;';
                  return 'background: #f3f4f6; color: #374151;';
                };

                return `
                  <div style="z-index: 2;">
                    <h3 style="
                      font-size: 14px; 
                      font-weight: 500; 
                      padding: 6px 12px; 
                      border-radius: 9999px; 
                      text-align: center; 
                      letter-spacing: 0.025em; 
                      margin-bottom: 24px; 
                      ${getGroupColor(group.groupName)}
                    ">
                      ${group.groupName}
                    </h3>
                    
                    ${groupIndex === 0 ? `
                      <!-- 最初のグループ（準々決勝など）は通常配置 -->
                      <div style="display: flex; flex-direction: column; gap: 24px;">
                        ${group.matches.map((match, matchIndex) => {
                          return generateMatchCard(match, `G${group.groupId}M${matchIndex + 1}`);
                        }).join('')}
                      </div>
                    ` : `
                      <!-- 後続のグループは前のグループのカードの中央に配置 -->
                      <div style="position: relative;">
                        ${group.matches.map((match, matchIndex) => {
                          let topMargin = 0;
                          
                          // 決勝と3位決定戦の場合は特別な位置計算
                          if (group.groupName === '決勝' || group.groupName === '3位決定戦') {
                            // 準決勝グループ（T5, T6）を探す
                            const semiFinalGroup = bracket.groups.find(g => g.groupName.includes('準決勝'));
                            
                            if (semiFinalGroup && semiFinalGroup.matches.length >= 2) {
                              const quarterFinalGroup = bracket.groups.find(g => g.groupName.includes('準々決勝'));
                              let semiFinalBaseY = 0;
                              
                              if (quarterFinalGroup && quarterFinalGroup.matches.length >= 2) {
                                const actualGap = 24;
                                const qf1CenterY = (cardHeight / 2);
                                const qf2CenterY = cardHeight + actualGap + (cardHeight / 2);
                                const qfCenterY = (qf1CenterY + qf2CenterY) / 2;
                                semiFinalBaseY = qfCenterY - (cardHeight / 2);
                              }
                              
                              const t5TopMargin = semiFinalBaseY;
                              const t6TopMargin = semiFinalBaseY + cardHeight + cardGap;
                              const t5CenterY = t5TopMargin + (cardHeight / 2);
                              const t6CenterY = t6TopMargin + (cardHeight / 2);
                              const semiFinalCenterY = (t5CenterY + t6CenterY) / 2;
                              
                              if (group.groupName === '決勝') {
                                const fineAdjustment = 20;
                                topMargin = semiFinalCenterY - (cardHeight / 2) + fineAdjustment;
                              } else if (group.groupName === '3位決定戦') {
                                const semiFinalHeight = t6CenterY - t5CenterY;
                                const dynamicSeparationOffset = Math.max(
                                  semiFinalHeight * 0.8,
                                  120
                                );
                                topMargin = t6CenterY + (cardHeight / 2) + dynamicSeparationOffset;
                              }
                            } else {
                              const prevGroup = bracket.groups[groupIndex - 1];
                              const matchesPerGroup = Math.ceil(prevGroup.matches.length / group.matches.length);
                              const startIdx = matchIndex * matchesPerGroup;
                              const endIdx = Math.min(startIdx + matchesPerGroup, prevGroup.matches.length);
                              const avgPosition = (startIdx + endIdx - 1) / 2;
                              const centerPosition = headerHeight + (cardHeight / 2) + (avgPosition * (cardHeight + cardGap));
                              topMargin = centerPosition - headerHeight - (cardHeight / 2);
                            }
                          } else {
                            const prevGroup = bracket.groups[groupIndex - 1];
                            const matchesPerGroup = Math.ceil(prevGroup.matches.length / group.matches.length);
                            const startIdx = matchIndex * matchesPerGroup;
                            const endIdx = Math.min(startIdx + matchesPerGroup, prevGroup.matches.length);
                            const avgPosition = (startIdx + endIdx - 1) / 2;
                            const centerPosition = headerHeight + (cardHeight / 2) + (avgPosition * (cardHeight + cardGap));
                            topMargin = centerPosition - headerHeight - (cardHeight / 2);
                          }
                          
                          return `
                            <div style="
                              position: absolute; 
                              width: 100%; 
                              top: ${topMargin}px;
                            ">
                              ${generateMatchCard(match, `G${group.groupId}M${matchIndex + 1}`)}
                            </div>
                          `;
                        }).join('')}
                      </div>
                    `}
                  </div>
                `;
              }).join('')}

            </div>
          </div>
          
          <div style="
            position: absolute; 
            bottom: 10px; 
            left: 50%; 
            transform: translateX(-50%); 
            font-size: 8px; 
            color: #666;
          ">
            <span style="margin-right: 15px;">🟢 勝利</span>
            <span>🔴 敗北</span>
          </div>
        </div>
        `;
      };

      // チーム名のフォントサイズを動的に決定する関数
      const getTeamNameFontSize = (teamName: string) => {
        const length = teamName.length;
        if (length <= 8) return '12px';
        if (length <= 12) return '11px';
        if (length <= 16) return '10px';
        return '9px';
      };

      // マッチカードを生成する関数
      const generateMatchCard = (match: BracketMatch, dataMatch: string) => {
        const getWinnerTeam = () => {
          if (!match.winner_team_id || !match.is_confirmed) return null;
          if (match.winner_team_id === match.team1_id) return 0;
          if (match.winner_team_id === match.team2_id) return 1;
          return null;
        };

        const hasResult = match.is_confirmed && (
          match.team1_goals !== null || 
          match.team2_goals !== null || 
          match.is_draw || 
          match.is_walkover
        );

        const winnerIndex = getWinnerTeam();

        // 試合コードからブロック色を取得
        const getMatchCodeColor = (matchCode: string) => {
          if (['T1', 'T2', 'T3', 'T4'].includes(matchCode)) return 'background: #dbeafe; color: #1e40af; border: 1px solid #93c5fd;';
          if (['T5', 'T6'].includes(matchCode)) return 'background: #e9d5ff; color: #7c3aed; border: 1px solid #c4b5fd;';
          if (matchCode === 'T7') return 'background: #fef3c7; color: #d97706; border: 1px solid #fcd34d;';
          if (matchCode === 'T8') return 'background: #fee2e2; color: #dc2626; border: 1px solid #fca5a5;';
          return 'background: #f3f4f6; color: #374151; border: 1px solid #d1d5db;';
        };

        return `
          <div data-match="${dataMatch}" style="
            position: relative; 
            background: white; 
            border: 1px solid #d1d5db; 
            border-radius: 8px; 
            padding: 12px; 
            box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
            height: fit-content;
          ">
            <!-- 試合コード -->
            <div style="
              position: absolute; 
              top: -8px; 
              left: 50%; 
              transform: translateX(-50%);
              padding: 4px 8px; 
              border-radius: 9999px; 
              font-size: 12px; 
              font-weight: 500;
              ${getMatchCodeColor(match.match_code)}
            ">
              ${match.match_code}
            </div>
            
            <!-- チーム1 -->
            <div style="
              display: flex; 
              align-items: center; 
              justify-content: space-between; 
              height: 28px; 
              padding: 0 12px; 
              margin-bottom: 8px; 
              border: 1px solid #d1d5db; 
              border-radius: 4px; 
              cursor: default; 
              transition: all 0.2s;
              ${winnerIndex === 0 ? 
                'background: #f0fdf4; color: #16a34a; border-color: #bbf7d0; font-weight: 500;' : 
                hasResult && winnerIndex === 1 ? 
                'background: #fef2f2; color: #dc2626; border-color: #fecaca;' : 
                hasResult && match.is_draw ? 
                'background: #eff6ff; color: #2563eb; border-color: #bfdbfe;' : 
                'background: #f9fafb; color: #374151;'
              }
            ">
              <span style="
                font-size: ${getTeamNameFontSize(match.team1_display_name || '未確定')}; 
                overflow: hidden; 
                text-overflow: ellipsis; 
                white-space: nowrap; 
                flex: 1;
                vertical-align: middle;
                line-height: 28px;
              ">
                ${winnerIndex === 0 && hasResult ? '👑 ' : ''}${match.team1_display_name || '未確定'}
              </span>
              ${hasResult && !match.is_draw ? `
                <span style="font-size: 12px; font-weight: bold; margin-left: 8px; vertical-align: middle; line-height: 28px;">
                  ${match.team1_goals}
                </span>
              ` : ''}
              ${hasResult && match.is_draw ? `
                <span style="font-size: 12px; font-weight: bold; margin-left: 8px; color: #2563eb; vertical-align: middle; line-height: 28px;">
                  ${match.team1_goals}
                </span>
              ` : ''}
            </div>

            <!-- チーム2 -->
            <div style="
              display: flex; 
              align-items: center; 
              justify-content: space-between; 
              height: 28px; 
              padding: 0 12px; 
              border: 1px solid #d1d5db; 
              border-radius: 4px; 
              cursor: default; 
              transition: all 0.2s;
              ${winnerIndex === 1 ? 
                'background: #f0fdf4; color: #16a34a; border-color: #bbf7d0; font-weight: 500;' : 
                hasResult && winnerIndex === 0 ? 
                'background: #fef2f2; color: #dc2626; border-color: #fecaca;' : 
                hasResult && match.is_draw ? 
                'background: #eff6ff; color: #2563eb; border-color: #bfdbfe;' : 
                'background: #f9fafb; color: #374151;'
              }
            ">
              <span style="
                font-size: ${getTeamNameFontSize(match.team2_display_name || '未確定')}; 
                overflow: hidden; 
                text-overflow: ellipsis; 
                white-space: nowrap; 
                flex: 1;
                vertical-align: middle;
                line-height: 28px;
              ">
                ${winnerIndex === 1 && hasResult ? '👑 ' : ''}${match.team2_display_name || '未確定'}
              </span>
              ${hasResult && !match.is_draw ? `
                <span style="font-size: 12px; font-weight: bold; margin-left: 8px; vertical-align: middle; line-height: 28px;">
                  ${match.team2_goals}
                </span>
              ` : ''}
              ${hasResult && match.is_draw ? `
                <span style="font-size: 12px; font-weight: bold; margin-left: 8px; color: #2563eb; vertical-align: middle; line-height: 28px;">
                  ${match.team2_goals}
                </span>
              ` : ''}
            </div>

          </div>
        `;
      };

      // 一時的な要素を作成してPDF化
      const tempElement = document.createElement('div');
      tempElement.innerHTML = generatePdfContent();
      tempElement.style.position = 'absolute';
      tempElement.style.left = '-9999px';
      tempElement.style.top = '0';
      document.body.appendChild(tempElement);

      // 少し待ってからレンダリング（レイアウト確定のため）
      await new Promise(resolve => setTimeout(resolve, 100));

      // 接続線描画の復活
      const svgElement = tempElement.querySelector('#connection-lines') as SVGElement;
      if (svgElement && bracket.groups.length > 1) {
        // DOM要素を取得
        const container = tempElement.children[0] as HTMLElement;
        
        // 固定レイアウトベースの座標計算（PDF用）
        const getCardPosition = (groupIndex: number, matchIndex: number) => {
          const cardWidth = 120;
          const cardHeight = 90;
          const gap = 20;
          const headerHeight = 44;
          const padding = 24;
          
          // グループの基準X座標
          const baseX = padding + (groupIndex * (cardWidth + gap));
          
          // 決勝・3位決定戦の特別な位置計算
          if (groupIndex === 3) { // 決勝グループ
            // 準決勝の中間位置に配置
            const semiFinalY1 = padding + headerHeight + (0 * (cardHeight + gap));
            const semiFinalY2 = padding + headerHeight + (1 * (cardHeight + gap));
            const baseY = (semiFinalY1 + semiFinalY2) / 2;
            return { x: baseX, y: baseY, width: cardWidth, height: cardHeight };
          } else if (groupIndex === 2) { // 3位決定戦グループ
            // 準決勝より下に配置（準決勝の下端から適切な間隔）
            const semiFinalBottomY = padding + headerHeight + (1 * (cardHeight + gap)) + cardHeight;
            const baseY = semiFinalBottomY + gap * 2; // 十分な間隔を確保
            return { x: baseX, y: baseY, width: cardWidth, height: cardHeight };
          } else {
            // 通常の配置
            const baseY = padding + headerHeight + (matchIndex * (cardHeight + gap));
            return { x: baseX, y: baseY, width: cardWidth, height: cardHeight };
          }
        };
        
        const midRight = (groupIndex: number, matchIndex: number) => {
          const pos = getCardPosition(groupIndex, matchIndex);
          return { x: pos.x + pos.width, y: pos.y + pos.height / 2 };
        };
        
        const midLeft = (groupIndex: number, matchIndex: number) => {
          const pos = getCardPosition(groupIndex, matchIndex);
          return { x: pos.x, y: pos.y + pos.height / 2 };
        };
        
        // トーナメント形式の線を描画する関数
        const addTournamentBracket = (group1Index: number, match1Index: number, match2Index: number, targetGroupIndex: number, targetMatchIndex: number, isDashed = false) => {
          const p1 = midRight(group1Index, match1Index);  // 第1試合の右端
          const p2 = midRight(group1Index, match2Index);  // 第2試合の右端
          const p3 = midLeft(targetGroupIndex, targetMatchIndex);  // ターゲット試合の左端
          
          console.log(`PDF線描画: グループ${group1Index}の試合${match1Index},${match2Index} → グループ${targetGroupIndex}の試合${targetMatchIndex}`);
          console.log(`座標: p1(${p1.x},${p1.y}) p2(${p2.x},${p2.y}) p3(${p3.x},${p3.y})`);
          
          // 中間点を計算（トーナメントブラケット形式）
          const gapBetweenCards = p3.x - p1.x; // カード間の距離
          const midX = p1.x + (gapBetweenCards * 0.6); // カード間の60%の位置
          const midY = (p1.y + p2.y) / 2;  // 2試合の中間Y座標
          
          console.log(`中間点: midX=${midX}, midY=${midY}`);
          
          // トーナメント形式の線を分割して描画
          // 1. T1からコの字部分
          const path1 = document.createElementNS('http://www.w3.org/2000/svg', 'path');
          const d1 = `M ${p1.x} ${p1.y} L ${midX} ${p1.y} L ${midX} ${midY}`;
          path1.setAttribute('d', d1);
          path1.setAttribute('stroke', '#999');
          path1.setAttribute('stroke-width', '2');
          path1.setAttribute('fill', 'none');
          svgElement.appendChild(path1);
          
          // 2. T2からコの字部分
          const path2 = document.createElementNS('http://www.w3.org/2000/svg', 'path');
          const d2 = `M ${p2.x} ${p2.y} L ${midX} ${p2.y} L ${midX} ${midY}`;
          path2.setAttribute('d', d2);
          path2.setAttribute('stroke', '#999');
          path2.setAttribute('stroke-width', '2');
          path2.setAttribute('fill', 'none');
          svgElement.appendChild(path2);
          
          // 3. コの字中央からターゲットへ
          const path3 = document.createElementNS('http://www.w3.org/2000/svg', 'path');
          const d3 = `M ${midX} ${midY} L ${p3.x} ${p3.y}`;
          path3.setAttribute('d', d3);
          path3.setAttribute('stroke', '#999');
          path3.setAttribute('stroke-width', '2');
          path3.setAttribute('fill', 'none');
          svgElement.appendChild(path3);
        };
        
        // 単純な直線を描画する関数
        const addSinglePath = (fromGroupIndex: number, fromMatchIndex: number, toGroupIndex: number, toMatchIndex: number, isDashed = false) => {
          const p1 = midRight(fromGroupIndex, fromMatchIndex);
          const p2 = midLeft(toGroupIndex, toMatchIndex);
          
          // 直線の接続線
          const midX = p1.x + ((p2.x - p1.x) * 0.5);
          const d = `M ${p1.x} ${p1.y} L ${midX} ${p1.y} L ${midX} ${p2.y} L ${p2.x} ${p2.y}`;
          
          const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
          path.setAttribute('d', d);
          path.setAttribute('stroke', '#999');
          path.setAttribute('stroke-width', '2');
          path.setAttribute('fill', 'none');
          if (isDashed) {
            path.setAttribute('stroke-dasharray', '5,5');
          }
          
          svgElement.appendChild(path);
        };
        
        // 現在のページと同じ接続線パターンを使用
        // data-matchの形式で接続線を描画
        
        // 準々決勝 → 準決勝（グループ別の接続）
        const quarterFinalGroup = bracket.groups.find(g => g.groupName.includes('準々決勝'));
        const semiFinalGroup = bracket.groups.find(g => g.groupName.includes('準決勝'));
        const thirdPlaceGroup = bracket.groups.find(g => g.groupName.includes('3位決定戦'));
        const finalGroup = bracket.groups.find(g => g.groupName === '決勝');
        
        // 正しいトーナメント形式の線描画
        
        // 準々決勝 → 準決勝（トーナメントブラケット形式）
        // デバッグ: ブラケット構造を確認
        console.log('Bracket groups for PDF:', bracket.groups.map((g, i) => ({
          groupIndex: i, 
          groupName: g.groupName,
          matches: g.matches.map((m, j) => ({ matchIndex: j, matchCode: m.match_code }))
        })));
        
        addTournamentBracket(0, 0, 1, 1, 0);  // T1(0),T2(1) → T5(group1,match0)
        addTournamentBracket(0, 2, 3, 1, 1);  // T3(2),T4(3) → T6(group1,match1)
        
        // 準決勝 → 決勝（トーナメントブラケット形式）
        addTournamentBracket(1, 0, 1, 3, 0);  // T5,T6 → T8
        
        // 準決勝 → 3位決定戦（点線、単純な接続）
        addSinglePath(1, 0, 2, 0, true);  // T5 → T7（点線）
        addSinglePath(1, 1, 2, 0, true);  // T6 → T7（点線）
        
        // SVGサイズを設定
        svgElement.setAttribute('width', '100%');
        svgElement.setAttribute('height', '100%');
      }

      // html2canvasでキャプチャ - A4縦向き用サイズ指定
      const canvas = await html2canvas(tempElement, {
        scale: 1,
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#ffffff',
        width: 800,
        height: 1100
      });

      const imgData = canvas.toDataURL('image/png');
      
      // A4横向きに強制フィット
      pdf.addImage(imgData, 'PNG', 0, 0, pageWidth, pageHeight);

      // 一時要素を削除
      document.body.removeChild(tempElement);

      // PDFをダウンロード
      const fileName = `トーナメント表_${tournamentName.replace(/[\/\\:*?"<>|]/g, '')}_${new Date().toISOString().slice(0, 10)}.pdf`;
      pdf.save(fileName);

    } catch (error) {
      console.error('PDFダウンロードエラー:', error);
      alert('PDFのダウンロードに失敗しました。再度お試しください。');
    } finally {
      setDownloadingPdf(false);
    }
  };

  // トーナメント構造を整理（execution_group基準）
  const organizeBracket = (matches: BracketMatch[]): BracketStructure => {
    
    // execution_groupがない場合のフォールバック: 従来のロジック使用
    const hasExecutionGroup = matches.some(m => m.execution_group !== null && m.execution_group !== undefined);
    
    if (!hasExecutionGroup) {
      // フォールバック: 従来の試合コードベースのグループ化
      const groups: BracketGroup[] = [];
      const quarterFinals = matches.filter(m => ['T1', 'T2', 'T3', 'T4'].includes(m.match_code));
      const semiFinals = matches.filter(m => ['T5', 'T6'].includes(m.match_code));
      const thirdPlace = matches.find(m => m.match_code === 'T7');
      const final = matches.find(m => m.match_code === 'T8');
      
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
      // 試合コードから判定
      if (matches.some(m => ['T1', 'T2', 'T3', 'T4'].includes(m.match_code))) return '準々決勝';
      if (matches.some(m => ['T5', 'T6'].includes(m.match_code))) return '準決勝';
      if (matches.some(m => m.match_code === 'T7')) return '3位決定戦';
      if (matches.some(m => m.match_code === 'T8')) return '決勝';
      
      // フォールバック: 試合数から推測
      if (matchCount >= 4) return '準々決勝';
      if (matchCount === 2) return '準決勝';
      if (matchCount === 1) {
        const hasThirdPlace = matches.some(m => m.match_code === 'T7');
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

  if (loading) {
    return (
      <div className="flex justify-center items-center py-16">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        <span className="ml-3 text-gray-600">トーナメント表を読み込み中...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-16">
        <Trophy className="h-16 w-16 text-gray-400 mx-auto mb-4" />
        <p className="text-gray-600 text-lg mb-2">{error}</p>
        <p className="text-gray-500 text-sm">この大会は予選リーグ戦のみで構成されています。</p>
      </div>
    );
  }

  const bracket = organizeBracket(matches);

  return (
    <div className="space-y-6">
      {/* ヘッダー */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center">
              <Trophy className="h-5 w-5 mr-2 text-yellow-600" />
              決勝トーナメント
            </div>
            <Button
              onClick={handleDownloadPdf}
              disabled={downloadingPdf}
              variant="outline"
              size="sm"
              className="flex items-center gap-2"
            >
              <Download className="h-4 w-4" />
              {downloadingPdf ? 'PDF生成中...' : 'PDFダウンロード'}
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-gray-600">各ブロック上位2チームによるトーナメント表</p>
        </CardContent>
      </Card>

      {/* トーナメントブラケット */}
      <div className="relative bg-white border border-gray-300 rounded-lg p-6 shadow-sm overflow-x-auto">
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
              return 'bg-gray-100 text-gray-800';
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

      {/* 注意事項 */}
      <Card className="bg-blue-50 border-blue-200 mt-8">
        <CardContent className="pt-4">
          <div className="flex items-start space-x-3">
            <div className="flex-shrink-0 mt-0.5">
              <div className="h-2 w-2 bg-blue-400 rounded-full"></div>
            </div>
            <div className="text-sm text-blue-700">
              <p className="font-medium mb-1">トーナメント表の見方</p>
              <ul className="list-disc list-inside space-y-1 text-blue-600">
                <li>実線は勝利チームの勝ち上がり、点線は敗者の進出先（3位決定戦）</li>
                <li>太字は勝利チーム、数字は得点を表示</li>
                <li>［T1］などは試合コードを表示</li>
                <li>各ブロック上位2チームが決勝トーナメントに進出</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}