'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Shuffle, Save, RotateCcw, Users, Calendar, MapPin, ChevronUp, ChevronDown } from 'lucide-react';
import type { SimpleTournamentTeam } from '@/lib/tournament-teams-simple';
import TournamentBracketEditor from '@/components/features/tournament/TournamentBracketEditor';

interface Team {
  tournament_team_id: number;
  team_id: string;
  team_name: string;
  team_omission?: string;
  contact_person: string;
  contact_email: string;
  registered_players_count: number;
  player_count?: number; // SimpleTournamentTeam互換性のため
}

interface Tournament {
  tournament_id: number;
  tournament_name: string;
  format_name: string;
  venue_name: string;
  team_count: number;
  tournament_dates: string;
  tournament_period: string;
  preliminary_format_type?: string;
}

interface Match {
  match_id: number;
  match_number: number;
  match_code: string;
  phase: string;
  block_name: string;
  round_name: string;
  match_type: string;
  team1_display_name: string;
  team2_display_name: string;
  team1_name?: string;
  team2_name?: string;
  team1_id?: string;
  team2_id?: string;
  team1_tournament_team_id?: number;
  team2_tournament_team_id?: number;
  team1_source?: string;
  team2_source?: string;
  tournament_date: string;
  start_time?: string;
  court_number?: number;
  is_bye_match?: number;
}

interface Block {
  block_name: string;
  phase: string;
  teams: Team[];
}

interface BlockTeamCount {
  block_name: string;
  expected_team_count: number;
  match_count: number;
}

interface FirstRoundSlot {
  match_code: string;
  match_id: number;
  is_bye_match: boolean;
  team1: {
    tournament_team_id?: number;
    team_name: string;
    position: string;
  } | null;
  team2: {
    tournament_team_id?: number;
    team_name: string;
    position: string;
  } | null;
  isDraggable: boolean;
}

