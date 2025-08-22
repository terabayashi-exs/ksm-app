'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Shuffle, Save, RotateCcw, Users, Calendar, MapPin, ChevronUp, ChevronDown } from 'lucide-react';

interface Team {
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
}

interface Match {
  match_id: number;
  match_number: number;
  match_code: string;
  phase: string;
  block_name: string;
  round_name: string;
  team1_display_name: string;
  team2_display_name: string;
  team1_id?: string;
  team2_id?: string;
  tournament_date: string;
  start_time?: string;
  court_number?: number;
}

interface Block {
  block_name: string;
  phase: string;
  teams: Team[];
}

export default function TournamentDrawPage() {
  const router = useRouter();
  const params = useParams();
  const tournamentId = params.id as string;

  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [registeredTeams, setRegisteredTeams] = useState<Team[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [blocks, setBlocks] = useState<Block[]>([]);
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
        let teams = [];
        if (teamsData.data && typeof teamsData.data === 'object') {
          if (Array.isArray(teamsData.data)) {
            teams = teamsData.data;
          } else if (teamsData.data.teams && Array.isArray(teamsData.data.teams)) {
            teams = teamsData.data.teams;
          }
        }
        
        const formattedTeams = teams.map((team: { team_id: string; team_name: string; team_omission: string; contact_person: string; player_count: number; registration_type: string }) => ({
          team_id: team.team_id,
          team_name: team.team_name,
          team_omission: team.team_omission,
          contact_person: team.contact_person,
          contact_email: team.contact_email,
          registered_players_count: team.player_count || 0
        }));
        
        setRegisteredTeams(formattedTeams);

        // 試合情報を取得
        const matchesResponse = await fetch(`/api/tournaments/${tournamentId}/matches`);
        const matchesData = await matchesResponse.json();
        
        if (!matchesResponse.ok || !matchesData.success) {
          throw new Error(matchesData.error || '試合情報の取得に失敗しました');
        }
        
        setMatches(matchesData.data);
        
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
  }, [tournamentId]);

  // ブロック構造の初期化
  const initializeBlocks = async (teams: Team[], matches: Match[]) => {
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
        
        // 初期化（4チーム分のスロットを作成）
        Array.from(preliminaryBlocks).forEach(blockName => {
          blockTeamMap[blockName] = new Array(4).fill(undefined);
        });

        // 振分け済みチームを各ブロックに配置
        let hasAssignedTeams = false;
        assignedTeams.forEach((team: { team_id: string; team_name: string; assigned_block: string; block_position: string }) => {
          if (team.assigned_block && team.block_position && preliminaryBlocks.has(team.assigned_block)) {
            const blockPosition = parseInt(team.block_position);
            const arrayIndex = blockPosition - 1;
            
            // 配列の境界チェック
            if (arrayIndex >= 0 && arrayIndex < 4) {
              const formattedTeam: Team = {
                team_id: team.team_id,
                team_name: team.team_name,
                team_omission: team.team_omission,
                contact_person: team.contact_person,
                contact_email: team.contact_email,
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
  };

  // ランダム振分実行
  const handleRandomDraw = () => {
    if (blocks.length === 0) return;

    const shuffledTeams = [...registeredTeams].sort(() => Math.random() - 0.5);
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
  };

  // チームをブロック間で移動
  const moveTeam = (teamId: string, fromBlockIndex: number, toBlockIndex: number) => {
    if (fromBlockIndex === toBlockIndex) return;

    const newBlocks = [...blocks];
    const fromBlock = newBlocks[fromBlockIndex];
    const toBlock = newBlocks[toBlockIndex];
    
    const teamIndex = fromBlock.teams.findIndex(team => team.team_id === teamId);
    if (teamIndex === -1) return;

    const [team] = fromBlock.teams.splice(teamIndex, 1);
    toBlock.teams.push(team);

    setBlocks(newBlocks);
  };

  // ブロック内でチームの順番を変更
  const moveTeamWithinBlock = (blockIndex: number, teamIndex: number, direction: 'up' | 'down') => {
    const newBlocks = [...blocks];
    const block = newBlocks[blockIndex];
    
    if (direction === 'up' && teamIndex === 0) return; // 既に先頭
    if (direction === 'down' && teamIndex === block.teams.length - 1) return; // 既に末尾

    const targetIndex = direction === 'up' ? teamIndex - 1 : teamIndex + 1;
    
    // チームの位置を入れ替え
    [block.teams[teamIndex], block.teams[targetIndex]] = [block.teams[targetIndex], block.teams[teamIndex]];
    
    setBlocks(newBlocks);
  };

  // 振分結果を保存
  const handleSave = async () => {
    try {
      setSaving(true);
      
      const drawData = blocks.map(block => ({
        block_name: block.block_name,
        teams: block.teams.map((team, index) => ({
          team_id: team.team_id,
          block_position: index + 1
        }))
      }));

      const response = await fetch(`/api/tournaments/${tournamentId}/draw`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ blocks: drawData })
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

  // リセット
  const handleReset = () => {
    const resetBlocks = blocks.map(block => ({ ...block, teams: [] }));
    setBlocks(resetBlocks);
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
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-600">大会情報が見つかりません</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-6">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">
                {hasExistingDraw ? '組合せ編集' : '組合せ作成'}
              </h1>
              <p className="text-sm text-gray-500 mt-1">
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
                <Calendar className="w-5 h-5 mr-2 text-gray-400" />
                <div>
                  <p className="text-sm text-gray-500">開催期間</p>
                  <p className="font-medium">{tournament.tournament_period}</p>
                </div>
              </div>
              <div className="flex items-center">
                <MapPin className="w-5 h-5 mr-2 text-gray-400" />
                <div>
                  <p className="text-sm text-gray-500">会場</p>
                  <p className="font-medium">{tournament.venue_name}</p>
                </div>
              </div>
              <div className="flex items-center">
                <Users className="w-5 h-5 mr-2 text-gray-400" />
                <div>
                  <p className="text-sm text-gray-500">参加チーム</p>
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
              <CardTitle>
                参加チーム一覧 ({registeredTeams.length}チーム)
                {hasExistingDraw && (
                  <span className="text-sm font-normal text-green-600 ml-2">
                    ※ 振分け済みチームは各ブロックに表示
                  </span>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {registeredTeams.length === 0 ? (
                <p className="text-gray-500 text-center py-8">
                  参加チームがありません
                </p>
              ) : (
                <div className="space-y-3">
                  {registeredTeams.map((team) => {
                    // このチームが既にブロックに振分けされているかチェック
                    const isAssigned = blocks.some(block => 
                      block.teams.some(blockTeam => blockTeam.team_id === team.team_id)
                    );
                    
                    return (
                      <div 
                        key={team.team_id}
                        className={`p-3 border rounded-lg hover:bg-gray-50 ${
                          isAssigned ? 'bg-gray-50 border-gray-300 opacity-75' : ''
                        }`}
                      >
                        <div className="flex justify-between items-center">
                          <div>
                            <p className={`font-medium ${isAssigned ? 'text-gray-600' : ''}`}>
                              {team.team_name}
                              {isAssigned && <span className="text-xs text-green-600 ml-2">(振分け済み)</span>}
                            </p>
                            <p className={`text-sm ${isAssigned ? 'text-gray-400' : 'text-gray-500'}`}>
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
            {blocks.map((block, blockIndex) => (
              <Card key={block.block_name}>
                <CardHeader>
                  <CardTitle className="text-lg">
                    {block.block_name}ブロック ({block.teams.length}チーム)
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {block.teams.length === 0 ? (
                    <div className="border-2 border-dashed border-gray-200 rounded-lg p-8 text-center">
                      <p className="text-gray-500">チームが振り分けられていません</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {block.teams.map((team, teamIndex) => (
                        <div 
                          key={team.team_id}
                          className="p-3 bg-blue-50 border border-blue-200 rounded-lg"
                        >
                          <div className="flex justify-between items-center">
                            <div className="flex-1">
                              <p className="font-medium text-blue-900">
                                {block.block_name}{teamIndex + 1}. {team.team_name}
                              </p>
                              <p className="text-sm text-blue-700">
                                {team.contact_person}
                              </p>
                            </div>
                            <div className="flex items-center space-x-1">
                              {/* 順番変更ボタン */}
                              <div className="flex flex-col space-y-1">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => moveTeamWithinBlock(blockIndex, teamIndex, 'up')}
                                  disabled={teamIndex === 0}
                                  className="p-1 h-6 w-6"
                                  title="上に移動"
                                >
                                  <ChevronUp className="w-3 h-3" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => moveTeamWithinBlock(blockIndex, teamIndex, 'down')}
                                  disabled={teamIndex === block.teams.length - 1}
                                  className="p-1 h-6 w-6"
                                  title="下に移動"
                                >
                                  <ChevronDown className="w-3 h-3" />
                                </Button>
                              </div>
                              
                              {/* ブロック間移動ボタン */}
                              <div className="flex flex-wrap">
                                {blocks.map((_, otherBlockIndex) => (
                                  blockIndex !== otherBlockIndex && (
                                    <Button
                                      key={otherBlockIndex}
                                      size="sm"
                                      variant="outline"
                                      onClick={() => moveTeam(team.team_id, blockIndex, otherBlockIndex)}
                                      className="text-xs ml-1"
                                    >
                                      → {blocks[otherBlockIndex].block_name}
                                    </Button>
                                  )
                                ))}
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
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
                    <tr className="border-b bg-gray-50">
                      <th className="px-4 py-3 text-left">試合</th>
                      <th className="px-4 py-3 text-left">フェーズ</th>
                      <th className="px-4 py-3 text-left">対戦カード</th>
                      <th className="px-4 py-3 text-left">日程</th>
                      <th className="px-4 py-3 text-left">コート</th>
                    </tr>
                  </thead>
                  <tbody>
                    {matches.map((match, index) => {
                      // デバッグ用ログ
                      if (index === 0) {
                        console.log('First match data:', match);
                        console.log('All matches length:', matches.length);
                        console.log('Team names from API:', { team1_name: match.team1_name, team2_name: match.team2_name });
                      }
                      
                      // フェーズの境界線を表示するかチェック
                      const showPhaseHeader = index === 0 || matches[index - 1].phase !== match.phase;
                      
                      const rows = [];
                      
                      // フェーズヘッダー行を追加
                      if (showPhaseHeader) {
                        rows.push(
                          <tr key={`phase-header-${match.phase}-${index}`}>
                            <td colSpan={5} className="px-4 py-2 bg-blue-50 border-b">
                              <div className="flex items-center">
                                <Badge variant="secondary" className="mr-2">
                                  {match.phase === 'preliminary' ? '予選リーグ' : '決勝トーナメント'}
                                </Badge>
                                <span className="text-sm text-gray-600">
                                  {match.round_name || match.block_name}
                                </span>
                              </div>
                            </td>
                          </tr>
                        );
                      }

                      // 試合行を追加
                      rows.push(
                        <tr key={`match-${match.match_id}`} className="border-b hover:bg-gray-50">
                          <td className="px-4 py-3 font-medium">{match.match_code}</td>
                          <td className="px-4 py-3">
                            <Badge variant="outline" className="text-xs">
                              {match.phase === 'preliminary' ? '予選' : '決勝T'}
                            </Badge>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center space-x-2">
                              <span className={match.team1_name !== match.team1_display_name ? 'font-medium text-blue-900' : 'text-gray-500'}>
                                {match.team1_name}
                              </span>
                              <span className="text-gray-400 font-bold">vs</span>
                              <span className={match.team2_name !== match.team2_display_name ? 'font-medium text-blue-900' : 'text-gray-500'}>
                                {match.team2_name}
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-sm">
                            <div>
                              <p>{new Date(match.tournament_date).toLocaleDateString('ja-JP')}</p>
                              {match.start_time && (
                                <p className="text-gray-500">{match.start_time}</p>
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
                <div className="mt-4 text-sm text-gray-500 text-center">
                  全 {matches.length} 試合
                  <span className="ml-4">
                    予選: {matches.filter(m => m.phase === 'preliminary').length}試合
                  </span>
                  <span className="ml-4">
                    決勝T: {matches.filter(m => m.phase === 'final').length}試合
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