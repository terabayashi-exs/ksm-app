'use client';

import { useState, useEffect, useRef } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Trophy } from 'lucide-react';

interface BracketMatch {
  match_id: number;
  match_code: string;
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
}

interface BracketProps {
  tournamentId: number;
}

interface BracketStructure {
  quarterFinals: BracketMatch[];
  semiFinals: BracketMatch[];
  thirdPlace?: BracketMatch;
  final?: BracketMatch;
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
    if (!match.winner_team_id) return null;
    return match.winner_team_id === match.team1_display_name ? 0 : 1;
  };

  // 試合コードからブロック色を取得
  const getMatchCodeColor = (matchCode: string): string => {
    if (['T1', 'T2', 'T3', 'T4'].includes(matchCode)) return 'bg-blue-100 text-blue-800'; // 準々決勝
    if (['T5', 'T6'].includes(matchCode)) return 'bg-purple-100 text-purple-800'; // 準決勝
    if (matchCode === 'T7') return 'bg-yellow-100 text-yellow-800'; // 3位決定戦
    if (matchCode === 'T8') return 'bg-red-100 text-red-800'; // 決勝
    return 'bg-gray-100 text-gray-800';
  };

  const winnerIndex = getWinnerTeam();
  const hasResult = match.is_confirmed && (match.team1_goals > 0 || match.team2_goals > 0);

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
          : 'bg-gray-50 text-gray-700'
      }`}>
        <span className="text-sm truncate flex-1">
          {match.team1_display_name || '未確定'}
        </span>
        {hasResult && (
          <span className="text-sm font-bold ml-2">
            {match.team1_goals}
          </span>
        )}
      </div>

      {/* チーム2 */}
      <div className={`flex items-center justify-between h-8 px-3 border border-gray-300 rounded cursor-default transition-all ${
        winnerIndex === 1 
          ? 'bg-green-50 text-green-600 border-green-300 font-medium' 
          : 'bg-gray-50 text-gray-700'
      }`}>
        <span className="text-sm truncate flex-1">
          {match.team2_display_name || '未確定'}
        </span>
        {hasResult && (
          <span className="text-sm font-bold ml-2">
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
  const bracketRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);

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
    
    const addPath = (fromId: string, toId: string) => {
      const from = bracketElement.querySelector(`[data-match="${fromId}"]`) as HTMLElement;
      const to = bracketElement.querySelector(`[data-match="${toId}"]`) as HTMLElement;
      
      if (!from || !to) return;
      
      const p1 = midRight(from);
      const p2 = midLeft(to);
      const dx = Math.max(30, (p2.x - p1.x) * 0.5);
      const d = `M ${p1.x} ${p1.y} C ${p1.x + dx} ${p1.y}, ${p2.x - dx} ${p2.y}, ${p2.x} ${p2.y}`;
      
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', d);
      path.setAttribute('stroke', '#9ca3af'); // gray-400
      path.setAttribute('stroke-width', '2');
      path.setAttribute('fill', 'transparent');
      
      svg.appendChild(path);
    };
    
    // 接続線を描画
    addPath('QF1', 'SF1');
    addPath('QF2', 'SF1');
    addPath('QF3', 'SF2');
    addPath('QF4', 'SF2');
    addPath('SF1', 'F');
    addPath('SF2', 'F');
    addPath('SF1', 'T');
    addPath('SF2', 'T');
    
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

  // トーナメント構造を整理
  const organizeBracket = (matches: BracketMatch[]): BracketStructure => {
    const bracket: BracketStructure = {
      quarterFinals: [],
      semiFinals: [],
    };

    matches.forEach(match => {
      const matchCode = match.match_code;
      
      if (['T1', 'T2', 'T3', 'T4'].includes(matchCode)) {
        bracket.quarterFinals.push(match);
      } else if (['T5', 'T6'].includes(matchCode)) {
        bracket.semiFinals.push(match);
      } else if (matchCode === 'T7') {
        bracket.thirdPlace = match;
      } else if (matchCode === 'T8') {
        bracket.final = match;
      }
    });

    bracket.quarterFinals.sort((a, b) => a.match_code.localeCompare(b.match_code));
    bracket.semiFinals.sort((a, b) => a.match_code.localeCompare(b.match_code));

    return bracket;
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
      <div className="text-center">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">決勝トーナメント</h2>
        <p className="text-gray-600">各ブロック上位2チームによるトーナメント表</p>
      </div>

      {/* トーナメントブラケット */}
      <div className="relative bg-white border border-gray-300 rounded-lg p-6 shadow-sm overflow-x-auto">
        <div 
          ref={bracketRef}
          className="relative grid grid-cols-5 gap-7 min-w-fit"
          style={{ minWidth: '1100px' }}
        >
          {/* SVG接続線 */}
          <svg 
            ref={svgRef}
            className="absolute inset-0 pointer-events-none" 
            style={{ zIndex: 1 }}
          />

          {/* 準々決勝 */}
          <div style={{ zIndex: 2 }}>
            <h3 className="text-sm font-medium text-blue-800 bg-blue-100 px-3 py-1 rounded-full text-center tracking-wide mb-6">準々決勝</h3>
            <div className="space-y-6">
              {bracket.quarterFinals.map((match) => (
                <MatchCard 
                  key={match.match_id} 
                  match={match}
                  className="h-fit"
                  data-match={`QF${bracket.quarterFinals.indexOf(match) + 1}`}
                />
              ))}
            </div>
          </div>

          {/* 準決勝 */}
          <div style={{ zIndex: 2 }}>
            <h3 className="text-sm font-medium text-purple-800 bg-purple-100 px-3 py-1 rounded-full text-center tracking-wide mb-6">準決勝</h3>
            <div className="space-y-32">
              {bracket.semiFinals.map((match, index) => (
                <div 
                  key={match.match_id}
                  className={index === 0 ? "mt-20" : "mt-0"}
                >
                  <MatchCard 
                    match={match}
                    className="h-fit"
                    data-match={`SF${index + 1}`}
                  />
                </div>
              ))}
            </div>
          </div>

          {/* 3位決定戦 */}
          <div style={{ zIndex: 2 }}>
            <h3 className="text-sm font-medium text-yellow-800 bg-yellow-100 px-3 py-1 rounded-full text-center tracking-wide mb-6">3位決定戦</h3>
            {bracket.thirdPlace && (
              <div className="mt-44">
                <MatchCard 
                  match={bracket.thirdPlace}
                  className="h-fit"
                  data-match="T"
                />
              </div>
            )}
          </div>

          {/* 決勝 */}
          <div style={{ zIndex: 2 }}>
            <h3 className="text-sm font-medium text-red-800 bg-red-100 px-3 py-1 rounded-full text-center tracking-wide mb-6">決勝</h3>
            {bracket.final && (
              <div className="mt-44">
                <MatchCard 
                  match={bracket.final}
                  className="h-fit"
                  data-match="F"
                />
              </div>
            )}
          </div>

          {/* 空のカラム（バランス用） */}
          <div></div>

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