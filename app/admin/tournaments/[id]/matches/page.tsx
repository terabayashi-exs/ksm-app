'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  ArrowLeft,
  Clock,
  Play,
  CheckCircle,
  XCircle,
  QrCode,
  Users,
  MapPin,
  Filter,
  Eye
} from 'lucide-react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';

interface Tournament {
  tournament_id: number;
  tournament_name: string;
}

interface MatchData {
  match_id: number;
  match_block_id: number;
  match_code: string;
  team1_name: string;
  team2_name: string;
  court_number: number;
  scheduled_time: string;
  tournament_date: string;
  match_status: 'scheduled' | 'ongoing' | 'completed' | 'cancelled';
  current_period: number;
  period_count: number;
  actual_start_time?: string;
  actual_end_time?: string;
  phase: string;
  display_round_name: string;
  block_name: string;
  match_type: string;
  block_order: number;
  team1_scores?: string | number;
  team2_scores?: string | number;
  final_team1_scores?: string;
  final_team2_scores?: string;
  is_confirmed: boolean;
}

interface MatchBlock {
  match_block_id: number;
  phase: string;
  display_round_name: string;
  block_name: string;
  match_type: string;
  block_order: number;
  matches: MatchData[];
}

type FilterType = 'all' | 'scheduled' | 'ongoing' | 'completed' | 'pending_confirmation';

