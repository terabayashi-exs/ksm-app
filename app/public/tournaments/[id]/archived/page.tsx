// app/public/tournaments/[id]/archived/page.tsx
import { Suspense } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import BackButton from '@/components/ui/back-button';
import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';
import Link from 'next/link';
import { ArrowLeft, Trophy, Users, Award, Archive, BarChart3 } from 'lucide-react';
import { formatDate } from '@/lib/utils';
import { ArchiveLoadingState } from '@/components/features/archived/ArchiveLoadingState';
import { ArchiveVersionManager } from '@/lib/archive-version-manager';
interface PageProps {
  params: Promise<{ id: string }>;
}

// アーカイブデータから大会詳細を取得する関数（API経由でBlob対応）
async function getArchivedTournamentDetail(id: string) {
  const tournamentId = parseInt(id);
  
  if (isNaN(tournamentId)) {
    throw new Error('有効な大会IDを指定してください');
  }

  try {
    // APIを通じてアーカイブデータを取得（Blob対応）
    const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000';
    const response = await fetch(`${baseUrl}/api/tournaments/${tournamentId}/archived-view`, {
      cache: 'no-store' // 常に最新データを取得
    });

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error('アーカイブデータが見つかりません');
      }
      throw new Error(`アーカイブデータの取得に失敗しました: ${response.status}`);
    }

    const result = await response.json();
    
    if (!result.success) {
      throw new Error(result.error || 'アーカイブデータの取得に失敗しました');
    }

    // データソース（blob/database）をログに記録
    console.log(`📦 アーカイブデータ取得: ${result.source || 'unknown'} (大会ID: ${tournamentId})`);

    return result.data;
  } catch (error) {
    console.error('アーカイブデータ取得エラー:', error);
    throw error;
  }
}

// データ型定義
interface TeamData {
  team_id: string;
  team_name: string;
  team_omission?: string;
  assigned_block?: string;
  block_position?: number;
  withdrawal_status?: string;
  player_count?: number;
}

interface MatchData {
  match_id: number;
  match_block_id: number;
  tournament_date: string;
  match_number: number;
  match_code: string;
  team1_tournament_team_id?: number;
  team2_tournament_team_id?: number;
  team1_display_name: string;
  team2_display_name: string;
  court_number?: number;
  start_time?: string;
  phase: string;
  display_round_name?: string;
  block_name: string;
  match_type?: string;
  block_order?: number;
  team1_goals: number;
  team2_goals: number;
  winner_tournament_team_id?: number;
  is_draw: number;
  is_walkover: number;
  match_status: string;
  result_status?: string;
  remarks?: string;
  has_result: number;
}

interface ResultData {
  match_code: string;
  team1_tournament_team_id?: number;
  team2_tournament_team_id?: number;
  team1_name: string;
  team2_name: string;
  team1_goals?: number;
  team2_goals?: number;
  winner_tournament_team_id?: number;
  is_draw?: number;
  is_walkover?: number;
  block_name: string;
}

interface StandingData {
  block_name: string;
  phase: string;
  format_type?: string;
  team_rankings?: string;
  remarks?: string;
}

/**
 * 順位データがリーグ形式（勝点・試合数等の統計あり）かどうかを判定
 * format_typeがあればそれを使用、なければデータ構造とphase文字列からフォールバック判定
 */
function isLeagueStandings(block: StandingData, rankings: TeamRanking[]): boolean {
  if (block.format_type) return block.format_type === 'league';
  // データ構造で判定: matches_playedやpointsがあればリーグ形式
  if (rankings.length > 0 && rankings[0].matches_played !== undefined && rankings[0].matches_played > 0) {
    return true;
  }
  // フォールバック: phase文字列で判定（レガシー互換）
  return block.phase === 'preliminary' || block.phase.includes('予選') || block.phase.includes('リーグ');
}

