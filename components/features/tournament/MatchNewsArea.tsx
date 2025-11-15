'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Clock, CheckCircle, AlertTriangle, Zap } from 'lucide-react';

interface MatchNewsData {
  match_id: number;
  match_code: string;
  team1_display_name: string;
  team2_display_name: string;
  team1_goals: number | null;
  team2_goals: number | null;
  score_display?: string | null; // PK戦を考慮したスコア表示
  winner_team_id: string | null;
  team1_id: string | null;
  team2_id: string | null;
  is_draw: boolean;
  is_walkover: boolean;
  match_status: string;
  has_result: boolean;
  phase: string;
  block_name: string | null;
  court_number: number | null;
  start_time: string | null;
  end_time: string | null;
  updated_at: string;
}

interface MatchNewsAreaProps {
  tournamentId: number;
}

export default function MatchNewsArea({ tournamentId }: MatchNewsAreaProps) {
  const [newsMatches, setNewsMatches] = useState<MatchNewsData[]>([]);
  const [loading, setLoading] = useState(true);

  // 速報データの取得
  useEffect(() => {
    const fetchNewsMatches = async () => {
      setLoading(true);
      try {
        const response = await fetch(`/api/tournaments/${tournamentId}/match-news`, {
          cache: 'no-store'
        });

        if (response.ok) {
          const result = await response.json();
          if (result.success) {
            setNewsMatches(result.data);
          }
        }
      } catch (error) {
        console.error('速報データ取得エラー:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchNewsMatches();
    
    // 30秒ごとに更新
    const interval = setInterval(fetchNewsMatches, 30000);
    
    return () => clearInterval(interval);
  }, [tournamentId]);

  // 試合の表示スタイルを取得
  const getMatchStyle = (match: MatchNewsData) => {
    if (match.match_status === 'ongoing') {
      return {
        container: 'border-l-4 border-red-500 bg-gradient-to-r from-red-50 to-red-100',
        badge: 'bg-red-500 text-white animate-pulse',
        icon: <Zap className="h-4 w-4 text-red-600" />,
        label: 'LIVE',
        priority: 1
      };
    } else if (match.has_result) {
      return {
        container: 'border-l-4 border-blue-500 bg-gradient-to-r from-blue-50 to-blue-100',
        badge: 'bg-blue-500 text-white',
        icon: <CheckCircle className="h-4 w-4 text-blue-600" />,
        label: '終了',
        priority: 2
      };
    } else if (match.match_status === 'completed') {
      return {
        container: 'border-l-4 border-purple-500 bg-gradient-to-r from-purple-50 to-purple-100',
        badge: 'bg-purple-500 text-white',
        icon: <AlertTriangle className="h-4 w-4 text-purple-600" />,
        label: '結果待ち',
        priority: 3
      };
    }
    
    return {
      container: 'border-l-4 border-gray-500 bg-gradient-to-r from-gray-50 to-gray-100',
      badge: 'bg-gray-500 text-white',
      icon: <Clock className="h-4 w-4 text-gray-600" />,
      label: '予定',
      priority: 4
    };
  };

  // 試合結果の表示
  const getMatchResult = (match: MatchNewsData) => {
    if (match.match_status === 'ongoing') {
      // 進行中の場合、フォーマット済みスコアがあればそれを使用、なければ個別スコア
      if (match.score_display) {
        return match.score_display;
      }
      if (match.team1_goals !== null && match.team2_goals !== null) {
        return `${match.team1_goals} - ${match.team2_goals}`;
      }
      return '進行中';
    }
    
    // 試合終了済みで、スコアが入力されている場合
    if (match.match_status === 'completed' && (match.score_display || (match.team1_goals !== null && match.team2_goals !== null))) {
      if (match.is_walkover) {
        return '不戦勝';
      }
      
      // フォーマット済みスコア表示があればそれを優先（PK戦考慮済み）
      if (match.score_display) {
        if (match.is_draw) {
          return `${match.score_display} (引分)`;
        }
        return match.score_display;
      }
      
      // フォールバック: 従来の表示方式
      if (match.is_draw) {
        return `${match.team1_goals} - ${match.team2_goals} (引分)`;
      }
      
      return `${match.team1_goals} - ${match.team2_goals}`;
    }
    
    if (!match.has_result) {
      return match.match_status === 'completed' ? '結果入力中' : '試合前';
    }

    if (match.is_walkover) {
      return '不戦勝';
    }

    // 結果があるがスコアがnullの場合のチェック
    if (!match.score_display && (match.team1_goals === null || match.team2_goals === null)) {
      return '結果確認中';
    }

    // フォーマット済みスコア表示があればそれを使用
    if (match.score_display) {
      if (match.is_draw) {
        return `${match.score_display} (引分)`;
      }
      return match.score_display;
    }

    // フォールバック: 従来の表示方式
    if (match.is_draw) {
      return `${match.team1_goals} - ${match.team2_goals} (引分)`;
    }

    return `${match.team1_goals} - ${match.team2_goals}`;
  };

  // 勝者の判定
  const getWinnerDisplay = (match: MatchNewsData) => {
    if (!match.has_result || match.is_draw || match.match_status === 'ongoing') {
      return {
        team1Style: 'text-gray-900',
        team2Style: 'text-gray-900'
      };
    }

    const winnerIsTeam1 = match.winner_team_id === match.team1_id;
    return {
      team1Style: winnerIsTeam1 ? 'text-green-700 font-bold' : 'text-gray-600',
      team2Style: winnerIsTeam1 ? 'text-gray-600' : 'text-green-700 font-bold'
    };
  };

  // ブロック色の取得
  const getBlockColor = (match: MatchNewsData): string => {
    if (match.phase === 'final') return 'bg-red-100 text-red-800';
    if (match.block_name === 'A') return 'bg-blue-100 text-blue-800';
    if (match.block_name === 'B') return 'bg-green-100 text-green-800';
    if (match.block_name === 'C') return 'bg-yellow-100 text-yellow-800';
    if (match.block_name === 'D') return 'bg-purple-100 text-purple-800';
    return 'bg-gray-100 text-gray-800';
  };

  // 時間の表示
  const getTimeDisplay = (match: MatchNewsData): string => {
    if (match.match_status === 'ongoing' || !match.end_time) {
      return match.start_time ? match.start_time.substring(0, 5) : '--:--';
    }
    
    // 終了時刻を表示
    const endTime = new Date(match.end_time);
    const now = new Date();
    const diffMinutes = Math.floor((now.getTime() - endTime.getTime()) / (1000 * 60));
    
    if (diffMinutes < 60) {
      return `${diffMinutes}分前終了`;
    }
    
    return match.end_time.substring(0, 5) + ' 終了';
  };

  if (loading) {
    return (
      <Card className="mb-6">
        <CardContent className="py-4">
          <div className="flex items-center space-x-2">
            <Clock className="h-4 w-4 animate-spin text-blue-600" />
            <span className="text-sm text-gray-600">速報を読み込み中...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (newsMatches.length === 0) {
    return null; // 速報がない場合は非表示
  }

  // 優先度順にソート（進行中 → 終了 → 結果待ち）
  const sortedMatches = newsMatches
    .map(match => ({ ...match, style: getMatchStyle(match) }))
    .sort((a, b) => {
      if (a.style.priority !== b.style.priority) {
        return a.style.priority - b.style.priority;
      }
      // 同じ優先度内では更新時刻の新しい順
      return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
    })
    .slice(0, 6); // 最大6件

  return (
    <Card className="mb-6 border-orange-200 bg-gradient-to-r from-orange-50 to-red-50">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center text-lg font-bold text-orange-800">
          <span className="mr-2 text-xl">📢</span>
          試合速報
          <span className="ml-2 text-sm font-normal text-orange-600">
            （進行中・直近30分）
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="space-y-3">
          {sortedMatches.map((matchWithStyle) => {
            const match = matchWithStyle;
            const style = matchWithStyle.style;
            const winnerDisplay = getWinnerDisplay(match);
            
            return (
              <div
                key={match.match_id}
                className={`p-4 rounded-lg ${style.container} transition-all duration-300 hover:shadow-md`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center space-x-3">
                    <span className={`px-2 py-1 rounded text-xs font-bold ${style.badge}`}>
                      {style.label}
                    </span>
                    <span className={`px-2 py-1 rounded text-xs font-medium ${getBlockColor(match)}`}>
                      {match.match_code}
                    </span>
                    {match.court_number && (
                      <span className="text-xs text-gray-600">
                        コート{match.court_number}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center space-x-2 text-xs text-gray-600">
                    {style.icon}
                    <span>{getTimeDisplay(match)}</span>
                  </div>
                </div>
                
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className={`text-sm ${winnerDisplay.team1Style}`}>
                      {match.team1_display_name}
                    </div>
                    <div className="text-xs text-gray-500 my-1">vs</div>
                    <div className={`text-sm ${winnerDisplay.team2Style}`}>
                      {match.team2_display_name}
                    </div>
                  </div>
                  
                  <div className="text-right">
                    <div className="text-lg font-bold text-gray-800">
                      {getMatchResult(match)}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}