export default function AdminMatchesPage() {
  const router = useRouter();
  const params = useParams();
  const tournamentId = params.id as string;
  const { data: session, status } = useSession();

  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [matches, setMatches] = useState<MatchData[]>([]);
  const [matchBlocks, setMatchBlocks] = useState<MatchBlock[]>([]);
  const [confirmingMatches, setConfirmingMatches] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterType>('all');

  // 大会情報と試合一覧取得
  useEffect(() => {
    const fetchData = async () => {
      try {
        // セッション状態をログ出力
        console.log('Session status:', status, 'Session data:', session);
        
        if (status === 'loading') {
          console.log('Session is still loading, skipping API call');
          return;
        }
        
        if (!session || session.user.role !== 'admin') {
          console.log('Not authenticated or not admin, redirecting');
          router.push('/auth/login');
          return;
        }
        // 大会情報取得
        const tournamentResponse = await fetch(`/api/tournaments/${tournamentId}`);
        const tournamentResult = await tournamentResponse.json();
        
        if (tournamentResult.success) {
          setTournament(tournamentResult.data);
        }

        // 試合一覧取得
        console.log('Fetching matches for tournament:', tournamentId);
        const matchesResponse = await fetch(`/api/tournaments/${tournamentId}/matches`, {
          method: 'GET',
          credentials: 'include', // セッション情報を含める
          headers: {
            'Content-Type': 'application/json',
          },
        });
        console.log('Matches API response status:', matchesResponse.status);
        const matchesResult = await matchesResponse.json();
        
        if (matchesResult.success) {
          console.log('Matches data from API:', matchesResult.data); // デバッグログ
          const matchesData = matchesResult.data.map((match: any) => ({
            ...match,
            is_confirmed: match.is_confirmed || !!match.final_team1_scores // APIから返される値を優先
          }));
          console.log('Processed matches data:', matchesData); // デバッグログ
          setMatches(matchesData);
          
          // match_block_id単位でグループ化
          const blocksMap = new Map<number, MatchBlock>();
          
          matchesData.forEach((match: MatchData) => {
            if (!blocksMap.has(match.match_block_id)) {
              blocksMap.set(match.match_block_id, {
                match_block_id: match.match_block_id,
                phase: match.phase,
                display_round_name: match.display_round_name,
                block_name: match.block_name,
                match_type: match.match_type,
                block_order: match.block_order,
                matches: []
              });
            }
            blocksMap.get(match.match_block_id)!.matches.push(match);
          });
          
          const blocks = Array.from(blocksMap.values())
            .sort((a, b) => a.block_order - b.block_order);
          
          setMatchBlocks(blocks);
        } else {
          console.error('Failed to fetch matches:', matchesResult.error);
        }

      } catch (error) {
        console.error('Data fetch error:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [tournamentId, session, status, router]);

  // リアルタイム更新
  useEffect(() => {
    const eventSource = new EventSource(`/api/tournaments/${tournamentId}/live-updates`);

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        
        if (data.type === 'status_update') {
          setMatches(prevMatches => 
            prevMatches.map(match => {
              const update = data.updates.find((u: any) => u.match_id === match.match_id);
              return update ? { ...match, ...update } : match;
            })
          );
        }
      } catch (error) {
        console.error('SSE parse error:', error);
      }
    };

    eventSource.onerror = (error) => {
      console.error('SSE error:', error);
    };

    return () => {
      eventSource.close();
    };
  }, [tournamentId]);

  // QRコード生成
  const generateQR = (matchId: number, matchCode: string) => {
    // 新しいタブでQRコード表示ページを開く
    const qrUrl = `/admin/matches/${matchId}/qr`;
    window.open(qrUrl, '_blank', 'width=600,height=800');
  };

  // 試合結果確定
  const confirmMatch = async (matchId: number, matchCode: string) => {
    if (!window.confirm(`${matchCode}の結果を確定しますか？\n\n確定後は結果の変更ができなくなります。`)) {
      return;
    }

    setConfirmingMatches(prev => new Set([...prev, matchId]));
    
    try {
      const response = await fetch(`/api/matches/${matchId}/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      
      const result = await response.json();
      
      if (result.success) {
        alert(`${matchCode}の結果を確定しました！`);
        
        // マッチリストを更新して確定済み状態を反映
        setMatches(prevMatches => 
          prevMatches.map(match => 
            match.match_id === matchId 
              ? { ...match, is_confirmed: true }
              : match
          )
        );
        
        setMatchBlocks(prevBlocks =>
          prevBlocks.map(block => ({
            ...block,
            matches: block.matches.map(match =>
              match.match_id === matchId
                ? { ...match, is_confirmed: true }
                : match
            )
          }))
        );
      } else {
        alert(`結果確定に失敗しました: ${result.error}`);
      }
    } catch (error) {
      console.error('Match confirmation error:', error);
      alert('結果確定中にエラーが発生しました');
    } finally {
      setConfirmingMatches(prev => {
        const newSet = new Set(prev);
        newSet.delete(matchId);
        return newSet;
      });
    }
  };

  // 勝者チーム名を取得
  const getWinnerName = (match: MatchData) => {
    // スコアがない場合は勝者なし
    if (!match.final_team1_scores && !match.final_team2_scores && !match.team1_scores && !match.team2_scores) {
      return null;
    }
    
    const team1Score = match.final_team1_scores 
      ? match.final_team1_scores.split(',').reduce((sum, score) => sum + parseInt(score || '0'), 0)
      : (match.team1_scores ? (typeof match.team1_scores === 'string' ? parseInt(match.team1_scores) : match.team1_scores) : 0);
    const team2Score = match.final_team2_scores 
      ? match.final_team2_scores.split(',').reduce((sum, score) => sum + parseInt(score || '0'), 0)
      : (match.team2_scores ? (typeof match.team2_scores === 'string' ? parseInt(match.team2_scores) : match.team2_scores) : 0);
    
    if (team1Score > team2Score) return match.team1_name;
    if (team2Score > team1Score) return match.team2_name;
    return '引き分け';
  };

  // スコアを取得
  const getScoreDisplay = (match: MatchData) => {
    if (match.is_confirmed && match.final_team1_scores && match.final_team2_scores) {
      const team1Score = match.final_team1_scores.split(',').reduce((sum, score) => sum + parseInt(score || '0'), 0);
      const team2Score = match.final_team2_scores.split(',').reduce((sum, score) => sum + parseInt(score || '0'), 0);
      return `${team1Score} - ${team2Score}`;
    } else if (match.team1_scores !== undefined && match.team2_scores !== undefined) {
      const team1Score = typeof match.team1_scores === 'string' ? parseInt(match.team1_scores) : match.team1_scores;
      const team2Score = typeof match.team2_scores === 'string' ? parseInt(match.team2_scores) : match.team2_scores;
      return `${team1Score || 0} - ${team2Score || 0}`;
    }
    return null;
  };


  // ステータス表示
  const getStatusBadge = (match: MatchData) => {
    if (match.match_status === 'completed' && !match.is_confirmed) {
      return <Badge className="bg-yellow-100 text-yellow-800 hover:bg-yellow-100">確定待ち</Badge>;
    }

    switch (match.match_status) {
      case 'scheduled':
        return <Badge variant="secondary"><Clock className="w-3 h-3 mr-1" />試合前</Badge>;
      case 'ongoing':
        return <Badge className="bg-green-600 text-white hover:bg-green-600 animate-pulse"><Play className="w-3 h-3 mr-1" />進行中</Badge>;
      case 'completed':
        return <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100"><CheckCircle className="w-3 h-3 mr-1" />完了</Badge>;
      case 'cancelled':
        return <Badge className="bg-red-100 text-red-800 hover:bg-red-100"><XCircle className="w-3 h-3 mr-1" />中止</Badge>;
      default:
        return <Badge variant="outline">不明</Badge>;
    }
  };

  // 時間表示
  const getTimeDisplay = (match: MatchData) => {
    if (match.actual_start_time && match.actual_end_time) {
      return `${new Date(match.actual_start_time).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}-${new Date(match.actual_end_time).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}`;
    } else if (match.actual_start_time) {
      return `${new Date(match.actual_start_time).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}～`;
    } else {
      return match.scheduled_time;
    }
  };

  // 日付表示
  const getDateDisplay = (tournamentDate: string): string => {
    try {
      // JSON形式かどうかチェック
      if (tournamentDate.startsWith('{')) {
        const dateObj = JSON.parse(tournamentDate);
        return dateObj[1] || dateObj['1'] || '日程未定';
      } else if (tournamentDate.match(/^\d{4}-\d{2}-\d{2}$/)) {
        // YYYY-MM-DD形式の場合、日本語形式に変換
        const date = new Date(tournamentDate);
        return date.toLocaleDateString('ja-JP', { 
          year: 'numeric', 
          month: 'numeric', 
          day: 'numeric' 
        });
      } else {
        // その他の場合はそのまま表示
        return tournamentDate;
      }
    } catch (error) {
      console.error('Date parse error:', error, 'Raw data:', tournamentDate);
      return tournamentDate || '日程未定';
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">読み込み中...</p>
        </div>
      </div>
    );
  }

  if (!tournament) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-600">大会情報が見つかりません</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ヘッダー */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between py-6">
            <div className="flex items-center space-x-4">
              <Button variant="outline" size="sm" asChild>
                <Link href="/admin" className="flex items-center">
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  ダッシュボードに戻る
                </Link>
              </Button>
              <div>
                <h1 className="text-3xl font-bold text-gray-900">試合管理</h1>
                <p className="text-sm text-gray-500 mt-1">
                  「{tournament.tournament_name}」の試合進行状況管理
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* フィルター */}
        <Card className="mb-6">
          <CardContent className="p-4">
            <div className="flex items-center space-x-2 flex-wrap gap-2">
              <Filter className="w-4 h-4 text-gray-600" />
              <Button
                variant={filter === 'all' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setFilter('all')}
              >
                全試合 ({matches.length})
              </Button>
              <Button
                variant={filter === 'scheduled' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setFilter('scheduled')}
              >
                試合前 ({matches.filter(m => m.match_status === 'scheduled').length})
              </Button>
              <Button
                variant={filter === 'ongoing' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setFilter('ongoing')}
              >
                進行中 ({matches.filter(m => m.match_status === 'ongoing').length})
              </Button>
              <Button
                variant={filter === 'completed' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setFilter('completed')}
              >
                完了 ({matches.filter(m => m.match_status === 'completed').length})
              </Button>
              <Button
                variant={filter === 'pending_confirmation' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setFilter('pending_confirmation')}
              >
                確定待ち ({matches.filter(m => m.match_status === 'completed' && !m.is_confirmed).length})
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* 試合一覧（ブロック別グループ表示） */}
        <div className="space-y-6">
          {matchBlocks.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center">
                <p className="text-gray-500">試合データがありません</p>
              </CardContent>
            </Card>
          ) : (
            matchBlocks.map((block) => {
              const blockMatches = block.matches.filter(match => {
                switch (filter) {
                  case 'scheduled': return match.match_status === 'scheduled';
                  case 'ongoing': return match.match_status === 'ongoing';
                  case 'completed': return match.match_status === 'completed';
                  case 'pending_confirmation': return match.match_status === 'completed' && !match.is_confirmed;
                  default: return true;
                }
              });
              
              // フィルターで試合がないブロックは表示しない
              if (blockMatches.length === 0) return null;
              
              return (
                <Card key={block.match_block_id} className="border-l-4 border-l-blue-500">
                  <CardHeader className="pb-4">
                    <CardTitle className="flex items-center justify-between">
                      <div className="flex items-center space-x-3">
                        <Badge variant="secondary" className="text-sm">
                          {block.phase}
                        </Badge>
                        <span className="text-lg font-bold">
                          {block.display_round_name} {block.block_name && `- ${block.block_name}ブロック`}
                        </span>
                        <Badge variant="outline" className="text-xs">
                          {block.match_type}
                        </Badge>
                      </div>
                      <Badge variant="outline" className="text-xs text-gray-500">
                        {blockMatches.length}/{block.matches.length}試合
                      </Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {blockMatches.map((match) => (
                        <div key={match.match_id} className="border rounded-lg p-4 hover:shadow-md transition-shadow">
                          <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 items-center">
                            {/* 試合情報 */}
                            <div className="lg:col-span-2">
                              <div className="flex items-center space-x-3 mb-2">
                                <span className="font-mono text-sm text-gray-600">
                                  {match.match_code}
                                </span>
                              </div>
                              <div className="text-lg font-bold text-gray-900 mb-1">
                                {(() => {
                                  const winnerName = getWinnerName(match);
                                  const scoreDisplay = getScoreDisplay(match);
                                  
                                  if (!scoreDisplay) {
                                    // スコアがない場合は通常表示
                                    return `${match.team1_name} vs ${match.team2_name}`;
                                  }
                                  
                                  const isTeam1Winner = winnerName === match.team1_name;
                                  const isTeam2Winner = winnerName === match.team2_name;
                                  
                                  return (
                                    <>
                                      {isTeam1Winner && '👑 '}{match.team1_name} vs {isTeam2Winner && '👑 '}{match.team2_name}
                                    </>
                                  );
                                })()}
                              </div>
                              
                              {/* スコア表示 */}
                              {getScoreDisplay(match) && (
                                <div className="mb-2">
                                  <div className={`text-xl font-bold mb-1 ${
                                    match.is_confirmed ? 'text-blue-600' : 'text-orange-600'
                                  }`}>
                                    {getScoreDisplay(match)}
                                  </div>
                                  {getWinnerName(match) && (
                                    <div className={`text-sm font-medium ${
                                      getWinnerName(match) === '引き分け' 
                                        ? 'text-gray-600' 
                                        : match.is_confirmed 
                                          ? 'text-blue-600' 
                                          : 'text-orange-600'
                                    }`}>
                                      勝利: {getWinnerName(match)}
                                    </div>
                                  )}
                                </div>
                              )}

                              <div className="flex items-center space-x-4 text-sm text-gray-600 flex-wrap">
                                {match.tournament_date && (
                                  <div className="flex items-center">
                                    📅 {getDateDisplay(match.tournament_date)}
                                  </div>
                                )}
                                <div className="flex items-center">
                                  <MapPin className="w-4 h-4 mr-1" />
                                  コート{match.court_number}
                                </div>
                                <div className="flex items-center">
                                  <Clock className="w-4 h-4 mr-1" />
                                  {getTimeDisplay(match)}
                                </div>
                                {match.match_status === 'ongoing' && (
                                  <div className="text-green-600 font-medium">
                                    第{match.current_period}ピリオド
                                  </div>
                                )}
                              </div>
                            </div>

                            {/* ステータス */}
                            <div className="text-center">
                              {getStatusBadge(match)}
                            </div>

                            {/* アクション */}
                            <div className="flex items-center space-x-2 justify-end">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => generateQR(match.match_id, match.match_code)}
                              >
                                <QrCode className="w-4 h-4 mr-1" />
                                QR
                              </Button>
                              
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => router.push(`/referee/match/${match.match_id}?token=admin`)}
                              >
                                <Eye className="w-4 h-4 mr-1" />
                                詳細
                              </Button>

                              {match.match_status === 'completed' && !match.is_confirmed && getScoreDisplay(match) && (
                                <Button
                                  size="sm"
                                  className="bg-green-600 hover:bg-green-700"
                                  onClick={() => confirmMatch(match.match_id, match.match_code)}
                                  disabled={confirmingMatches.has(match.match_id)}
                                >
                                  {confirmingMatches.has(match.match_id) ? '確定中...' : '結果確定'}
                                </Button>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              );
            })
          )}
        </div>

        {/* 統計情報 */}
        <Card className="mt-8">
          <CardHeader>
            <CardTitle>試合進行状況</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 text-center">
              <div>
                <div className="text-2xl font-bold text-gray-600">
                  {matches.filter(m => m.match_status === 'scheduled').length}
                </div>
                <div className="text-sm text-gray-500">試合前</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-green-600">
                  {matches.filter(m => m.match_status === 'ongoing').length}
                </div>
                <div className="text-sm text-gray-500">進行中</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-yellow-600">
                  {matches.filter(m => m.match_status === 'completed' && !m.is_confirmed).length}
                </div>
                <div className="text-sm text-gray-500">確定待ち</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-blue-600">
                  {matches.filter(m => m.is_confirmed).length}
                </div>
                <div className="text-sm text-gray-500">確定済み</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}