interface TeamRanking {
  team_id?: string;
  team_name: string;
  team_omission?: string;
  position: number;
  points?: number;
  matches_played?: number;
  wins?: number;
  draws?: number;
  losses?: number;
  goals_for?: number;
  goals_against?: number;
  goal_difference?: number;
}

// アーカイブ用のコンポーネント（既存コンポーネントの代用）
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function ArchivedTournamentSchedule({ matches, teams }: { matches: MatchData[], teams: TeamData[] }) {
  const teamMap = new Map(teams.map(t => [t.team_id, t]));

  // 試合データをブロック別・日付別にグループ化
  const matchesByBlock = matches.reduce((acc: Record<string, MatchData[]>, match) => {
    const blockName = match.block_name || 'その他';
    if (!acc[blockName]) acc[blockName] = [];
    acc[blockName].push(match);
    return acc;
  }, {});

  const formatScore = (team1Goals: number, team2Goals: number) => {
    return `${Math.floor(team1Goals)} - ${Math.floor(team2Goals)}`;
  };

  const getTeamDisplayName = (teamId: number | undefined | null, displayName: string) => {
    if (!teamId) return displayName;
    const teamIdStr = String(teamId);
    const team = teamMap.get(teamIdStr);
    return team ? team.team_name : displayName;
  };

  const formatMatchTime = (startTime: string | undefined | null) => {
    if (!startTime) return '--:--';
    return startTime.substring(0, 5);
  };

  return (
    <div className="space-y-6">
      {Object.entries(matchesByBlock).map(([blockName, blockMatches]) => (
        <Card key={blockName}>
          <CardHeader>
            <CardTitle className="flex items-center">
              <Trophy className={`h-5 w-5 mr-2 ${
                blockName === 'A' ? 'text-blue-600' :
                blockName === 'B' ? 'text-green-600' :
                blockName === 'C' ? 'text-yellow-600' :
                blockName === 'D' ? 'text-purple-600' :
                blockName === '決勝トーナメント' ? 'text-red-600' :
                'text-gray-600'
              }`} />
              {blockName === '決勝トーナメント' ? '決勝トーナメント' : `${blockName}ブロック`}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="min-w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 px-4 font-medium text-gray-700">試合</th>
                    <th className="text-left py-2 px-4 font-medium text-gray-700">対戦カード</th>
                    <th className="text-left py-2 px-4 font-medium text-gray-700">日時</th>
                    <th className="text-left py-2 px-4 font-medium text-gray-700">コート</th>
                    <th className="text-left py-2 px-4 font-medium text-gray-700">結果</th>
                  </tr>
                </thead>
                <tbody>
                  {blockMatches.map(match => (
                    <tr key={match.match_id} className="border-b hover:bg-gray-50">
                      <td className="py-3 px-4">
                        <span className={`px-2 py-1 rounded text-sm font-medium ${
                          blockName === 'A' ? 'bg-blue-100 text-blue-800' :
                          blockName === 'B' ? 'bg-green-100 text-green-800' :
                          blockName === 'C' ? 'bg-yellow-100 text-yellow-800' :
                          blockName === 'D' ? 'bg-purple-100 text-purple-800' :
                          'bg-red-100 text-red-800'
                        }`}>
                          {match.match_code}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-medium">
                        {getTeamDisplayName(match.team1_tournament_team_id, match.team1_display_name)} vs {getTeamDisplayName(match.team2_tournament_team_id, match.team2_display_name)}
                      </td>
                      <td className="py-3 px-4">
                        <div>
                          <p className="font-medium">{formatDate(match.tournament_date)}</p>
                          <p className="text-sm text-gray-600">{formatMatchTime(match.start_time)}</p>
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        {match.court_number ? `コート${match.court_number}` : '-'}
                      </td>
                      <td className="py-3 px-4">
                        {match.has_result ? (
                          <div className="font-medium">
                            {match.is_walkover ? (
                              <span className="text-orange-600">不戦勝</span>
                            ) : match.is_draw ? (
                              <span className="text-gray-600">
                                引き分け {formatScore(match.team1_goals, match.team2_goals)}
                              </span>
                            ) : (
                              <span className="text-blue-600">
                                {formatScore(match.team1_goals, match.team2_goals)}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-gray-400">未実施</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// アーカイブ用戦績表コンポーネント
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function ArchivedTournamentResults({ results, teams }: { results: ResultData[], teams: TeamData[] }) {
  
  // ブロック別に結果をグループ化
  const resultsByBlock = results.reduce((acc: Record<string, ResultData[]>, result) => {
    const blockName = result.block_name;
    if (!acc[blockName]) acc[blockName] = [];
    acc[blockName].push(result);
    return acc;
  }, {});

  const buildMatchMatrix = (blockResults: ResultData[], blockTeams: TeamData[]) => {
    const matrix: Record<string, Record<string, { result: string; score: string } | null>> = {};
    
    // チーム間の対戦マトリックスを初期化
    blockTeams.forEach(team1 => {
      matrix[team1.team_id] = {};
      blockTeams.forEach(team2 => {
        if (team1.team_id !== team2.team_id) {
          matrix[team1.team_id][team2.team_id] = null;
        }
      });
    });

    // 確定した試合結果を設定
    blockResults.forEach(match => {
      if (match.team1_tournament_team_id && match.team2_tournament_team_id) {
        const team1Id = String(match.team1_tournament_team_id);
        const team2Id = String(match.team2_tournament_team_id);
        const winnerId = match.winner_tournament_team_id ? String(match.winner_tournament_team_id) : null;

        let result1, result2, score;

        if (match.is_walkover) {
          if (winnerId === team1Id) {
            result1 = 'walkover_win';
            result2 = 'walkover_loss';
            score = '不戦勝';
          } else {
            result1 = 'walkover_loss';
            result2 = 'walkover_win';
            score = '不戦敗';
          }
        } else if (match.is_draw) {
          result1 = result2 = 'draw';
          score = `引き分け\n${Math.floor(match.team1_goals || 0)}-${Math.floor(match.team2_goals || 0)}`;
        } else {
          if (winnerId === team1Id) {
            result1 = 'win';
            result2 = 'loss';
            score = `〇\n${Math.floor(match.team1_goals || 0)}-${Math.floor(match.team2_goals || 0)}`;
          } else {
            result1 = 'loss';
            result2 = 'win';
            score = `●\n${Math.floor(match.team1_goals || 0)}-${Math.floor(match.team2_goals || 0)}`;
          }
        }

        matrix[team1Id][team2Id] = { result: result1, score };
        matrix[team2Id][team1Id] = { result: result2, score: score.replace('〇', '●').replace('●', '〇') };
      }
    });

    return matrix;
  };

  return (
    <div className="space-y-6">
      {Object.entries(resultsByBlock).map(([blockName, blockResults]) => {
        const blockTeams = teams.filter(t => t.assigned_block === blockName);
        const matrix = buildMatchMatrix(blockResults, blockTeams);

        return (
          <Card key={blockName}>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <div className="flex items-center">
                  <Award className={`h-5 w-5 mr-2 ${
                    blockName === 'A' ? 'text-blue-600' :
                    blockName === 'B' ? 'text-green-600' :
                    blockName === 'C' ? 'text-yellow-600' :
                    blockName === 'D' ? 'text-purple-600' :
                    'text-gray-600'
                  }`} />
                  {blockName}ブロック 戦績表
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="min-w-full border-collapse">
                  <thead>
                    <tr>
                      <th className="w-32 p-2 border text-center bg-gray-100 text-sm font-medium">チーム</th>
                      {blockTeams.map(team => (
                        <th key={team.team_id} className="min-w-[70px] p-1 border text-center bg-gray-100 text-xs">
                          <div className="flex flex-col items-center">
                            {(team.team_omission || team.team_name).split('').map((char, index) => (
                              <span key={index} className="block leading-tight">{char}</span>
                            ))}
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {blockTeams.map(team1 => (
                      <tr key={team1.team_id}>
                        <td className="p-2 border text-left font-medium bg-gray-50 text-sm">
                          {team1.team_name}
                        </td>
                        {blockTeams.map(team2 => {
                          if (team1.team_id === team2.team_id) {
                            return (
                              <td key={team2.team_id} className="p-1 border text-center bg-gray-700 text-white text-xs">
                                -
                              </td>
                            );
                          }

                          const matchResult = matrix[team1.team_id]?.[team2.team_id];
                          
                          if (!matchResult) {
                            return (
                              <td key={team2.team_id} className="p-1 border text-center bg-gray-100 text-xs">
                                未実施
                              </td>
                            );
                          }

                          const bgColor = 
                            matchResult.result === 'win' ? 'bg-green-100 text-green-800' :
                            matchResult.result === 'loss' ? 'bg-red-100 text-red-800' :
                            matchResult.result === 'draw' ? 'bg-yellow-100 text-yellow-800' :
                            matchResult.result === 'walkover_win' ? 'bg-green-200 text-green-900' :
                            matchResult.result === 'walkover_loss' ? 'bg-red-200 text-red-900' :
                            'bg-white';

                          return (
                            <td key={team2.team_id} className={`p-1 border text-center text-xs ${bgColor}`}>
                              <div className="whitespace-pre-line leading-tight">
                                {matchResult.score}
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

// アーカイブ用順位表コンポーネント
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function ArchivedTournamentStandings({ standings }: { standings: StandingData[] }) {
  return (
    <div className="space-y-6">
      {standings.map(block => {
        const rankings: TeamRanking[] = block.team_rankings ? JSON.parse(block.team_rankings) : [];
        const isLeague = isLeagueStandings(block, rankings);

        return (
          <Card key={block.block_name}>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <div className="flex items-center">
                  <BarChart3 className={`h-5 w-5 mr-2 ${
                    block.block_name === 'A' ? 'text-blue-600' :
                    block.block_name === 'B' ? 'text-green-600' :
                    block.block_name === 'C' ? 'text-yellow-600' :
                    block.block_name === 'D' ? 'text-purple-600' :
                    block.block_name === '決勝トーナメント' ? 'text-red-600' :
                    'text-gray-600'
                  }`} />
                  {block.block_name === '決勝トーナメント' ? '決勝トーナメント順位' : `${block.block_name}ブロック順位表`}
                </div>
              </CardTitle>
              {block.remarks && (
                <div className="mt-2 p-3 bg-yellow-50 border-l-4 border-yellow-400 rounded">
                  <p className="text-sm text-yellow-800">{block.remarks}</p>
                </div>
              )}
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="min-w-full">
                  <thead>
                    <tr className="border-b">
                      <th className="text-center py-2 px-3 font-medium text-gray-700">順位</th>
                      <th className="text-left py-2 px-4 font-medium text-gray-700">チーム名</th>
                      {isLeague ? (
                        <>
                          <th className="text-center py-2 px-3 font-medium text-gray-700">勝点</th>
                          <th className="text-center py-2 px-3 font-medium text-gray-700">試合</th>
                          <th className="text-center py-2 px-3 font-medium text-gray-700">勝</th>
                          <th className="text-center py-2 px-3 font-medium text-gray-700">引</th>
                          <th className="text-center py-2 px-3 font-medium text-gray-700">敗</th>
                          <th className="text-center py-2 px-3 font-medium text-gray-700">得点</th>
                          <th className="text-center py-2 px-3 font-medium text-gray-700">失点</th>
                          <th className="text-center py-2 px-3 font-medium text-gray-700">得失差</th>
                        </>
                      ) : (
                        <th className="text-left py-2 px-4 font-medium text-gray-700">備考</th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {rankings.map((team, index: number) => (
                      <tr key={team.team_id || index} className="border-b hover:bg-gray-50">
                        <td className="text-center py-3 px-3 font-bold text-lg">
                          {team.position}
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex items-center">
                            <span className="font-medium">{team.team_name}</span>
                            {team.position <= 2 && isLeague && (
                              <span className="ml-2 text-yellow-500">👑</span>
                            )}
                          </div>
                        </td>
                        {isLeague ? (
                          <>
                            <td className="text-center py-3 px-3 font-bold text-blue-600">{team.points}</td>
                            <td className="text-center py-3 px-3">{team.matches_played}</td>
                            <td className="text-center py-3 px-3 text-green-600">{team.wins}</td>
                            <td className="text-center py-3 px-3 text-yellow-600">{team.draws}</td>
                            <td className="text-center py-3 px-3 text-red-600">{team.losses}</td>
                            <td className="text-center py-3 px-3">{team.goals_for}</td>
                            <td className="text-center py-3 px-3">{team.goals_against}</td>
                            <td className="text-center py-3 px-3 font-medium">
                              <span className={(team.goal_difference ?? 0) >= 0 ? 'text-green-600' : 'text-red-600'}>
                                {(team.goal_difference ?? 0) > 0 ? '+' : ''}{team.goal_difference ?? 0}
                              </span>
                            </td>
                          </>
                        ) : (
                          <td className="py-3 px-4 text-gray-600">
                            {team.position === 1 ? '優勝' :
                             team.position === 2 ? '準優勝' :
                             team.position === 3 ? '3位' :
                             team.position === 4 ? '4位' :
                             '準々決勝敗退'}
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

// アーカイブ用参加チーム表コンポーネント
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function ArchivedTournamentTeams({ teams }: { teams: TeamData[] }) {
  // ブロック別にチームをグループ化
  const teamsByBlock = teams.reduce((acc: Record<string, TeamData[]>, team) => {
    const blockName = team.assigned_block || 'その他';
    if (!acc[blockName]) acc[blockName] = [];
    acc[blockName].push(team);
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      {Object.entries(teamsByBlock).map(([blockName, blockTeams]) => (
        <Card key={blockName}>
          <CardHeader>
            <CardTitle className="flex items-center">
              <Users className={`h-5 w-5 mr-2 ${
                blockName === 'A' ? 'text-blue-600' :
                blockName === 'B' ? 'text-green-600' :
                blockName === 'C' ? 'text-yellow-600' :
                blockName === 'D' ? 'text-purple-600' :
                'text-gray-600'
              }`} />
              {blockName}ブロック参加チーム
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {blockTeams.map(team => (
                <div key={team.team_id} className="border rounded-lg p-4 hover:shadow-md transition-shadow">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-semibold text-lg">{team.team_name}</h3>
                    {team.team_omission && (
                      <span className="px-2 py-1 bg-gray-100 rounded text-sm text-gray-600">
                        {team.team_omission}
                      </span>
                    )}
                  </div>
                  
                  <div className="space-y-2 text-sm text-gray-600">
                    <div className="flex items-center">
                      <Users className="h-4 w-4 mr-2" />
                      <span>登録選手数: {team.player_count}名</span>
                    </div>
                    
                    {team.withdrawal_status !== 'active' && (
                      <div className="mt-3 p-2 bg-destructive/5 border border-destructive/20 rounded">
                        <span className="text-destructive font-medium">
                          {team.withdrawal_status === 'withdrawal_approved' ? '辞退済み' : '辞退申請中'}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// PdfInfo interface removed as unused


// ArchivedTournamentOverview function removed due to unused status

// メインコンテンツコンポーネント
async function ArchivedTournamentContent({ params }: PageProps) {
  const resolvedParams = await params;
  const archived = await getArchivedTournamentDetail(resolvedParams.id);
  
  if (!archived) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-foreground mb-4">アーカイブデータが見つかりません</h1>
            <p className="text-muted-foreground mb-8">指定された大会のアーカイブデータが存在しません。</p>
            <Button asChild>
              <Link href="/">TOPページに戻る</Link>
            </Button>
          </div>
        </div>
        <Footer />
      </div>
    );
  }

  // アーカイブUIバージョンを取得
  const tournamentId = parseInt(resolvedParams.id);
  const uiVersion = await ArchiveVersionManager.getArchiveUIVersion(tournamentId);
  const versionInfo = ArchiveVersionManager.getVersionInfo(uiVersion);
  
  // デバッグ用ログ
  console.log(`🔍 Archive UI Version Debug (Tournament ID: ${tournamentId}):`, {
    uiVersion,
    versionInfo: versionInfo ? {
      version: versionInfo.version,
      features: versionInfo.features,
      component_path: versionInfo.component_path
    } : 'undefined'
  });

  // バージョンに応じたコンポーネントの動的読み込み
  let VersionedComponent;
  
  try {
    if (uiVersion === '1.0') {
      console.log('📦 Loading ArchivedLayout_v1 component...');
      const { ArchivedLayout_v1 } = await import('@/components/features/archived/v1.0/ArchivedLayout_v1');
      VersionedComponent = ArchivedLayout_v1;
    } else if (uiVersion === '2.0') {
      // v2.0コンポーネント（トーナメント表対応）を読み込み
      console.log('📦 Loading ArchivedLayout_v2 component...');
      const { ArchivedLayout_v2 } = await import('@/components/features/archived/v2.0/ArchivedLayout_v2');
      VersionedComponent = ArchivedLayout_v2;
    } else {
      // 新しいバージョンが追加されたときはここで分岐
      console.warn(`未対応のUIバージョン: ${uiVersion}, デフォルトバージョン(v1.0)を使用します`);
      const { ArchivedLayout_v1 } = await import('@/components/features/archived/v1.0/ArchivedLayout_v1');
      VersionedComponent = ArchivedLayout_v1;
    }
  } catch (error) {
    console.error(`アーカイブコンポーネント読み込みエラー (バージョン ${uiVersion}):`, error);
    // フォールバック: インラインコンポーネントを使用
    return renderInlineComponent(archived);
  }

  // バージョン管理されたコンポーネントでレンダリング
  return (
    <VersionedComponent 
      archived={archived}
      uiVersion={uiVersion}
      versionInfo={versionInfo}
    />
  );
}

// フォールバック用のインラインレンダリング関数
function renderInlineComponent(archived: ReturnType<typeof getArchivedTournamentDetail> extends Promise<infer T> ? NonNullable<T> : never) {
  return (
    <div className="min-h-screen bg-background">
      <Header />
      
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* ナビゲーション */}
        <div className="mb-6">
          <div className="flex items-center gap-4 mb-4">
            <BackButton />
            <Button variant="ghost" asChild>
              <Link href="/" className="flex items-center text-muted-foreground hover:text-foreground">
                <ArrowLeft className="h-4 w-4 mr-2" />
                TOPページに戻る
              </Link>
            </Button>
          </div>
        </div>

        {/* エラー通知 */}
        <div className="mb-8">
          <div className="bg-destructive/5 border border-destructive/20 rounded-lg p-4">
            <div className="flex items-center">
              <Archive className="h-5 w-5 text-destructive mr-2" />
              <div className="flex-1">
                <p className="font-medium text-destructive">アーカイブコンポーネント読み込みエラー</p>
                <p className="text-sm text-destructive mt-1">
                  アーカイブ表示コンポーネントの読み込みに失敗しました。管理者にお問い合わせください。
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* 基本情報のみ表示 */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground mb-2">{archived.tournament.tournament_name}</h1>
          <p className="text-muted-foreground">アーカイブ日時: {formatDate(archived.archived_at as string)}</p>
        </div>
      </div>

      <Footer />
    </div>
  );
}

export default function ArchivedTournamentPage({ params }: PageProps) {
  return (
    <Suspense fallback={<ArchiveLoadingState />}>
      <ArchivedTournamentContent params={params} />
    </Suspense>
  );
}