export default function TournamentDrawPage() {
  const router = useRouter();
  const params = useParams();
  const tournamentId = params.id as string;

  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [registeredTeams, setRegisteredTeams] = useState<Team[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [initialMatches, setInitialMatches] = useState<Match[]>([]); // リセット用の初期データ
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [blockTeamCounts, setBlockTeamCounts] = useState<BlockTeamCount[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasExistingDraw, setHasExistingDraw] = useState<boolean>(false);

  // 大会情報と参加チーム、試合データの取得
  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        
        // 大会情報を取得
        const tournamentResponse = await fetch(`/api/tournaments/${tournamentId}`);
        const tournamentData = await tournamentResponse.json();
        
        if (!tournamentResponse.ok || !tournamentData.success) {
          throw new Error(tournamentData.error || '大会情報の取得に失敗しました');
        }
        
        setTournament(tournamentData.data);

        // 参加チーム一覧を取得
        const teamsResponse = await fetch(`/api/tournaments/${tournamentId}/teams`);
        const teamsData = await teamsResponse.json();
        
        if (!teamsResponse.ok || !teamsData.success) {
          throw new Error(teamsData.error || '参加チーム情報の取得に失敗しました');
        }
        
        // APIから返されるデータ構造に合わせて処理
        let teams: unknown[] = [];
        if (teamsData.data && typeof teamsData.data === 'object') {
          if (Array.isArray(teamsData.data)) {
            teams = teamsData.data;
          } else if (teamsData.data.teams && Array.isArray(teamsData.data.teams)) {
            teams = teamsData.data.teams;
          }
        }
        
        // データ構造をログ出力してデバッグ
        if (teams.length === 0) {
          console.warn('No teams found. API response structure:', teamsData);
        }
        
        const formattedTeams = teams
          .filter((team: unknown): team is SimpleTournamentTeam => {
            return team != null && typeof team === 'object' && 'team_id' in team && Boolean((team as SimpleTournamentTeam).team_id);
          }) // undefinedやnullのチームを除外
          .map((team: SimpleTournamentTeam) => ({
            tournament_team_id: team.tournament_team_id || 0,
            team_id: team.team_id || '',
            team_name: team.team_name || '',
            team_omission: team.team_omission || '',
            contact_person: team.contact_person || '',
            contact_email: team.contact_email || '',
            registered_players_count: team.player_count || 0
          }));
        
        setRegisteredTeams(formattedTeams);
        
        // デバッグ情報
        console.log('Debug: teams data structure:', {
          originalData: teamsData.data,
          extractedTeams: teams,
          formattedTeams: formattedTeams,
          teamCount: formattedTeams.length
        });

        // 試合情報を取得（BYE試合も含める）
        const matchesResponse = await fetch(`/api/tournaments/${tournamentId}/matches?includeBye=true`);
        const matchesData = await matchesResponse.json();

        if (!matchesResponse.ok || !matchesData.success) {
          throw new Error(matchesData.error || '試合情報の取得に失敗しました');
        }

        const allMatches = matchesData.data;

        console.log(`[Draw] 全試合数: ${allMatches.length}`);
        console.log('[Draw] 最初の3試合のデータ:', allMatches.slice(0, 3).map((m: Match) => ({
          match_code: m.match_code,
          is_bye_match: m.is_bye_match,
          team1_display_name: m.team1_display_name,
          team2_display_name: m.team2_display_name,
          team1_source: m.team1_source,
          team2_source: m.team2_source
        })));

        // ブロック割り当て情報を取得
        const teamBlockAssignments: Record<string, string> = {};
        try {
          const assignmentsResponse = await fetch(`/api/tournaments/${tournamentId}/teams`);
          const assignmentsData = await assignmentsResponse.json();
          if (assignmentsResponse.ok && assignmentsData.success) {
            const teams = Array.isArray(assignmentsData.data) ? assignmentsData.data : (assignmentsData.data.teams || []);
            teams.forEach((team: { assigned_block?: string; block_position?: number; team_name: string }) => {
              if (team.assigned_block && team.block_position) {
                const key = `${team.assigned_block}${team.block_position}チーム`;
                teamBlockAssignments[key] = team.team_name;
              }
            });
            console.log('[Draw] ブロック割り当てマップ:', teamBlockAssignments);
          }
        } catch (err) {
          console.error('[Draw] ブロック割り当て情報取得失敗:', err);
        }

        // プレースホルダー（A1チーム形式）を実際のチーム名に解決する関数
        const resolveTeamPlaceholder = (displayName: string): string => {
          const resolved = teamBlockAssignments[displayName];
          if (resolved) {
            console.log(`[Draw] プレースホルダー解決: ${displayName} → ${resolved}`);
            return resolved;
          }
          return displayName;
        };

        // 不戦勝試合から勝者を抽出（match_code → 勝者チーム名のマップを作成）
        const byeMatchWinners: Record<string, string> = {};
        allMatches.forEach((m: Match) => {
          console.log(`[Draw] 試合 ${m.match_code}: is_bye_match=${m.is_bye_match} (type: ${typeof m.is_bye_match})`);
          if (m.is_bye_match === 1) {
            // 不戦勝試合の勝者を特定（空でない方のチーム）
            let winner = m.team1_display_name || m.team2_display_name;
            // プレースホルダーを実際のチーム名に解決
            winner = resolveTeamPlaceholder(winner);
            if (winner && m.match_code) {
              byeMatchWinners[`${m.match_code}_winner`] = winner;
              console.log(`[Draw] 不戦勝試合検出: ${m.match_code} → 勝者: ${winner}`);
            }
          }
        });
        console.log('[Draw] 不戦勝マップ:', byeMatchWinners);

        // 全試合を処理（不戦勝試合も含む）
        // 次の試合のteam1_display_name/team2_display_nameを解決
        const processedMatches = allMatches.map((m: Match, idx: number) => {
          let resolvedTeam1DisplayName = m.team1_display_name;
          let resolvedTeam2DisplayName = m.team2_display_name;

          // 不戦勝試合の場合、プレースホルダーを実際のチーム名に置き換え
          if (m.is_bye_match === 1) {
            if (m.team1_display_name) {
              resolvedTeam1DisplayName = resolveTeamPlaceholder(m.team1_display_name);
            }
            if (m.team2_display_name) {
              resolvedTeam2DisplayName = resolveTeamPlaceholder(m.team2_display_name);
            }
          }

          // team1_sourceやteam2_sourceに基づいて、不戦勝の勝者を反映
          if (m.team1_source && byeMatchWinners[m.team1_source]) {
            console.log(`[Draw] Match ${m.match_code}: team1_source=${m.team1_source} → ${byeMatchWinners[m.team1_source]}`);
            resolvedTeam1DisplayName = byeMatchWinners[m.team1_source];
          }
          if (m.team2_source && byeMatchWinners[m.team2_source]) {
            console.log(`[Draw] Match ${m.match_code}: team2_source=${m.team2_source} → ${byeMatchWinners[m.team2_source]}`);
            resolvedTeam2DisplayName = byeMatchWinners[m.team2_source];
          }

          if (idx < 3) {
            console.log(`[Draw] Match ${m.match_code}:`, {
              team1_source: m.team1_source,
              team2_source: m.team2_source,
              original_team1: m.team1_display_name,
              original_team2: m.team2_display_name,
              resolved_team1: resolvedTeam1DisplayName,
              resolved_team2: resolvedTeam2DisplayName
            });
          }

          // 表示では team1_name が優先されるため、適切な値を設定
          // 不戦勝試合の場合: 解決済みの名前を使用
          // team1_tournament_team_id/team2_tournament_team_id が存在しない場合（実際のチームが未割り当て）は解決済みの名前を使用
          // team1_tournament_team_id/team2_tournament_team_id が存在する場合（実際のチームが割り当て済み）はそのまま使用
          const newTeam1Name = m.is_bye_match === 1 && resolvedTeam1DisplayName !== m.team1_display_name
            ? resolvedTeam1DisplayName
            : (!m.team1_tournament_team_id
                ? (resolvedTeam1DisplayName !== m.team1_display_name ? resolvedTeam1DisplayName : m.team1_name)
                : m.team1_name);
          const newTeam2Name = m.is_bye_match === 1 && resolvedTeam2DisplayName !== m.team2_display_name
            ? resolvedTeam2DisplayName
            : (!m.team2_tournament_team_id
                ? (resolvedTeam2DisplayName !== m.team2_display_name ? resolvedTeam2DisplayName : m.team2_name)
                : m.team2_name);

          if (idx < 3) {
            console.log(`[Draw] Match ${m.match_code} FINAL:`, {
              team1_tournament_team_id: m.team1_tournament_team_id,
              team2_tournament_team_id: m.team2_tournament_team_id,
              original_team1_name: m.team1_name,
              original_team2_name: m.team2_name,
              new_team1_name: newTeam1Name,
              new_team2_name: newTeam2Name,
              resolved_team1_display: resolvedTeam1DisplayName,
              resolved_team2_display: resolvedTeam2DisplayName
            });
          }

          return {
            ...m,
            team1_display_name: resolvedTeam1DisplayName,
            team2_display_name: resolvedTeam2DisplayName,
            // team1_name が未設定（プレースホルダーのまま）の場合、解決済みの名前を設定
            team1_name: newTeam1Name,
            team2_name: newTeam2Name
          };
        });

        setMatches(processedMatches);

        // リセット用に初期データを保存（割り当て前の状態）
        // allMatchesから保存することで、元のプレースホルダー状態を保持
        const initialMatchesData = allMatches.map((m: Match) => ({
          ...m,
          team1_name: undefined,
          team2_name: undefined,
          team1_tournament_team_id: undefined,
          team2_tournament_team_id: undefined
        }));
        setInitialMatches(initialMatchesData);

        // ブロック別の想定チーム数を取得
        const blockCountsResponse = await fetch(`/api/tournaments/${tournamentId}/block-team-counts`);
        const blockCountsData = await blockCountsResponse.json();

        if (blockCountsResponse.ok && blockCountsData.success) {
          setBlockTeamCounts(blockCountsData.data.block_team_counts);
          console.log('Block team counts loaded:', blockCountsData.data.block_team_counts);
        } else {
          console.warn('Failed to load block team counts:', blockCountsData.error);
        }

        // ブロック初期化
        await initializeBlocks(formattedTeams, matchesData.data);

      } catch (err) {
        console.error('データ取得エラー:', err);
        setError(err instanceof Error ? err.message : '不明なエラーが発生しました');
      } finally {
        setLoading(false);
      }
    };

    if (tournamentId) {
      fetchData();
    }
  }, [tournamentId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ブロック構造の初期化
  const initializeBlocks = useCallback(async (_teams: Team[], matches: Match[]) => {
    // 予選ブロックを抽出
    const preliminaryBlocks = new Set<string>();
    matches.forEach(match => {
      if (match.phase === 'preliminary' && match.block_name) {
        preliminaryBlocks.add(match.block_name);
      }
    });

    // 既存の振分け情報を取得
    try {
      const response = await fetch(`/api/tournaments/${tournamentId}/teams`);
      const teamsData = await response.json();
      
      if (response.ok && teamsData.success) {
        // APIから返されるデータ構造に合わせて処理
        let assignedTeams = [];
        if (teamsData.data && typeof teamsData.data === 'object') {
          if (Array.isArray(teamsData.data)) {
            assignedTeams = teamsData.data;
          } else if (teamsData.data.teams && Array.isArray(teamsData.data.teams)) {
            assignedTeams = teamsData.data.teams;
          }
        }

        // ブロック別にチームを整理
        const blockTeamMap: Record<string, Team[]> = {};
        
        // 各ブロックの最大チーム数を動的に計算
        const maxTeamsPerBlock = Math.max(6, Math.ceil(assignedTeams.length / preliminaryBlocks.size));
        
        // 初期化（動的なチーム数分のスロットを作成）
        Array.from(preliminaryBlocks).forEach(blockName => {
          blockTeamMap[blockName] = new Array(maxTeamsPerBlock).fill(undefined);
        });

        // 振分け済みチームを各ブロックに配置
        let hasAssignedTeams = false;
        assignedTeams.forEach((team: {
          tournament_team_id: number;
          team_id: string;
          team_name: string;
          team_omission?: string;
          contact_person?: string;
          contact_email?: string;
          player_count?: number;
          assigned_block: string;
          block_position: string
        }) => {
          if (team.assigned_block && team.block_position && preliminaryBlocks.has(team.assigned_block) && team.team_id && team.team_name) {
            const blockPosition = parseInt(team.block_position);
            const arrayIndex = blockPosition - 1;
            
            // 配列の境界チェック（動的なサイズに対応）
            if (arrayIndex >= 0 && arrayIndex < maxTeamsPerBlock) {
              const formattedTeam: Team = {
                tournament_team_id: team.tournament_team_id,
                team_id: team.team_id,
                team_name: team.team_name,
                team_omission: team.team_omission || '',
                contact_person: team.contact_person || '',
                contact_email: team.contact_email || '',
                registered_players_count: team.player_count || 0
              };

              blockTeamMap[team.assigned_block][arrayIndex] = formattedTeam;
              hasAssignedTeams = true;
            }
          }
        });

        // 既存の振分けがあるかを記録
        setHasExistingDraw(hasAssignedTeams);

        // ブロック構造を作成（既存の振分け情報を反映）
        const initialBlocks: Block[] = Array.from(preliminaryBlocks).sort().map(blockName => ({
          block_name: blockName,
          phase: 'preliminary',
          teams: blockTeamMap[blockName] // undefinedも含めて位置を保持
        }));

        console.log('Initial blocks created:', initialBlocks.map(block => ({
          block_name: block.block_name,
          teams: block.teams.map((team, index) => ({ position: index + 1, team: team?.team_name || 'undefined' }))
        })));

        setBlocks(initialBlocks);
      } else {
        // エラーの場合は空のブロックを作成
        const initialBlocks: Block[] = Array.from(preliminaryBlocks).sort().map(blockName => ({
          block_name: blockName,
          phase: 'preliminary',
          teams: []
        }));

        setBlocks(initialBlocks);
      }
    } catch (error) {
      console.error('振分け情報の取得に失敗:', error);
      
      // エラーの場合は空のブロックを作成
      const initialBlocks: Block[] = Array.from(preliminaryBlocks).sort().map(blockName => ({
        block_name: blockName,
        phase: 'preliminary',
        teams: []
      }));

      setBlocks(initialBlocks);
    }
  }, [tournamentId]);

  // ブロックの想定チーム数を取得するヘルパー関数
  const getExpectedTeamCount = (blockName: string): number | null => {
    const blockCount = blockTeamCounts.find(bc => bc.block_name === blockName);
    return blockCount ? blockCount.expected_team_count : null;
  };

  // 予選形式がトーナメントかどうかを判定
  const isTournamentFormat = (): boolean => {
    return tournament?.preliminary_format_type === 'tournament';
  };

  // 第1ラウンドのスロット情報を取得
  const getFirstRoundSlots = (blockName: string): FirstRoundSlot[] => {
    // 第1ラウンドの試合を抽出
    // - BYE試合（is_bye_match = 1）は常に第1ラウンド（シード枠）
    // - team1_sourceとteam2_sourceが空の試合も第1ラウンド
    const firstRoundMatches = matches.filter(
      m =>
        m.phase === 'preliminary' &&
        m.block_name === blockName &&
        (
          m.is_bye_match === 1 || // BYE試合（シード枠）は常に含める
          ((!m.team1_source || m.team1_source === '') &&
           (!m.team2_source || m.team2_source === ''))
        )
    );

    console.log(`[getFirstRoundSlots] Block ${blockName}:`, {
      totalMatches: matches.length,
      preliminaryMatches: matches.filter(m => m.phase === 'preliminary' && m.block_name === blockName).length,
      firstRoundMatches: firstRoundMatches.length,
      firstRoundMatchCodes: firstRoundMatches.map(m => m.match_code),
      byeMatches: firstRoundMatches.filter(m => m.is_bye_match === 1).map(m => m.match_code)
    });

    // スロット情報に変換
    return firstRoundMatches.map(m => ({
      match_code: m.match_code,
      match_id: m.match_id,
      is_bye_match: m.is_bye_match === 1,
      team1: m.team1_display_name
        ? {
            tournament_team_id: m.team1_tournament_team_id,
            team_name: m.team1_name || m.team1_display_name,
            position: m.team1_display_name
          }
        : null,
      team2: m.team2_display_name
        ? {
            tournament_team_id: m.team2_tournament_team_id,
            team_name: m.team2_name || m.team2_display_name,
            position: m.team2_display_name
          }
        : null,
      isDraggable: m.is_bye_match !== 1
    }));
  };

  // チームソースを解決して実際のチーム名を取得
  const resolveTeamSource = (source: string | null | undefined): string | null => {
    if (!source) return null;

    // ソース形式: "A1_winner", "Ep1_winner", "A2_loser" など
    // match_codeと勝者/敗者を抽出
    const matchResult = source.match(/^([A-Za-z0-9]+)_(winner|loser)$/);
    if (!matchResult) return null;

    const matchCode = matchResult[1];

    // 該当する試合を探す
    const sourceMatch = matches.find(m => m.match_code === matchCode);
    if (!sourceMatch) {
      console.log(`[resolveTeamSource] Match not found for code: ${matchCode}`);
      return null;
    }

    // 不戦勝試合の場合、team1が自動的に勝者
    if (sourceMatch.is_bye_match === 1) {
      const resolvedName = sourceMatch.team1_name || null;
      console.log(`[resolveTeamSource] Bye match ${matchCode}: team1_name="${resolvedName}"`);
      return resolvedName;
    }

    // 通常試合の場合、まだ結果が確定していないのでnullを返す
    // (試合結果入力後に勝者/敗者が決まる)
    return null;
  };

  // ブロックのステータスを判定（緑/黄/赤）
  const getBlockStatus = (block: Block): 'match' | 'insufficient' | 'excess' | 'unknown' => {
    const currentCount = block.teams.filter(team => team && team.team_id).length;
    const expectedCount = getExpectedTeamCount(block.block_name);

    if (expectedCount === null) return 'unknown';

    if (currentCount === expectedCount) return 'match';
    if (currentCount < expectedCount) return 'insufficient';
    return 'excess';
  };

  // ステータスに応じた色を返す
  const getBlockHeaderClass = (status: 'match' | 'insufficient' | 'excess' | 'unknown'): string => {
    switch (status) {
      case 'match':
        return 'bg-green-50 border-green-300 text-green-900';
      case 'insufficient':
        return 'bg-yellow-50 border-yellow-300 text-yellow-900';
      case 'excess':
        return 'bg-red-50 border-red-300 text-red-900';
      default:
        return '';
    }
  };

  // リセット実行
  const handleReset = () => {
    const isTournament = isTournamentFormat();

    if (isTournament) {
      // トーナメント形式の場合: 初期データに戻す
      if (initialMatches.length > 0) {
        // 初期データのディープコピーを作成
        const resetMatches = initialMatches.map(m => ({
          ...m,
          // チーム割り当てを完全にクリア
          team1_tournament_team_id: undefined,
          team2_tournament_team_id: undefined,
          team1_name: undefined,
          team2_name: undefined
        }));

        // 不戦勝試合の勝者を次のラウンドの試合のdisplay_nameに反映
        const byeMatchWinners: Record<string, string> = {};
        resetMatches.forEach(m => {
          if (m.is_bye_match === 1) {
            // 不戦勝試合の勝者を特定（team1_display_nameまたはteam2_display_name）
            const winner = m.team1_display_name || m.team2_display_name || '';
            if (winner && m.match_code) {
              byeMatchWinners[`${m.match_code}_winner`] = winner;
              console.log(`[Reset] 不戦勝試合 ${m.match_code}: 勝者プレースホルダー = ${winner}`);
            }
          }
        });

        // 次のラウンドの試合のteam1_display_name/team2_display_nameを解決
        resetMatches.forEach(m => {
          if (m.team1_source && byeMatchWinners[m.team1_source]) {
            m.team1_display_name = byeMatchWinners[m.team1_source];
            console.log(`[Reset] ${m.match_code}: team1_source=${m.team1_source} → ${m.team1_display_name}`);
          }
          if (m.team2_source && byeMatchWinners[m.team2_source]) {
            m.team2_display_name = byeMatchWinners[m.team2_source];
            console.log(`[Reset] ${m.match_code}: team2_source=${m.team2_source} → ${m.team2_display_name}`);
          }
        });

        setMatches(resetMatches);
      } else {
        // フォールバック: matchesのチーム割り当てをクリア
        const newMatches = matches.map(m => {
          // 第1ラウンドの試合: チームIDと名前をクリア
          if (m.phase === 'preliminary' && (!m.team1_source || m.team1_source === '') && (!m.team2_source || m.team2_source === '')) {
            return {
              ...m,
              team1_tournament_team_id: undefined,
              team1_name: undefined,
              team2_tournament_team_id: undefined,
              team2_name: undefined
            };
          }
          // 次のラウンド以降の試合: team1_name/team2_nameのみクリア（ソースから解決された名前を削除）
          if (m.phase === 'preliminary' && (m.team1_source || m.team2_source)) {
            return {
              ...m,
              team1_name: undefined,
              team2_name: undefined
            };
          }
          return m;
        });
        setMatches(newMatches);
      }
    }

    // blocksをリセット
    const newBlocks = blocks.map(block => ({
      ...block,
      teams: [] as Team[]
    }));
    setBlocks(newBlocks);
  };

  // ランダム振付実行
  const handleRandomDraw = () => {
    if (blocks.length === 0) return;

    // 有効なチームのみをシャッフル対象にする
    const validTeams = registeredTeams.filter(team => team && team.team_id && team.team_name);
    const shuffledTeams = [...validTeams].sort(() => Math.random() - 0.5);

    const isTournament = isTournamentFormat();

    if (isTournament) {
      // トーナメント形式の場合
      const newMatches = [...matches];
      const newBlocks: Block[] = blocks.map(block => ({
        ...block,
        teams: [] as Team[]
      }));

      let teamIndex = 0;

      blocks.forEach((block, blockIndex) => {
        // 第1ラウンドの試合を直接取得（割り当て前の状態）
        const firstRoundMatches = newMatches.filter(
          m =>
            m.phase === 'preliminary' &&
            m.block_name === block.block_name &&
            (!m.team1_source || m.team1_source === '') &&
            (!m.team2_source || m.team2_source === '')
        );

        // 各試合について、割り当て可能な位置にチームを配置
        firstRoundMatches.forEach(match => {
          const isByeMatch = match.is_bye_match === 1;

          // 不戦勝試合の場合、team1にチームを割り当て、team2はクリア
          if (isByeMatch) {
            if (teamIndex < shuffledTeams.length) {
              const team = shuffledTeams[teamIndex];
              match.team1_tournament_team_id = team.tournament_team_id;
              match.team1_name = team.team_name;
              match.team2_tournament_team_id = undefined;
              match.team2_name = undefined;
              newBlocks[blockIndex].teams.push(team);
              teamIndex++;
            }
          } else {
            // 通常試合の場合、両方のチーム位置に割り当て
            if (teamIndex < shuffledTeams.length) {
              const team1 = shuffledTeams[teamIndex];
              match.team1_tournament_team_id = team1.tournament_team_id;
              match.team1_name = team1.team_name;
              newBlocks[blockIndex].teams.push(team1);
              teamIndex++;
            } else {
              match.team1_tournament_team_id = undefined;
              match.team1_name = undefined;
            }
            if (teamIndex < shuffledTeams.length) {
              const team2 = shuffledTeams[teamIndex];
              match.team2_tournament_team_id = team2.tournament_team_id;
              match.team2_name = team2.team_name;
              newBlocks[blockIndex].teams.push(team2);
              teamIndex++;
            } else {
              match.team2_tournament_team_id = undefined;
              match.team2_name = undefined;
            }
          }
        });
      });

      // 不戦勝試合の勝者を次のラウンドの試合に反映
      const byeMatchWinners: Record<string, string> = {};
      newMatches.forEach(m => {
        if (m.is_bye_match === 1 && m.team1_name) {
          byeMatchWinners[`${m.match_code}_winner`] = m.team1_name;
          console.log(`[RandomDraw] 不戦勝試合 ${m.match_code}: 勝者 = ${m.team1_name}`);
        }
      });

      // 次のラウンドの試合のteam1_name/team2_nameを解決
      newMatches.forEach(m => {
        if (m.team1_source && byeMatchWinners[m.team1_source]) {
          m.team1_name = byeMatchWinners[m.team1_source];
          console.log(`[RandomDraw] ${m.match_code}: team1_source=${m.team1_source} → ${m.team1_name}`);
        }
        if (m.team2_source && byeMatchWinners[m.team2_source]) {
          m.team2_name = byeMatchWinners[m.team2_source];
          console.log(`[RandomDraw] ${m.match_code}: team2_source=${m.team2_source} → ${m.team2_name}`);
        }
      });

      setMatches(newMatches);
      setBlocks(newBlocks);
    } else {
      // リーグ形式の場合（既存のロジック）
      if (blockTeamCounts.length > 0) {
        const newBlocks: Block[] = blocks.map(block => ({
          ...block,
          teams: [] as Team[]
        }));

        let teamIndex = 0;
        blocks.forEach((block, blockIndex) => {
          const expectedCount = getExpectedTeamCount(block.block_name);
          const count = expectedCount !== null ? expectedCount : Math.ceil(shuffledTeams.length / blocks.length);

          for (let i = 0; i < count && teamIndex < shuffledTeams.length; i++) {
            newBlocks[blockIndex].teams.push(shuffledTeams[teamIndex]);
            teamIndex++;
          }
        });

        setBlocks(newBlocks);
      } else {
        // 想定チーム数が取得できない場合は均等に振分
        const teamsPerBlock = Math.ceil(shuffledTeams.length / blocks.length);

        const newBlocks = blocks.map((block, index) => {
          const startIndex = index * teamsPerBlock;
          const endIndex = Math.min(startIndex + teamsPerBlock, shuffledTeams.length);
          return {
            ...block,
            teams: shuffledTeams.slice(startIndex, endIndex)
          };
        });

        setBlocks(newBlocks);
      }
    }
  };

  // チームをブロック間で移動
  const moveTeam = (tournamentTeamId: number, fromBlockIndex: number, toBlockIndex: number) => {
    if (fromBlockIndex === toBlockIndex) return;

    const newBlocks = [...blocks];
    const fromBlock = newBlocks[fromBlockIndex];
    const toBlock = newBlocks[toBlockIndex];

    const teamIndex = fromBlock.teams.findIndex(team => team && team.tournament_team_id === tournamentTeamId);
    if (teamIndex === -1) return;

    const [team] = fromBlock.teams.splice(teamIndex, 1);

    // 移動するチームが有効か確認
    if (team && team.team_id && team.team_name) {
      toBlock.teams.push(team);
    } else {
      console.error('Invalid team data during move operation:', team);
    }

    setBlocks(newBlocks);
  };

  // ブロック内でチームの順番を変更
  const moveTeamWithinBlock = (blockIndex: number, teamIndex: number, direction: 'up' | 'down') => {
    const newBlocks = [...blocks];
    const block = newBlocks[blockIndex];

    if (direction === 'up' && teamIndex === 0) return; // 既に先頭
    if (direction === 'down' && teamIndex === block.teams.length - 1) return; // 既に末尾

    const targetIndex = direction === 'up' ? teamIndex - 1 : teamIndex + 1;

    // チームの位置を入れ替え（安全性チェック付き）
    const currentTeam = block.teams[teamIndex];
    const targetTeam = block.teams[targetIndex];

    if (currentTeam && targetTeam && currentTeam.team_id && targetTeam.team_id) {
      [block.teams[teamIndex], block.teams[targetIndex]] = [targetTeam, currentTeam];
    } else {
      console.error('Invalid team data during position swap:', { currentTeam, targetTeam });
      return;
    }

    setBlocks(newBlocks);
  };

  // トーナメント形式: チーム単位で移動
  const handleTournamentMoveTeam = (fromBlockIndex: number) => (
    fromSlotIndex: number,
    fromTeamPosition: 'team1' | 'team2',
    toBlockIndex: number,
    toSlotIndex: number,
    toTeamPosition: 'team1' | 'team2'
  ) => {
    const fromBlock = blocks[fromBlockIndex];
    const toBlock = blocks[toBlockIndex];

    const fromSlots = getFirstRoundSlots(fromBlock.block_name);
    const toSlots = getFirstRoundSlots(toBlock.block_name);

    if (!fromSlots[fromSlotIndex] || !toSlots[toSlotIndex]) return;

    const fromSlot = fromSlots[fromSlotIndex];
    const toSlot = toSlots[toSlotIndex];

    // matchesを更新
    const newMatches = [...matches];

    const fromMatchIndex = newMatches.findIndex(m => m.match_code === fromSlot.match_code);
    const toMatchIndex = newMatches.findIndex(m => m.match_code === toSlot.match_code);

    if (fromMatchIndex === -1 || toMatchIndex === -1) return;

    const fromMatch = newMatches[fromMatchIndex];
    const toMatch = newMatches[toMatchIndex];

    // 移動元のチーム情報を取得
    const fromTeamId = fromTeamPosition === 'team1' ? fromMatch.team1_tournament_team_id : fromMatch.team2_tournament_team_id;
    const fromTeamName = fromTeamPosition === 'team1' ? fromMatch.team1_name : fromMatch.team2_name;

    // 移動先のチーム情報を取得
    const toTeamId = toTeamPosition === 'team1' ? toMatch.team1_tournament_team_id : toMatch.team2_tournament_team_id;
    const toTeamName = toTeamPosition === 'team1' ? toMatch.team1_name : toMatch.team2_name;

    // チームを入れ替え
    if (fromTeamPosition === 'team1') {
      fromMatch.team1_tournament_team_id = toTeamId;
      fromMatch.team1_name = toTeamName;
    } else {
      fromMatch.team2_tournament_team_id = toTeamId;
      fromMatch.team2_name = toTeamName;
    }

    if (toTeamPosition === 'team1') {
      toMatch.team1_tournament_team_id = fromTeamId;
      toMatch.team1_name = fromTeamName;
    } else {
      toMatch.team2_tournament_team_id = fromTeamId;
      toMatch.team2_name = fromTeamName;
    }

    // 不戦勝試合の勝者を次のラウンドの試合に反映
    const byeMatchWinners: Record<string, string> = {};
    newMatches.forEach(m => {
      if (m.is_bye_match === 1 && m.team1_name) {
        byeMatchWinners[`${m.match_code}_winner`] = m.team1_name;
      }
    });

    // 次のラウンドの試合のteam1_name/team2_nameを解決
    newMatches.forEach(m => {
      if (m.team1_source && byeMatchWinners[m.team1_source]) {
        m.team1_name = byeMatchWinners[m.team1_source];
      }
      if (m.team2_source && byeMatchWinners[m.team2_source]) {
        m.team2_name = byeMatchWinners[m.team2_source];
      }
    });

    setMatches(newMatches);

    // blocksも更新（チームが存在する場合のみ）
    const newBlocks = [...blocks];
    if (fromTeamId && toTeamId) {
      // 両方にチームがいる場合は特に更新不要（matchesの更新で反映される）
      setBlocks(newBlocks);
    } else if (fromTeamId && !toTeamId) {
      // 移動のみの場合も特に更新不要
      setBlocks(newBlocks);
    } else if (!fromTeamId && toTeamId) {
      // 移動のみの場合も特に更新不要
      setBlocks(newBlocks);
    }
  };

  // 振分結果を保存
  const handleSave = async () => {
    try {
      setSaving(true);

      // バリデーション: ブロックごとに想定チーム数と現在のチーム数を確認
      if (blockTeamCounts.length > 0) {
        const errors: string[] = [];

        blocks.forEach(block => {
          const currentCount = block.teams.filter(team => team && team.team_id).length;
          const expectedCount = getExpectedTeamCount(block.block_name);

          if (expectedCount !== null && currentCount !== expectedCount) {
            errors.push(`${block.block_name}ブロック: ${currentCount}/${expectedCount}チーム (想定と一致しません)`);
          }
        });

        if (errors.length > 0) {
          const errorMessage = '以下のブロックで想定チーム数と異なります:\n\n' + errors.join('\n') + '\n\n保存を中止しました。';
          alert(errorMessage);
          setSaving(false);
          return;
        }
      }

      // トーナメント形式の場合、matchesから直接チーム割り当て情報を抽出
      let drawData;
      if (isTournamentFormat()) {
        // 第1ラウンドの試合からチーム位置を特定
        const teamPositionMap = new Map<number, number>(); // tournament_team_id → block_position

        blocks.forEach(block => {
          const firstRoundMatches = matches.filter(
            m =>
              m.phase === 'preliminary' &&
              m.block_name === block.block_name &&
              (!m.team1_source || m.team1_source === '') &&
              (!m.team2_source || m.team2_source === '')
          );

          firstRoundMatches.forEach(match => {
            // team1_display_name（例：T1チーム）から位置番号を抽出
            const extractPosition = (displayName: string): number | null => {
              const m = displayName.match(/([A-Za-z]+)(\d+)チーム$/);
              return m ? parseInt(m[2]) : null;
            };

            if (match.team1_tournament_team_id) {
              const position = extractPosition(match.team1_display_name);
              if (position !== null) {
                teamPositionMap.set(match.team1_tournament_team_id, position);
              }
            }

            if (match.team2_tournament_team_id) {
              const position = extractPosition(match.team2_display_name);
              if (position !== null) {
                teamPositionMap.set(match.team2_tournament_team_id, position);
              }
            }
          });
        });

        console.log('[Draw Save] Team position map:', Object.fromEntries(teamPositionMap));

        // teamPositionMapを使ってdrawDataを作成
        drawData = blocks.map(block => ({
          block_name: block.block_name,
          teams: block.teams
            .filter(team => team && team.team_id)
            .map(team => ({
              tournament_team_id: team.tournament_team_id,
              team_id: team.team_id,
              block_position: teamPositionMap.get(team.tournament_team_id) || 0
            }))
            .filter(team => team.block_position > 0) // 位置が特定できたチームのみ
        }));
      } else {
        // リーグ形式の場合は従来通り
        drawData = blocks.map(block => ({
          block_name: block.block_name,
          teams: block.teams
            .filter(team => team && team.team_id)
            .map((team, index) => ({
              tournament_team_id: team.tournament_team_id,
              team_id: team.team_id,
              block_position: index + 1
            }))
        }));
      }

      // トーナメント形式の場合、matches情報も送信
      const requestBody = isTournamentFormat()
        ? {
            blocks: drawData,
            matches: matches
              .filter(m => m.phase === 'preliminary' && (!m.team1_source || m.team1_source === '') && (!m.team2_source || m.team2_source === ''))
              .map(m => ({
                match_id: m.match_id,
                team1_tournament_team_id: m.team1_tournament_team_id,
                team2_tournament_team_id: m.team2_tournament_team_id,
                team1_id: m.team1_id,
                team2_id: m.team2_id
              }))
          }
        : { blocks: drawData };

      const response = await fetch(`/api/tournaments/${tournamentId}/draw`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        const errorMessage = result.error || '振分結果の保存に失敗しました';
        const detailsMessage = result.details ? ` (詳細: ${result.details})` : '';
        throw new Error(errorMessage + detailsMessage);
      }

      router.push('/admin');

    } catch (err) {
      console.error('保存エラー:', err);
      alert(err instanceof Error ? err.message : '保存中にエラーが発生しました');
    } finally {
      setSaving(false);
    }
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

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Card className="max-w-md mx-auto">
          <CardContent className="p-6 text-center">
            <p className="text-red-600 mb-4">{error}</p>
            <Button onClick={() => router.push('/admin')} variant="outline">
              ダッシュボードに戻る
            </Button>
          </CardContent>
        </Card>
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
      <div className="bg-card shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-6">
            <div>
              <h1 className="text-3xl font-bold text-foreground">
                {hasExistingDraw ? '組合せ編集' : '組合せ作成'}
              </h1>
              <p className="text-sm text-muted-foreground mt-1">
                {tournament.tournament_name}
                {hasExistingDraw && <span className="ml-2 text-green-600">※ 既存の組合せを編集中</span>}
              </p>
            </div>
            <div className="flex space-x-3">
              <Button
                variant="outline"
                onClick={() => router.push('/admin')}
              >
                ダッシュボードに戻る
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* 大会情報サマリー */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>大会情報</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="flex items-center">
                <Calendar className="w-5 h-5 mr-2 text-muted-foreground" />
                <div>
                  <p className="text-sm text-muted-foreground">開催期間</p>
                  <p className="font-medium">{tournament.tournament_period}</p>
                </div>
              </div>
              <div className="flex items-center">
                <MapPin className="w-5 h-5 mr-2 text-muted-foreground" />
                <div>
                  <p className="text-sm text-muted-foreground">会場</p>
                  <p className="font-medium">{tournament.venue_name}</p>
                </div>
              </div>
              <div className="flex items-center">
                <Users className="w-5 h-5 mr-2 text-muted-foreground" />
                <div>
                  <p className="text-sm text-muted-foreground">参加チーム</p>
                  <p className="font-medium">{registeredTeams.length} / {tournament.team_count}チーム</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 操作ボタン */}
        <Card className="mb-6">
          <CardContent className="p-6">
            <div className="flex flex-wrap gap-3">
              <Button 
                variant="outline"
                onClick={handleRandomDraw}
                disabled={registeredTeams.length === 0}
                className="flex items-center"
              >
                <Shuffle className="w-4 h-4 mr-2" />
                ランダム振分
              </Button>
              <Button 
                variant="outline" 
                onClick={handleReset}
                className="flex items-center"
              >
                <RotateCcw className="w-4 h-4 mr-2" />
                リセット
              </Button>
              <Button 
                variant="outline"
                onClick={handleSave}
                disabled={saving || blocks.every(block => block.teams.length === 0)}
                className="flex items-center"
              >
                <Save className="w-4 h-4 mr-2" />
                {saving ? '保存中...' : '振分を保存'}
              </Button>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* 参加チーム一覧 */}
          <Card>
            <CardHeader>
              <CardTitle className="flex flex-col gap-2">
                <span>参加チーム一覧 ({registeredTeams.length}チーム)</span>
                <span className="text-sm font-normal text-blue-600">
                  ※ 参加確定チームのみ表示しています（キャンセル済・待機中のチームは含まれません）
                </span>
                {hasExistingDraw && (
                  <span className="text-sm font-normal text-green-600">
                    ※ 振分け済みチームは各ブロックに表示されています
                  </span>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {registeredTeams.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">
                  参加チームがありません
                </p>
              ) : (
                <div className="space-y-3">
                  {registeredTeams.map((team) => {
                    // team_idが存在することを確認
                    if (!team || !team.team_id) return null;
                    
                    // このチームが既にブロックに振分けされているかチェック
                    const isAssigned = blocks.some(block =>
                      block.teams && block.teams.some(blockTeam => blockTeam && blockTeam.tournament_team_id === team.tournament_team_id)
                    );

                    return (
                      <div
                        key={team.tournament_team_id}
                        className={`p-3 border rounded-lg hover:bg-muted ${
                          isAssigned ? 'bg-muted border-muted opacity-75' : ''
                        }`}
                      >
                        <div className="flex justify-between items-center">
                          <div>
                            <p className={`font-medium ${isAssigned ? 'text-muted-foreground' : ''}`}>
                              {team.team_name}
                              {isAssigned && <span className="text-xs text-green-600 ml-2">(振分け済み)</span>}
                            </p>
                            <p className={`text-sm ${isAssigned ? 'text-muted-foreground' : 'text-muted-foreground'}`}>
                              代表者: {team.contact_person}
                            </p>
                          </div>
                          <Badge variant={isAssigned ? "secondary" : "outline"}>
                            {team.registered_players_count}名
                          </Badge>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* ブロック振分結果 */}
          <div className="space-y-4">
            {blocks.filter(block => {
              const expectedCount = getExpectedTeamCount(block.block_name);
              // 割り当てる枠が0のブロック（team1_source/team2_sourceのみのブロック）を除外
              // expectedCountがnullの場合、blockTeamCountsにデータがない=第1ラウンド試合がない=表示不要
              return expectedCount !== null && expectedCount > 0;
            }).map((block, blockIndex) => {
              const currentCount = block.teams.filter(team => team && team.team_id).length;
              const expectedCount = getExpectedTeamCount(block.block_name);
              const status = getBlockStatus(block);
              const headerClass = getBlockHeaderClass(status);

              // トーナメント形式かどうかを判定
              const isTournament = isTournamentFormat();

              return (
                <Card key={block.block_name}>
                  <CardHeader className={headerClass}>
                    <CardTitle className="text-lg">
                      {block.block_name}ブロック ({currentCount}{expectedCount !== null ? `/${expectedCount}` : ''}チーム)
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                  {isTournament ? (
                    /* トーナメント形式の表示 */
                    <TournamentBracketEditor
                      blockName={block.block_name}
                      slots={getFirstRoundSlots(block.block_name)}
                      allSlots={blocks.map(b => getFirstRoundSlots(b.block_name))}
                      blockNames={blocks.map(b => b.block_name)}
                      currentBlockIndex={blockIndex}
                      onMoveTeam={handleTournamentMoveTeam(blockIndex)}
                    />
                  ) : block.teams.filter(team => team && team.team_id).length === 0 ? (
                    <div className="border-2 border-dashed border-muted rounded-lg p-8 text-center">
                      <p className="text-muted-foreground">チームが振り分けられていません</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {block.teams.map((team, teamIndex) => {
                        // 安全性チェック: teamオブジェクトが有効か確認
                        if (!team || !team.team_id || !team.team_name) {
                          return null;
                        }
                        
                        return (
                          <div
                            key={team.tournament_team_id}
                            className="p-4 bg-blue-50 border border-blue-200 rounded-lg"
                          >
                            {/* チーム情報エリア */}
                            <div className="mb-3">
                              <p className="font-medium text-blue-900 text-base leading-relaxed">
                                {block.block_name}{teamIndex + 1}. {team.team_name}
                              </p>
                              <p className="text-sm text-blue-700 mt-1">
                                {team.contact_person || '連絡先不明'}
                              </p>
                            </div>
                            
                            {/* ボタンエリア */}
                            <div className="flex justify-between items-center">
                              {/* 順番変更ボタン */}
                              <div className="flex items-center space-x-2">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => moveTeamWithinBlock(blockIndex, teamIndex, 'up')}
                                  disabled={teamIndex === 0}
                                  className="px-2 py-1 h-8 w-8"
                                  title="上に移動"
                                >
                                  <ChevronUp className="w-4 h-4" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => moveTeamWithinBlock(blockIndex, teamIndex, 'down')}
                                  disabled={teamIndex === block.teams.length - 1}
                                  className="px-2 py-1 h-8 w-8"
                                  title="下に移動"
                                >
                                  <ChevronDown className="w-4 h-4" />
                                </Button>
                              </div>
                              
                              {/* ブロック間移動ボタン */}
                              <div className="flex flex-wrap gap-1">
                                {blocks.map((_, otherBlockIndex) => {
                                  if (blockIndex !== otherBlockIndex) {
                                    return (
                                      <Button
                                        key={otherBlockIndex}
                                        size="sm"
                                        variant="outline"
                                        onClick={() => moveTeam(team.tournament_team_id, blockIndex, otherBlockIndex)}
                                        className="text-xs px-2 py-1 h-7 min-w-[2.5rem]"
                                      >
                                        → {blocks[otherBlockIndex].block_name}
                                      </Button>
                                    );
                                  }
                                  return null;
                                })}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
              );
            })}
          </div>
        </div>

        {/* 試合スケジュールプレビュー */}
        {matches.length > 0 && (
          <Card className="mt-8">
            <CardHeader>
              <CardTitle>試合スケジュールプレビュー</CardTitle>
              <p className="text-sm text-gray-500">
                チーム振分後の試合対戦表です
              </p>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full table-auto">
                  <thead>
                    <tr className="border-b bg-muted">
                      <th className="px-4 py-3 text-left">試合</th>
                      <th className="px-4 py-3 text-left">フェーズ</th>
                      <th className="px-4 py-3 text-left">対戦カード</th>
                      <th className="px-4 py-3 text-left">日程</th>
                      <th className="px-4 py-3 text-left">コート</th>
                    </tr>
                  </thead>
                  <tbody>
                    {matches
                      .filter(match => match.is_bye_match !== 1) // 不戦勝試合を除外
                      .map((match, index, filteredMatches) => {
                      // ラウンド名の境界線を表示するかチェック
                      const showRoundHeader = index === 0 || filteredMatches[index - 1].round_name !== match.round_name;

                      const rows = [];

                      // ラウンド名ヘッダー行を追加
                      if (showRoundHeader) {
                        rows.push(
                          <tr key={`round-header-${match.round_name}-${index}`}>
                            <td colSpan={5} className="px-4 py-2 bg-blue-50 border-b">
                              <div className="flex items-center">
                                <Badge variant="secondary" className="mr-2">
                                  {match.round_name || match.block_name || (match.phase === 'preliminary' ? '予選リーグ' : '決勝トーナメント')}
                                </Badge>
                              </div>
                            </td>
                          </tr>
                        );
                      }

                      // 試合行を追加
                      rows.push(
                        <tr key={`match-${match.match_id}`} className="border-b hover:bg-muted">
                          <td className="px-4 py-3 font-medium">{match.match_code}</td>
                          <td className="px-4 py-3">
                            <Badge variant="outline" className="text-xs">
                              {match.phase === 'preliminary' ? '予選' : '決勝'}
                            </Badge>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center space-x-2">
                              <span className={(match.team1_name && match.team1_name !== match.team1_display_name) ? 'font-medium text-blue-900' : 'text-muted-foreground'}>
                                {(() => {
                                  const team1 = match.team1_name || resolveTeamSource(match.team1_source) || match.team1_display_name;
                                  if (match.match_code === 'A3') {
                                    console.log(`[Preview A3] team1: name="${match.team1_name}", source="${match.team1_source}", display="${match.team1_display_name}", resolved="${team1}"`);
                                  }
                                  return team1;
                                })()}
                              </span>
                              <span className="text-muted-foreground font-bold">vs</span>
                              <span className={(match.team2_name && match.team2_name !== match.team2_display_name) ? 'font-medium text-blue-900' : 'text-muted-foreground'}>
                                {(() => {
                                  const team2 = match.team2_name || resolveTeamSource(match.team2_source) || match.team2_display_name;
                                  if (match.match_code === 'A3') {
                                    console.log(`[Preview A3] team2: name="${match.team2_name}", source="${match.team2_source}", display="${match.team2_display_name}", resolved="${team2}"`);
                                  }
                                  return team2;
                                })()}
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-sm">
                            <div>
                              <p>{new Date(match.tournament_date).toLocaleDateString('ja-JP')}</p>
                              {match.start_time && (
                                <p className="text-muted-foreground">{match.start_time}</p>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-sm">
                            {match.court_number ? `コート${match.court_number}` : '-'}
                          </td>
                        </tr>
                      );

                      return rows;
                    })}
                  </tbody>
                </table>
                <div className="mt-4 text-sm text-muted-foreground text-center">
                  全 {matches.filter(m => m.is_bye_match !== 1).length} 試合
                  <span className="ml-4">
                    予選: {matches.filter(m => m.phase === 'preliminary' && m.is_bye_match !== 1).length}試合
                  </span>
                  <span className="ml-4">
                    決勝: {matches.filter(m => m.phase === 'final' && m.is_bye_match !== 1).length}試合
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

// チーム表示名からブロック内の実際のチームを取得する関数（将来使用予定）
// function getTeamByPosition(displayName: string, blocks: Block[]): Team | null {
//   // デバッグ用ログ
//   console.log('getTeamByPosition called with:', displayName, 'blocks:', blocks.length);
//   
//   if (!displayName || typeof displayName !== 'string') {
//     console.log('Invalid displayName:', displayName);
//     return null;
//   }
//   
//   // "A1チーム" -> ブロックA、1番目のチーム
//   const match = displayName.match(/^([A-Z])(\d+)チーム$/);
//   if (!match) {
//     console.log('No regex match for displayName:', displayName);
//     return null;
//   }
//   
//   const [, blockName, position] = match;
//   const block = blocks.find(b => b.block_name === blockName);
//   if (!block) {
//     console.log('Block not found:', blockName, 'Available blocks:', blocks.map(b => b.block_name));
//     return null;
//   }
//   
//   const teamIndex = parseInt(position) - 1;
//   const team = block.teams[teamIndex];
//   console.log(`Looking for position ${position} (index ${teamIndex}) in block ${blockName}:`, team?.team_name || 'undefined/null');
//   
//   // undefinedチェックを追加
//   if (!team) {
//     console.log('Team is undefined at position:', teamIndex);
//     return null;
//   }
//   
//   return team;
// }