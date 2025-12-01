'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { 
  ArrowLeft,
  Clock,
  Play,
  CheckCircle,
  XCircle,
  QrCode,
  MapPin,
  Filter,
  Eye,
  RefreshCw,
  RotateCcw,
  Undo2
} from 'lucide-react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { getSportScoreConfig, getTournamentSportCode } from '@/lib/sport-standings-calculator';
import { SPORT_RULE_CONFIGS, SportRuleConfig } from '@/lib/tournament-rules';
import NotificationBanner from '@/components/features/tournament/NotificationBanner';

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
  court_name?: string | null;
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

type FilterType = 'all' | 'scheduled' | 'ongoing' | 'completed' | 'pending_confirmation' | 'cancelled';

export default function AdminMatchesPage() {
  const router = useRouter();
  const params = useParams();
  const tournamentId = params.id as string;
  const { data: session, status } = useSession();

  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [matches, setMatches] = useState<MatchData[]>([]);
  const [matchBlocks, setMatchBlocks] = useState<MatchBlock[]>([]);
  const [confirmingMatches, setConfirmingMatches] = useState<Set<number>>(new Set());
  const [unconfirmingMatches, setUnconfirmingMatches] = useState<Set<number>>(new Set());
  const [cancellingMatches, setCancellingMatches] = useState<Set<number>>(new Set());
  const [uncancellingMatches, setUncancellingMatches] = useState<Set<number>>(new Set());
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [selectedMatch, setSelectedMatch] = useState<MatchData | null>(null);
  const [cancellationType, setCancellationType] = useState<'no_show_both' | 'no_show_team1' | 'no_show_team2' | 'no_count'>('no_show_both');
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterType>('scheduled');
  const [blockFilter, setBlockFilter] = useState<string>('all');
  const [sportConfig, setSportConfig] = useState<{
    sport_code: string;
    score_label: string;
    score_against_label: string;
    difference_label: string;
    supports_pk: boolean;
    ruleConfig?: SportRuleConfig;
  } | null>(null);
  const [walkoverSettings, setWalkoverSettings] = useState<{
    winner_goals: number;
    loser_goals: number;
  }>({ winner_goals: 3, loser_goals: 0 }); // デフォルト値

  // データ取得関数を外部に抽出（useCallbackで最適化）
  const fetchData = useCallback(async (showLoader = false) => {
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

      if (showLoader) {
        setLoading(true);
      }
        // 大会情報取得
        const tournamentResponse = await fetch(`/api/tournaments/${tournamentId}`);
        const tournamentResult = await tournamentResponse.json();
        
        if (tournamentResult.success) {
          setTournament(tournamentResult.data);
          
          // スポーツルール設定を取得（ピリオド名表示用） - 一旦コメントアウト
          // 競技種別設定取得で一元化する
        }

        // 競技種別設定を取得
        console.log('[MATCHES_PAGE] Starting sport config loading...');
        try {
          console.log('[MATCHES_PAGE] Calling getTournamentSportCode with:', parseInt(tournamentId));
          const sportCode = await getTournamentSportCode(parseInt(tournamentId));
          console.log('[MATCHES_PAGE] SportCode received:', sportCode);
          
          const config = getSportScoreConfig(sportCode);
          console.log('[MATCHES_PAGE] Sport score config:', config);
          
          // スポーツルール設定を取得（ピリオド名表示用）
          let ruleConfig: SportRuleConfig | undefined;
          if (tournamentResult.success && tournamentResult.data.sport_type_id) {
            console.log('[MATCHES_PAGE] Looking for ruleConfig with sport_type_id:', tournamentResult.data.sport_type_id);
            ruleConfig = Object.values(SPORT_RULE_CONFIGS).find(rule => 
              rule.sport_type_id === Number(tournamentResult.data.sport_type_id)
            );
            console.log('[MATCHES_PAGE] Found ruleConfig:', ruleConfig);
          }
          
          const finalConfig = {
            ...config,
            ruleConfig
          };
          console.log('[MATCHES_PAGE] Setting sport config:', finalConfig);
          setSportConfig(finalConfig);
          console.log(`[MATCHES_PAGE] Sport config loaded: ${sportCode}`, { config, ruleConfig });
          console.log(`[MATCHES_PAGE] RuleConfig periods:`, ruleConfig?.default_periods);
        } catch (error) {
          console.error('[MATCHES_PAGE] Failed to load sport config:', error);
          console.error('[MATCHES_PAGE] Error details:', error instanceof Error ? error.message : error);
          console.error('[MATCHES_PAGE] Error stack:', error instanceof Error ? error.stack : 'No stack');
          // フォールバック: PK選手権設定
          const fallbackConfig = {
            sport_code: 'pk_championship',
            score_label: '得点',
            score_against_label: '失点',
            difference_label: '得失点差',
            supports_pk: false
          };
          console.log('[MATCHES_PAGE] Setting fallback config:', fallbackConfig);
          setSportConfig(fallbackConfig);
        }

        // 不戦勝設定を取得
        try {
          const walkoverResponse = await fetch(`/api/tournaments/${tournamentId}/walkover-settings`);
          if (walkoverResponse.ok) {
            const walkoverResult = await walkoverResponse.json();
            if (walkoverResult.success && walkoverResult.data) {
              setWalkoverSettings({
                winner_goals: walkoverResult.data.winner_goals,
                loser_goals: walkoverResult.data.loser_goals
              });
              console.log('[MATCHES_PAGE] Walkover settings loaded:', walkoverResult.data);
            }
          }
        } catch (error) {
          console.error('[MATCHES_PAGE] Failed to load walkover settings:', error);
          // デフォルト値を使用（既にstate初期値で設定済み）
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
          const matchesData = matchesResult.data.map((match: MatchData) => ({
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
            const block = blocksMap.get(match.match_block_id)!;
            // 重複チェック: 同じmatch_idが既に存在しないか確認
            if (!block.matches.some(m => m.match_id === match.match_id)) {
              block.matches.push(match);
            }
          });
          
          // 各ブロック内の試合を試合コード順にソート
          blocksMap.forEach(block => {
            block.matches.sort((a, b) => a.match_code.localeCompare(b.match_code, undefined, { numeric: true }));
          });
          
          const blocks = Array.from(blocksMap.values())
            .sort((a, b) => {
              // 予選を先に、決勝を後に配置
              if (a.phase === 'preliminary' && b.phase === 'final') return -1;
              if (a.phase === 'final' && b.phase === 'preliminary') return 1;
              // 同じフェーズ内ではblock_orderでソート
              return a.block_order - b.block_order;
            });
          
          setMatchBlocks(blocks);
        } else {
          console.error('Failed to fetch matches:', matchesResult.error);
        }

    } catch (error) {
      console.error('Data fetch error:', error);
    } finally {
      if (showLoader) {
        setLoading(false);
      }
    }
  }, [tournamentId, session, status, router]);

  // 大会情報と試合一覧取得
  useEffect(() => {
    fetchData(true); // 初回読み込み時はローダーを表示
  }, [fetchData]);

  // リアルタイム更新
  useEffect(() => {
    const eventSource = new EventSource(`/api/tournaments/${tournamentId}/live-updates`);

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        
        if (data.type === 'status_update') {
          setMatches(prevMatches => 
            prevMatches.map(match => {
              const update = data.updates.find((u: { match_id: number }) => u.match_id === match.match_id);
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

  // ページフォーカス時の自動リフレッシュ
  useEffect(() => {
    const handleFocus = () => {
      console.log('Page focused, refreshing data...');
      fetchData();
    };

    const handleVisibilityChange = () => {
      if (!document.hidden) {
        console.log('Page visible, refreshing data...');
        fetchData();
      }
    };

    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [fetchData]);

  // 定期的なポーリング（5秒間隔）
  useEffect(() => {
    const interval = setInterval(() => {
      console.log('Polling data refresh...');
      fetchData();
    }, 5000);

    return () => clearInterval(interval);
  }, [fetchData]);

  // QRコード生成
  const generateQR = (matchId: number) => {
    // 新しいタブでQRコード表示ページを開く
    const qrUrl = `/admin/matches/${matchId}/qr`;
    window.open(qrUrl, '_blank', 'width=600,height=800');
  };


  // 試合結果確定
  const confirmMatch = async (matchId: number, matchCode: string) => {
    const scoreLabel = sportConfig?.score_label || '得点';
    if (!window.confirm(`${matchCode}の${scoreLabel}結果を確定しますか？\n\n確定後は結果の変更ができなくなります。`)) {
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
        const actionLabel = sportConfig?.score_label || '得点';
        alert(`${matchCode}の${actionLabel}結果を確定しました！`);
        
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
        const actionLabel = sportConfig?.score_label || '得点';
        alert(`${actionLabel}結果確定に失敗しました: ${result.error}`);
      }
    } catch (error) {
      console.error('Match confirmation error:', error);
      const actionLabel = sportConfig?.score_label || '得点';
      alert(`${actionLabel}結果確定中にエラーが発生しました`);
    } finally {
      setConfirmingMatches(prev => {
        const newSet = new Set(prev);
        newSet.delete(matchId);
        return newSet;
      });
    }
  };

  // 試合結果確定解除（多競技対応）
  const unconfirmMatch = async (matchId: number, matchCode: string) => {
    const actionLabel = sportConfig?.score_label || '得点';
    if (!window.confirm(`${matchCode}の${actionLabel}結果確定を解除しますか？\n\n確定解除後は結果の編集が可能になります。\n順位表も自動的に再計算されます。`)) {
      return;
    }

    setUnconfirmingMatches(prev => new Set([...prev, matchId]));
    
    try {
      const response = await fetch(`/api/matches/${matchId}/unconfirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      
      const result = await response.json();
      
      if (result.success) {
        const actionLabel = sportConfig?.score_label || '得点';
        alert(`${matchCode}の${actionLabel}結果確定を解除しました！\n結果の編集が可能になりました。`);
        
        // マッチリストを更新して確定解除状態を反映
        setMatches(prevMatches => 
          prevMatches.map(match => 
            match.match_id === matchId 
              ? { ...match, is_confirmed: false }
              : match
          )
        );
        
        setMatchBlocks(prevBlocks =>
          prevBlocks.map(block => ({
            ...block,
            matches: block.matches.map(match =>
              match.match_id === matchId
                ? { ...match, is_confirmed: false }
                : match
            )
          }))
        );
      } else {
        const actionLabel = sportConfig?.score_label || '得点';
        alert(`${actionLabel}結果確定解除に失敗しました: ${result.error}`);
      }
    } catch (error) {
      console.error('Match unconfirmation error:', error);
      const actionLabel = sportConfig?.score_label || '得点';
      alert(`${actionLabel}結果確定解除中にエラーが発生しました`);
    } finally {
      setUnconfirmingMatches(prev => {
        const newSet = new Set(prev);
        newSet.delete(matchId);
        return newSet;
      });
    }
  };

  // 中止ダイアログを開く
  const openCancelDialog = (match: MatchData) => {
    setSelectedMatch(match);
    setCancellationType('no_show_both');
    setCancelDialogOpen(true);
  };

  // 試合中止処理
  const cancelMatch = async () => {
    if (!selectedMatch) return;

    setCancellingMatches(prev => new Set([...prev, selectedMatch.match_id]));
    
    try {
      const response = await fetch(`/api/matches/${selectedMatch.match_id}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cancellation_type: cancellationType })
      });
      
      const result = await response.json();
      
      if (result.success) {
        alert(`${selectedMatch.match_code}を中止しました。\n\n種別: ${getCancellationTypeLabel(cancellationType)}\n順位表への影響: ${result.data.affects_standings ? 'あり' : 'なし'}`);
        
        // マッチリストを更新して中止状態を反映
        setMatches(prevMatches => 
          prevMatches.map(match => 
            match.match_id === selectedMatch.match_id 
              ? { ...match, match_status: 'cancelled' as const }
              : match
          )
        );
        
        setMatchBlocks(prevBlocks =>
          prevBlocks.map(block => ({
            ...block,
            matches: block.matches.map(match =>
              match.match_id === selectedMatch.match_id
                ? { ...match, match_status: 'cancelled' as const }
                : match
            )
          }))
        );
        
        setCancelDialogOpen(false);
      } else {
        alert(`試合中止に失敗しました: ${result.error}`);
      }
    } catch (error) {
      console.error('Match cancellation error:', error);
      alert('試合中止中にエラーが発生しました');
    } finally {
      setCancellingMatches(prev => {
        const newSet = new Set(prev);
        newSet.delete(selectedMatch.match_id);
        return newSet;
      });
    }
  };

  // 試合中止解除処理
  const uncancelMatch = async (matchId: number, matchCode: string) => {
    if (!window.confirm(`${matchCode}の中止を解除しますか？\n\n中止解除後は「試合前」状態に戻り、通常の試合として進行できるようになります。\n順位表も自動的に再計算されます。`)) {
      return;
    }

    setUncancellingMatches(prev => new Set([...prev, matchId]));
    
    try {
      const response = await fetch(`/api/matches/${matchId}/uncancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      
      const result = await response.json();
      
      if (result.success) {
        alert(`${matchCode}の中止を解除しました！\n\n状態: 「試合前」に復帰\n前回の中止種別: ${getCancellationTypeLabel(result.data.previous_cancellation_type)}`);
        
        // マッチリストを更新して中止解除状態を反映
        setMatches(prevMatches => 
          prevMatches.map(match => 
            match.match_id === matchId 
              ? { ...match, match_status: 'scheduled' as const, is_confirmed: false }
              : match
          )
        );
        
        setMatchBlocks(prevBlocks =>
          prevBlocks.map(block => ({
            ...block,
            matches: block.matches.map(match =>
              match.match_id === matchId
                ? { ...match, match_status: 'scheduled' as const, is_confirmed: false }
                : match
            )
          }))
        );
      } else {
        alert(`中止解除に失敗しました: ${result.error}`);
      }
    } catch (error) {
      console.error('Match uncancellation error:', error);
      alert('中止解除中にエラーが発生しました');
    } finally {
      setUncancellingMatches(prev => {
        const newSet = new Set(prev);
        newSet.delete(matchId);
        return newSet;
      });
    }
  };

  // 中止種別のラベル取得
  const getCancellationTypeLabel = (type: string): string => {
    switch (type) {
      case 'no_show_both': return '両チーム不参加（0-0引き分け、各1勝点）';
      case 'no_show_team1': return `${selectedMatch?.team1_name || 'チーム1'}不参加（${selectedMatch?.team2_name || 'チーム2'}不戦勝）`;
      case 'no_show_team2': return `${selectedMatch?.team2_name || 'チーム2'}不参加（${selectedMatch?.team1_name || 'チーム1'}不戦勝）`;
      case 'no_count': return '中止（試合数カウントしない）';
      default: return '不明';
    }
  };

  // 勝者チーム名を取得（PK戦を考慮した改良版）
  const getWinnerName = (match: MatchData) => {
    console.log(`[WINNER_DEBUG] ${match.match_code} - Calculating winner for match:`, {
      final_team1_scores: match.final_team1_scores,
      final_team2_scores: match.final_team2_scores,
      team1_scores: match.team1_scores,
      team2_scores: match.team2_scores,
      is_confirmed: match.is_confirmed,
      team1_name: match.team1_name,
      team2_name: match.team2_name,
      sport_code: sportConfig?.sport_code
    });
    
    // スコアがない場合は勝者なし
    if (!match.final_team1_scores && !match.final_team2_scores && !match.team1_scores && !match.team2_scores) {
      console.log(`[WINNER_DEBUG] ${match.match_code} - No scores found`);
      return null;
    }
    
    // 確定済みスコアがある場合はそちらを優先
    let team1Scores: number[] = [];
    let team2Scores: number[] = [];
    
    if (match.final_team1_scores && match.final_team2_scores) {
      // 確定済みスコアを使用
      try {
        // PKスポーツ特有の形式に対応: "0,3" = 通常0点 + PK3点
        if (match.final_team1_scores.includes(',')) {
          team1Scores = match.final_team1_scores.split(',').map(s => parseInt(s || '0'));
        } else {
          team1Scores = [parseInt(match.final_team1_scores || '0')];
        }
        
        if (match.final_team2_scores.includes(',')) {
          team2Scores = match.final_team2_scores.split(',').map(s => parseInt(s || '0'));
        } else {
          team2Scores = [parseInt(match.final_team2_scores || '0')];
        }
        console.log(`[WINNER_DEBUG] ${match.match_code} - Final scores parsed:`, { team1Scores, team2Scores });
      } catch (error) {
        console.error(`[WINNER_DEBUG] ${match.match_code} - Score parsing error:`, error);
        team1Scores = [parseInt(match.final_team1_scores || '0')];
        team2Scores = [parseInt(match.final_team2_scores || '0')];
      }
    } else if (match.team1_scores !== undefined && match.team2_scores !== undefined) {
      // 未確定スコアを使用
      if (typeof match.team1_scores === 'string' && match.team1_scores.includes(',')) {
        team1Scores = match.team1_scores.split(',').map(s => parseInt(s || '0'));
      } else {
        team1Scores = [typeof match.team1_scores === 'string' ? parseInt(match.team1_scores) : match.team1_scores || 0];
      }
      
      if (typeof match.team2_scores === 'string' && match.team2_scores.includes(',')) {
        team2Scores = match.team2_scores.split(',').map(s => parseInt(s || '0'));
      } else {
        team2Scores = [typeof match.team2_scores === 'string' ? parseInt(match.team2_scores) : match.team2_scores || 0];
      }
      console.log(`[WINNER_DEBUG] ${match.match_code} - Live scores parsed:`, { team1Scores, team2Scores });
    } else {
      console.log(`[WINNER_DEBUG] ${match.match_code} - No valid scores found`);
      return null;
    }

    // PKスポーツ（PK選手権）専用の勝者判定ロジック
    if (sportConfig?.sport_code === 'pk_championship') {
      console.log(`[WINNER_DEBUG] ${match.match_code} - Using PK Championship logic`);
      
      const regular1 = team1Scores[0] || 0;
      const regular2 = team2Scores[0] || 0;
      const pk1 = team1Scores[1] || 0;
      const pk2 = team2Scores[1] || 0;
      
      console.log(`[WINNER_DEBUG] ${match.match_code} - PK Championship scores:`, { 
        regular1, regular2, pk1, pk2 
      });
      
      // PK戦がある場合はPK戦の結果で勝者を決定
      if (pk1 > 0 || pk2 > 0) {
        console.log(`[WINNER_DEBUG] ${match.match_code} - PK battle detected`);
        if (pk1 > pk2) {
          console.log(`[WINNER_DEBUG] ${match.match_code} - Team1 wins by PK: ${match.team1_name}`);
          return match.team1_name;
        }
        if (pk2 > pk1) {
          console.log(`[WINNER_DEBUG] ${match.match_code} - Team2 wins by PK: ${match.team2_name}`);
          return match.team2_name;
        }
        console.log(`[WINNER_DEBUG] ${match.match_code} - PK draw`);
        return '引き分け';
      }
      
      // 通常時間の結果で勝者を決定
      console.log(`[WINNER_DEBUG] ${match.match_code} - No PK, using regular time`);
      if (regular1 > regular2) {
        console.log(`[WINNER_DEBUG] ${match.match_code} - Team1 wins regular: ${match.team1_name}`);
        return match.team1_name;
      }
      if (regular2 > regular1) {
        console.log(`[WINNER_DEBUG] ${match.match_code} - Team2 wins regular: ${match.team2_name}`);
        return match.team2_name;
      }
      console.log(`[WINNER_DEBUG] ${match.match_code} - Regular time draw`);
      return '引き分け';
    }
    
    // 通常の処理（PK戦がない場合またはサッカー以外）
    console.log(`[WINNER_DEBUG] ${match.match_code} - Using standard logic`);
    const team1Total = team1Scores.reduce((sum, score) => sum + score, 0);
    const team2Total = team2Scores.reduce((sum, score) => sum + score, 0);
    
    console.log(`[WINNER_DEBUG] ${match.match_code} - Standard totals:`, { team1Total, team2Total });
    
    if (team1Total > team2Total) {
      console.log(`[WINNER_DEBUG] ${match.match_code} - Team1 wins: ${match.team1_name}`);
      return match.team1_name;
    }
    if (team2Total > team1Total) {
      console.log(`[WINNER_DEBUG] ${match.match_code} - Team2 wins: ${match.team2_name}`);
      return match.team2_name;
    }
    console.log(`[WINNER_DEBUG] ${match.match_code} - Draw`);
    return '引き分け';
  };

  // スコアを取得（多競技対応）
  const getScoreDisplay = (match: MatchData) => {
    console.log(`[SCORE_DEBUG] ${match.match_code} - Getting score display:`, {
      is_confirmed: match.is_confirmed,
      final_team1_scores: match.final_team1_scores,
      final_team2_scores: match.final_team2_scores,
      team1_scores: match.team1_scores,
      team2_scores: match.team2_scores,
      sport_code: sportConfig?.sport_code
    });
    
    try {
      if (match.is_confirmed && match.final_team1_scores && match.final_team2_scores) {
        // 確定済みスコアの処理（JSONまたはCSV形式に対応）
        let team1Scores: number[] = [];
        let team2Scores: number[] = [];
        
        console.log('[SCORE_DEBUG] Processing scores for match', match.match_id, {
          final_team1_scores: match.final_team1_scores,
          final_team2_scores: match.final_team2_scores,
          final_team1_scores_type: typeof match.final_team1_scores,
          final_team2_scores_type: typeof match.final_team2_scores
        });
        
        try {
          // JSON形式の場合
          team1Scores = JSON.parse(match.final_team1_scores);
          team2Scores = JSON.parse(match.final_team2_scores);
          console.log('[SCORE_DEBUG] JSON parse successful:', { team1Scores, team2Scores });
        } catch (jsonError) {
          console.log('[SCORE_DEBUG] JSON parse failed, trying CSV:', jsonError);
          // CSV形式または単一値の場合
          if (match.final_team1_scores.includes(',')) {
            // カンマ区切りの場合
            team1Scores = match.final_team1_scores.split(',').map(s => parseInt(s || '0'));
          } else {
            // 単一値の場合
            team1Scores = [parseInt(match.final_team1_scores || '0')];
          }
          
          if (match.final_team2_scores.includes(',')) {
            // カンマ区切りの場合
            team2Scores = match.final_team2_scores.split(',').map(s => parseInt(s || '0'));
          } else {
            // 単一値の場合
            team2Scores = [parseInt(match.final_team2_scores || '0')];
          }
          console.log('[SCORE_DEBUG] CSV/Single value parse result:', { team1Scores, team2Scores });
        }

        // 配列の安全性チェック
        if (!Array.isArray(team1Scores)) {
          console.log('[SCORE_DEBUG] team1Scores is not array, converting:', team1Scores, typeof team1Scores);
          // 単一の数値の場合は配列に変換
          if (typeof team1Scores === 'number') {
            team1Scores = [team1Scores];
          } else {
            team1Scores = [];
          }
        }
        if (!Array.isArray(team2Scores)) {
          console.log('[SCORE_DEBUG] team2Scores is not array, converting:', team2Scores, typeof team2Scores);
          // 単一の数値の場合は配列に変換
          if (typeof team2Scores === 'number') {
            team2Scores = [team2Scores];
          } else {
            team2Scores = [];
          }
        }

        // PKスポーツまたはサッカーでPK戦がある場合の特別処理
        if ((sportConfig?.sport_code === 'pk_championship') || (sportConfig?.supports_pk && sportConfig.ruleConfig?.default_periods)) {
          let regularTotal1 = 0;
          let regularTotal2 = 0;
          let pkTotal1 = 0;
          let pkTotal2 = 0;
          
          // 各ピリオドをチェックしてPK戦かどうか判定
          team1Scores.forEach((score, index) => {
            const periodNumber = index + 1;
            const period = sportConfig.ruleConfig?.default_periods?.find(p => p.period_number === periodNumber);
            
            if (period && period.period_name.includes('PK')) {
              pkTotal1 += Number(score) || 0;
              pkTotal2 += Number(team2Scores[index]) || 0;
            } else {
              regularTotal1 += Number(score) || 0;
              regularTotal2 += Number(team2Scores[index]) || 0;
            }
          });
          
          // PK戦のスコアがある場合は分離表示
          if (pkTotal1 > 0 || pkTotal2 > 0) {
            return `${regularTotal1} - ${regularTotal2} (PK ${pkTotal1}-${pkTotal2})`;
          }
        }

        // PKスポーツ専用のスコア表示
        if (sportConfig?.sport_code === 'pk_championship') {
          const regular1 = team1Scores[0] || 0;
          const regular2 = team2Scores[0] || 0;
          const pk1 = team1Scores[1] || 0;
          const pk2 = team2Scores[1] || 0;
          
          if (pk1 > 0 || pk2 > 0) {
            return `${regular1} - ${regular2} (PK ${pk1}-${pk2})`;
          }
          return `${regular1} - ${regular2}`;
        }

        // 通常のスコア合計
        const team1Total = team1Scores.reduce((sum, score) => sum + score, 0);
        const team2Total = team2Scores.reduce((sum, score) => sum + score, 0);
        return `${team1Total} - ${team2Total}`;
      } else if (match.team1_scores !== undefined && match.team2_scores !== undefined) {
        // 未確定スコアの処理（カンマ区切りスコアの合計を計算）
        
        // PKスポーツまたはサッカーでPK戦がある場合の特別処理（未確定スコア）
        if ((sportConfig?.sport_code === 'pk_championship') || (sportConfig?.supports_pk && sportConfig.ruleConfig?.default_periods)) {
          let team1Scores: number[] = [];
          let team2Scores: number[] = [];
          
          // スコアを配列に変換
          if (typeof match.team1_scores === 'string' && match.team1_scores.includes(',')) {
            team1Scores = match.team1_scores.split(',').map(s => parseInt(s) || 0);
          } else {
            team1Scores = [typeof match.team1_scores === 'string' ? parseInt(match.team1_scores) || 0 : match.team1_scores || 0];
          }
          
          if (typeof match.team2_scores === 'string' && match.team2_scores.includes(',')) {
            team2Scores = match.team2_scores.split(',').map(s => parseInt(s) || 0);
          } else {
            team2Scores = [typeof match.team2_scores === 'string' ? parseInt(match.team2_scores) || 0 : match.team2_scores || 0];
          }
          
          let regularTotal1 = 0;
          let regularTotal2 = 0;
          let pkTotal1 = 0;
          let pkTotal2 = 0;
          
          // 各ピリオドをチェックしてPK戦かどうか判定
          team1Scores.forEach((score, index) => {
            const periodNumber = index + 1;
            const period = sportConfig.ruleConfig?.default_periods?.find(p => p.period_number === periodNumber);
            
            if (period && period.period_name.includes('PK')) {
              pkTotal1 += Number(score) || 0;
              pkTotal2 += Number(team2Scores[index]) || 0;
            } else {
              regularTotal1 += Number(score) || 0;
              regularTotal2 += Number(team2Scores[index]) || 0;
            }
          });
          
          // PK戦のスコアがある場合は分離表示
          if (pkTotal1 > 0 || pkTotal2 > 0) {
            return `${regularTotal1} - ${regularTotal2} (PK ${pkTotal1}-${pkTotal2})`;
          }
        }
        
        // PKスポーツ専用の未確定スコア表示
        if (sportConfig?.sport_code === 'pk_championship') {
          let team1Scores: number[] = [];
          let team2Scores: number[] = [];
          
          // スコアを配列に変換
          if (typeof match.team1_scores === 'string' && match.team1_scores.includes(',')) {
            team1Scores = match.team1_scores.split(',').map(s => parseInt(s) || 0);
          } else {
            team1Scores = [typeof match.team1_scores === 'string' ? parseInt(match.team1_scores) || 0 : match.team1_scores || 0];
          }
          
          if (typeof match.team2_scores === 'string' && match.team2_scores.includes(',')) {
            team2Scores = match.team2_scores.split(',').map(s => parseInt(s) || 0);
          } else {
            team2Scores = [typeof match.team2_scores === 'string' ? parseInt(match.team2_scores) || 0 : match.team2_scores || 0];
          }
          
          const regular1 = team1Scores[0] || 0;
          const regular2 = team2Scores[0] || 0;
          const pk1 = team1Scores[1] || 0;
          const pk2 = team2Scores[1] || 0;
          
          if (pk1 > 0 || pk2 > 0) {
            return `${regular1} - ${regular2} (PK ${pk1}-${pk2})`;
          }
          return `${regular1} - ${regular2}`;
        }

        // 通常の処理（PK戦がない場合またはサッカー以外）
        let team1Total = 0;
        let team2Total = 0;
        
        if (typeof match.team1_scores === 'string' && match.team1_scores.includes(',')) {
          // カンマ区切りの場合
          team1Total = match.team1_scores.split(',').reduce((sum, score) => sum + (parseInt(score) || 0), 0);
        } else {
          // 単一値の場合
          team1Total = typeof match.team1_scores === 'string' ? parseInt(match.team1_scores) || 0 : match.team1_scores || 0;
        }
        
        if (typeof match.team2_scores === 'string' && match.team2_scores.includes(',')) {
          // カンマ区切りの場合
          team2Total = match.team2_scores.split(',').reduce((sum, score) => sum + (parseInt(score) || 0), 0);
        } else {
          // 単一値の場合
          team2Total = typeof match.team2_scores === 'string' ? parseInt(match.team2_scores) || 0 : match.team2_scores || 0;
        }
        
        return `${team1Total} - ${team2Total}`;
      }
    } catch (error) {
      console.error('Score display error:', error, 'Match data:', match);
    }
    return null;
  };


  // ステータス表示
  const getStatusBadge = (match: MatchData) => {
    if (match.match_status === 'cancelled') {
      return <Badge className="bg-red-100 text-red-800 hover:bg-red-100 dark:bg-red-950/20 dark:text-red-200"><XCircle className="w-3 h-3 mr-1" />中止</Badge>;
    }
    
    if (match.match_status === 'completed' && !match.is_confirmed) {
      return <Badge className="bg-yellow-100 text-yellow-800 hover:bg-yellow-100 dark:bg-yellow-950/20 dark:text-yellow-200">確定待ち</Badge>;
    }

    switch (match.match_status) {
      case 'scheduled':
        return <Badge variant="secondary"><Clock className="w-3 h-3 mr-1" />試合前</Badge>;
      case 'ongoing':
        return <Badge className="bg-green-600 text-white hover:bg-green-600 animate-pulse"><Play className="w-3 h-3 mr-1" />進行中</Badge>;
      case 'completed':
        return <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100 dark:bg-blue-950/20 dark:text-blue-200"><CheckCircle className="w-3 h-3 mr-1" />完了</Badge>;
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

  // 利用可能なブロック一覧を取得（matchBlocksの順序を使用）
  const getAvailableBlocks = () => {
    // matchBlocksが既にphaseとblock_orderでソート済みなので、その順序を使用
    return matchBlocks.map(block => block.block_name);
  };

  // ブロック色を取得
  const getBlockColor = (blockName: string) => {
    const colors: { [key: string]: string } = {
      'A': 'bg-blue-600 text-white',
      'B': 'bg-green-600 text-white', 
      'C': 'bg-yellow-600 text-white',
      'D': 'bg-purple-600 text-white',
      '決勝トーナメント': 'bg-red-600 text-white',
    };
    return colors[blockName] || 'bg-secondary text-secondary-foreground';
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-muted-foreground">読み込み中...</p>
        </div>
      </div>
    );
  }

  if (!tournament) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">大会情報が見つかりません</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* ヘッダー */}
      <div className="bg-card shadow-sm border-b">
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
                <h1 className="text-3xl font-bold text-foreground">試合結果入力</h1>
                <p className="text-sm text-muted-foreground mt-1">
                  「{tournament.tournament_name}」の試合進行状況管理
                </p>
              </div>
            </div>
            
            {/* QRコード一覧・リフレッシュボタン */}
            <div className="flex items-center space-x-3">
              <Button
                variant="outline"
                size="sm"
                onClick={() => window.open(`/admin/tournaments/${tournamentId}/qr-list`, '_blank')}
                className="flex items-center"
              >
                <QrCode className="w-4 h-4 mr-2" />
                QRコード一覧
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  console.log('Manual refresh triggered');
                  fetchData(true); // 手動リフレッシュ時はローダーを表示
                }}
                disabled={loading}
                className="flex items-center"
              >
                <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                {loading ? '更新中...' : '最新情報に更新'}
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* 通知バナー - この大会に関連する要対応事項のみ表示 */}
        <NotificationBanner tournamentId={parseInt(tournamentId)} />
        
        {/* フィルター */}
        <Card className="mb-6">
          <CardContent className="p-4 space-y-4">
            {/* 試合状態フィルター */}
            <div className="flex items-center space-x-2 flex-wrap gap-2">
              <Filter className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm font-medium text-muted-foreground">試合状態:</span>
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
                完了 ({matches.filter(m => m.match_status === 'completed' && m.is_confirmed).length})
              </Button>
              <Button
                variant={filter === 'pending_confirmation' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setFilter('pending_confirmation')}
              >
                確定待ち ({matches.filter(m => m.match_status === 'completed' && !m.is_confirmed).length})
              </Button>
              <Button
                variant={filter === 'cancelled' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setFilter('cancelled')}
              >
                中止 ({matches.filter(m => m.match_status === 'cancelled').length})
              </Button>
            </div>

            {/* ブロックフィルター */}
            <div className="flex items-center space-x-2 flex-wrap gap-2">
              <Filter className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm font-medium text-muted-foreground">ブロック:</span>
              <Button
                variant={blockFilter === 'all' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setBlockFilter('all')}
              >
                全ブロック
              </Button>
              {getAvailableBlocks().map(blockName => (
                <Button
                  key={blockName}
                  variant={blockFilter === blockName ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setBlockFilter(blockName)}
                  className="flex items-center space-x-2"
                >
                  <span className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium ${getBlockColor(blockName)}`}>
                    {blockName}
                  </span>
                  <span className="text-sm">
                    ({matches.filter(m => m.block_name === blockName).length})
                  </span>
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* 試合一覧（ブロック別グループ表示） */}
        <div className="space-y-6">
          {matchBlocks.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center">
                <p className="text-muted-foreground">試合データがありません</p>
              </CardContent>
            </Card>
          ) : (
            matchBlocks.map((block) => {
              // ブロックフィルターをまず適用
              if (blockFilter !== 'all' && block.block_name !== blockFilter) {
                return null;
              }

              const blockMatches = block.matches.filter(match => {
                // 試合状態フィルターを適用
                switch (filter) {
                  case 'scheduled': return match.match_status === 'scheduled';
                  case 'ongoing': return match.match_status === 'ongoing';
                  case 'completed': return match.match_status === 'completed' && match.is_confirmed;
                  case 'pending_confirmation': return match.match_status === 'completed' && !match.is_confirmed;
                  case 'cancelled': return match.match_status === 'cancelled';
                  default: return true;
                }
              });
              
              // フィルターで試合がないブロックは表示しない
              if (blockMatches.length === 0) return null;
              
              return (
                <Card key={block.match_block_id} className={`border-l-4 ${
                  block.block_name === 'A' ? 'border-l-blue-500' :
                  block.block_name === 'B' ? 'border-l-green-500' :
                  block.block_name === 'C' ? 'border-l-yellow-500' :
                  block.block_name === 'D' ? 'border-l-purple-500' :
                  block.block_name === '決勝トーナメント' ? 'border-l-red-500' :
                  'border-l-gray-500'
                }`}>
                  <CardHeader className="pb-4">
                    <CardTitle className="flex items-center justify-between">
                      <div className="flex items-center space-x-3">
                        <Badge variant="secondary" className="text-sm">
                          {block.display_round_name}
                        </Badge>
                        <Badge variant="outline" className="text-xs">
                          {block.match_type}
                        </Badge>
                      </div>
                      <Badge variant="outline" className="text-xs text-muted-foreground">
                        {blockMatches.length}/{block.matches.length}試合
                      </Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {blockMatches.map((match) => (
                        <div key={`${match.match_block_id}-${match.match_code}-${match.match_id}`} className="border rounded-lg p-4 hover:shadow-md transition-shadow">
                          <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 items-center">
                            {/* 試合情報 */}
                            <div className="lg:col-span-2">
                              <div className="flex items-center space-x-3 mb-2">
                                <span className="font-mono text-sm text-muted-foreground">
                                  {match.match_code}
                                </span>
                              </div>
                              <div className="text-lg font-bold text-foreground mb-1">
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
                                  {/* 勝利表示：試合完了時、確定待ち時、確定済み時のみ表示 */}
                                  {getWinnerName(match) && (match.match_status === 'completed' || match.is_confirmed) && (
                                    <div className={`text-sm font-medium ${
                                      getWinnerName(match) === '引き分け' 
                                        ? 'text-muted-foreground' 
                                        : match.is_confirmed 
                                          ? 'text-blue-600' 
                                          : 'text-orange-600'
                                    }`}>
                                      勝利: {getWinnerName(match)}
                                    </div>
                                  )}
                                </div>
                              )}

                              <div className="flex items-center space-x-4 text-sm text-muted-foreground flex-wrap">
                                {match.tournament_date && (
                                  <div className="flex items-center">
                                    📅 {getDateDisplay(match.tournament_date)}
                                  </div>
                                )}
                                <div className="flex items-center">
                                  <MapPin className="w-4 h-4 mr-1" />
                                  {match.court_name ? match.court_name : `コート${match.court_number}`}
                                </div>
                                <div className="flex items-center">
                                  <Clock className="w-4 h-4 mr-1" />
                                  {getTimeDisplay(match)}
                                </div>
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
                                onClick={() => generateQR(match.match_id)}
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
                              
                              {match.is_confirmed && match.match_status !== 'cancelled' && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="text-orange-600 border-orange-200 hover:bg-muted"
                                  onClick={() => unconfirmMatch(match.match_id, match.match_code)}
                                  disabled={unconfirmingMatches.has(match.match_id)}
                                >
                                  <RotateCcw className="w-4 h-4 mr-1" />
                                  {unconfirmingMatches.has(match.match_id) ? '解除中...' : '確定解除'}
                                </Button>
                              )}
                              
                              {match.match_status !== 'cancelled' && !match.is_confirmed && (
                                <Button
                                  variant="destructive"
                                  size="sm"
                                  onClick={() => openCancelDialog(match)}
                                  disabled={cancellingMatches.has(match.match_id)}
                                >
                                  <XCircle className="w-4 h-4 mr-1" />
                                  {cancellingMatches.has(match.match_id) ? '中止中...' : '中止'}
                                </Button>
                              )}
                              
                              {match.match_status === 'cancelled' && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="text-green-600 border-green-200 hover:bg-muted"
                                  onClick={() => uncancelMatch(match.match_id, match.match_code)}
                                  disabled={uncancellingMatches.has(match.match_id)}
                                >
                                  <Undo2 className="w-4 h-4 mr-1" />
                                  {uncancellingMatches.has(match.match_id) ? '解除中...' : '中止解除'}
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
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 text-center">
              <div>
                <div className="text-2xl font-bold text-muted-foreground">
                  {matches.filter(m => m.match_status === 'scheduled').length}
                </div>
                <div className="text-sm text-muted-foreground">試合前</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-green-600">
                  {matches.filter(m => m.match_status === 'ongoing').length}
                </div>
                <div className="text-sm text-muted-foreground">進行中</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-yellow-600">
                  {matches.filter(m => m.match_status === 'completed' && !m.is_confirmed).length}
                </div>
                <div className="text-sm text-muted-foreground">確定待ち</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-blue-600">
                  {matches.filter(m => m.is_confirmed).length}
                </div>
                <div className="text-sm text-muted-foreground">確定済み</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-red-600">
                  {matches.filter(m => m.match_status === 'cancelled').length}
                </div>
                <div className="text-sm text-muted-foreground">中止</div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 中止ダイアログ */}
        <Dialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>試合中止 - {selectedMatch?.match_code}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <p className="text-sm text-muted-foreground mb-4">
                  「{selectedMatch?.team1_name} vs {selectedMatch?.team2_name}」を中止します。
                </p>
                <Label className="text-base font-medium">中止理由を選択してください</Label>
                <p className="text-xs text-muted-foreground mt-2 bg-blue-50 p-2 rounded">
                  💡 <strong>選択ガイド：</strong><br/>
                  • <strong>中止</strong>: 大会全体の中止・辞退・欠席の場合（試合数にカウントしない）<br/>
                  • <strong>その他3つ</strong>: 遅刻・1試合のみの特別処理（試合数にカウントする）
                </p>
              </div>

              <div className="space-y-3">
                <label className="flex items-center space-x-3 p-3 border rounded-lg cursor-pointer hover:bg-background">
                  <input
                    type="radio"
                    value="no_show_both"
                    checked={cancellationType === 'no_show_both'}
                    onChange={(e) => setCancellationType(e.target.value as typeof cancellationType)}
                    className="text-blue-600"
                  />
                  <div>
                    <div className="font-medium">両チーム不参加（遅刻・その試合のみ欠場）</div>
                    <div className="text-sm text-muted-foreground">0-0引き分け扱い、各1勝点、試合数にカウント</div>
                  </div>
                </label>

                <label className="flex items-center space-x-3 p-3 border rounded-lg cursor-pointer hover:bg-background">
                  <input
                    type="radio"
                    value="no_show_team1"
                    checked={cancellationType === 'no_show_team1'}
                    onChange={(e) => setCancellationType(e.target.value as typeof cancellationType)}
                    className="text-blue-600"
                  />
                  <div>
                    <div className="font-medium">{selectedMatch?.team1_name}不参加（遅刻・その試合のみ欠場）</div>
                    <div className="text-sm text-muted-foreground">{selectedMatch?.team2_name}不戦勝（{walkoverSettings.winner_goals}-{walkoverSettings.loser_goals}）、試合数にカウント</div>
                  </div>
                </label>

                <label className="flex items-center space-x-3 p-3 border rounded-lg cursor-pointer hover:bg-background">
                  <input
                    type="radio"
                    value="no_show_team2"
                    checked={cancellationType === 'no_show_team2'}
                    onChange={(e) => setCancellationType(e.target.value as typeof cancellationType)}
                    className="text-blue-600"
                  />
                  <div>
                    <div className="font-medium">{selectedMatch?.team2_name}不参加（遅刻・その試合のみ欠場）</div>
                    <div className="text-sm text-muted-foreground">{selectedMatch?.team1_name}不戦勝（{walkoverSettings.winner_goals}-{walkoverSettings.loser_goals}）、試合数にカウント</div>
                  </div>
                </label>

                <label className="flex items-center space-x-3 p-3 border rounded-lg cursor-pointer hover:bg-background">
                  <input
                    type="radio"
                    value="no_count"
                    checked={cancellationType === 'no_count'}
                    onChange={(e) => setCancellationType(e.target.value as typeof cancellationType)}
                    className="text-blue-600"
                  />
                  <div>
                    <div className="font-medium">中止（大会全体を辞退・欠席）</div>
                    <div className="text-sm text-muted-foreground">試合数にカウントしない、順位に影響なし</div>
                  </div>
                </label>
              </div>
            </div>
            
            <DialogFooter>
              <Button variant="outline" onClick={() => setCancelDialogOpen(false)}>
                キャンセル
              </Button>
              <Button 
                variant="destructive" 
                onClick={cancelMatch}
                disabled={!selectedMatch || cancellingMatches.has(selectedMatch.match_id)}
              >
                {selectedMatch && cancellingMatches.has(selectedMatch.match_id) ? '中止中...' : '中止実行'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}