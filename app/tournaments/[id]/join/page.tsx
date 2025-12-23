// app/tournaments/[id]/join/page.tsx
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { redirect } from 'next/navigation';
import TournamentJoinForm from '@/components/features/tournament/TournamentJoinForm';
import { getTournamentWithGroupInfo } from '@/lib/tournament-detail';
import Link from 'next/link';
import { Home, ChevronRight, Calendar } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ mode?: string; team?: string }>;
}

interface TeamPlayer {
  player_id: number;
  player_name: string;
  jersey_number: number | null;
  is_active: number;
}

// getTournamentDetails関数はgetTournamentWithGroupInfoに置き換えられました

async function getTeamPlayers(teamId: string): Promise<TeamPlayer[]> {
  const result = await db.execute(`
    SELECT DISTINCT
      player_id,
      player_name,
      jersey_number,
      is_active
    FROM m_players
    WHERE current_team_id = ?
    ORDER BY jersey_number ASC, player_name ASC
  `, [teamId]);

  // データベースの行オブジェクトをプレーンオブジェクトに変換
  const players = result.rows.map(row => ({
    player_id: Number(row.player_id),
    player_name: String(row.player_name),
    jersey_number: row.jersey_number ? Number(row.jersey_number) : null,
    is_active: Number(row.is_active)
  }));

  return players;
}

async function checkExistingParticipation(tournamentId: number, teamId: string) {
  const result = await db.execute(`
    SELECT tournament_team_id FROM t_tournament_teams
    WHERE tournament_id = ? AND team_id = ?
  `, [tournamentId, teamId]);

  return result.rows.length > 0;
}

interface ExistingTournamentPlayer {
  player_id: number;
  player_name: string;
  jersey_number: number | null;
}

async function getExistingTournamentPlayers(tournamentId: number, teamId: string): Promise<ExistingTournamentPlayer[]> {
  const result = await db.execute(`
    SELECT DISTINCT
      tp.player_id,
      p.player_name,
      tp.jersey_number
    FROM t_tournament_players tp
    INNER JOIN m_players p ON tp.player_id = p.player_id
    WHERE tp.tournament_id = ? AND tp.team_id = ? AND tp.player_status = 'active'
    ORDER BY tp.jersey_number ASC, p.player_name ASC
  `, [tournamentId, teamId]);

  return result.rows.map(row => ({
    player_id: Number(row.player_id),
    player_name: String(row.player_name),
    jersey_number: row.jersey_number ? Number(row.jersey_number) : null
  }));
}

interface ExistingTournamentTeamInfo {
  team_name: string;
  team_omission: string;
}

async function getExistingTournamentTeamInfo(tournamentId: number, teamId: string, tournamentTeamId?: number): Promise<ExistingTournamentTeamInfo | null> {
  let query = `
    SELECT 
      team_name,
      team_omission
    FROM t_tournament_teams
    WHERE tournament_id = ? AND team_id = ?
  `;
  const params: (string | number)[] = [tournamentId, teamId];

  // 特定のtournament_team_idが指定されている場合はそれを条件に追加
  if (tournamentTeamId) {
    query += ` AND tournament_team_id = ?`;
    params.push(tournamentTeamId);
  }

  const result = await db.execute(query, params);

  if (result.rows.length === 0) return null;

  const row = result.rows[0];
  return {
    team_name: String(row.team_name),
    team_omission: String(row.team_omission)
  };
}

async function getExistingTournamentPlayersForSpecificTeam(tournamentId: number, teamId: string, tournamentTeamId: number): Promise<ExistingTournamentPlayer[]> {
  const result = await db.execute(`
    SELECT DISTINCT
      tp.player_id,
      p.player_name,
      tp.jersey_number
    FROM t_tournament_players tp
    INNER JOIN m_players p ON tp.player_id = p.player_id
    WHERE tp.tournament_id = ? AND tp.team_id = ? AND tp.tournament_team_id = ? AND tp.player_status = 'active'
    ORDER BY tp.jersey_number ASC, p.player_name ASC
  `, [tournamentId, teamId, tournamentTeamId]);

  return result.rows.map(row => ({
    player_id: Number(row.player_id),
    player_name: String(row.player_name),
    jersey_number: row.jersey_number ? Number(row.jersey_number) : null
  }));
}

export default async function TournamentJoinPage({ params, searchParams }: PageProps) {
  const session = await auth();
  const resolvedParams = await params;
  const resolvedSearchParams = await searchParams;
  const tournamentId = parseInt(resolvedParams.id);
  const isNewTeamMode = resolvedSearchParams.mode === 'new';
  const specificTeamId = resolvedSearchParams.team ? parseInt(resolvedSearchParams.team) : null;

  // 認証チェック（チーム権限必須）
  if (!session || session.user.role !== 'team') {
    redirect(`/auth/team/login?callbackUrl=${encodeURIComponent(`/tournaments/${tournamentId}/join`)}`);
  }

  const teamId = session.user.teamId;
  if (!teamId) {
    redirect(`/auth/team/login?callbackUrl=${encodeURIComponent(`/tournaments/${tournamentId}/join`)}`);
  }

  // 大会情報取得（グループ情報含む）
  const tournamentData = await getTournamentWithGroupInfo(tournamentId);
  if (!tournamentData) {
    redirect('/public/tournaments');
  }

  const { tournament, group } = tournamentData;

  // 募集期間チェック
  const now = new Date().toISOString().split('T')[0];
  if (tournament.recruitment_start_date && tournament.recruitment_end_date) {
    if (now < tournament.recruitment_start_date || now > tournament.recruitment_end_date) {
      redirect(`/public/tournaments/${tournamentId}`);
    }
  }

  // 既に参加申し込み済みかチェック
  const alreadyJoined = await checkExistingParticipation(tournamentId, teamId);
  
  // 新チーム追加モードの場合は、既存参加の有無に関わらず新規モードとして扱う
  // 特定チーム編集モードの場合は、そのチームが存在すれば編集モード
  let actualEditMode = alreadyJoined && !isNewTeamMode;
  
  // 特定チーム編集の場合、そのチームの存在確認
  if (specificTeamId) {
    const specificTeamResult = await db.execute(`
      SELECT tournament_team_id FROM t_tournament_teams 
      WHERE tournament_id = ? AND team_id = ? AND tournament_team_id = ?
    `, [tournamentId, teamId, specificTeamId]);
    
    if (specificTeamResult.rows.length === 0) {
      redirect(`/team`); // 存在しないチームの編集要求は無効
    }
    actualEditMode = true;
  }

  // チームの選手一覧取得
  const teamPlayers = await getTeamPlayers(teamId);

  // 既存の大会参加選手情報を取得（修正モードの場合）
  const existingTournamentPlayers = actualEditMode
    ? specificTeamId
      ? await getExistingTournamentPlayersForSpecificTeam(tournamentId, teamId, specificTeamId)
      : await getExistingTournamentPlayers(tournamentId, teamId)
    : [];

  // 既存の大会参加チーム情報を取得（修正モードの場合）
  const existingTournamentTeamInfo = actualEditMode
    ? await getExistingTournamentTeamInfo(tournamentId, teamId, specificTeamId || undefined)
    : null;

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* パンくずリスト */}
        <nav className="flex items-center space-x-2 text-sm text-muted-foreground mb-6">
          <Link href="/" className="hover:text-foreground transition-colors">
            <Home className="h-4 w-4" />
          </Link>
          <ChevronRight className="h-4 w-4" />
          <Link href="/public/tournaments" className="hover:text-foreground transition-colors">
            大会一覧
          </Link>
          {group && (
            <>
              <ChevronRight className="h-4 w-4" />
              <Link href={`/public/tournaments/groups/${group.group_id}`} className="hover:text-foreground transition-colors">
                {group.group_name}
              </Link>
            </>
          )}
          <ChevronRight className="h-4 w-4" />
          <Link href={`/public/tournaments/${tournament.tournament_id}`} className="hover:text-foreground transition-colors">
            {group ? tournament.category_name || tournament.tournament_name : tournament.tournament_name}
          </Link>
          <ChevronRight className="h-4 w-4" />
          <span className="text-foreground font-medium">参加申し込み</span>
        </nav>

        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground mb-2">
            {actualEditMode
              ? (specificTeamId ? `「${existingTournamentTeamInfo?.team_name || 'チーム'}」の参加選手変更` : '参加選手の変更')
              : (isNewTeamMode ? '参加チームを追加' : '大会参加申し込み')
            }
          </h1>
          <p className="text-muted-foreground">
            {group && (
              <>
                {group.group_name} - {tournament.category_name || tournament.tournament_name}
                {actualEditMode
                  ? specificTeamId
                    ? ` の「${existingTournamentTeamInfo?.team_name}」チームの参加選手を変更してください`
                    : ' への参加選手を変更してください'
                  : isNewTeamMode
                  ? ' に追加のチームで参加申し込みをしてください'
                  : ' への参加選手を選択してください'
                }
              </>
            )}
            {!group && (
              <>
                {actualEditMode
                  ? specificTeamId
                    ? `${tournament.tournament_name} の「${existingTournamentTeamInfo?.team_name}」チームの参加選手を変更してください`
                    : `${tournament.tournament_name} への参加選手を変更してください`
                  : isNewTeamMode
                  ? `${tournament.tournament_name} に追加のチームで参加申し込みをしてください`
                  : `${tournament.tournament_name} への参加選手を選択してください`
                }
              </>
            )}
          </p>
          {actualEditMode && !specificTeamId && (
            <div className="mt-2 p-3 bg-blue-50 border border-blue-200 rounded-md">
              <p className="text-sm text-blue-800">
                既に参加申し込み済みです。参加選手の変更や背番号の修正が可能です。
              </p>
            </div>
          )}
          {actualEditMode && specificTeamId && (
            <div className="mt-2 p-3 bg-orange-50 border border-orange-200 rounded-md">
              <p className="text-sm text-orange-800">
                <strong>個別チーム編集:</strong> 「{existingTournamentTeamInfo?.team_name}({existingTournamentTeamInfo?.team_omission})」チームの選手情報を編集しています。
              </p>
            </div>
          )}
          {isNewTeamMode && (
            <div className="mt-2 p-3 bg-green-50 border border-green-200 rounded-md">
              <p className="text-sm text-green-800">
                <strong>複数チーム参加モード:</strong> 同じマスターチームから追加のチームで参加します。異なるチーム名・略称を入力してください。
              </p>
            </div>
          )}
        </div>

        {/* 大会グループ情報カード（グループが存在する場合） */}
        {group && (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="text-lg">大会情報</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="font-medium text-muted-foreground">大会名:</span>
                  <span className="ml-2">{group.group_name}</span>
                </div>
                {group.organizer && (
                  <div>
                    <span className="font-medium text-muted-foreground">主催:</span>
                    <span className="ml-2">{group.organizer}</span>
                  </div>
                )}
                {(group.event_start_date || group.event_end_date) && (
                  <div className="md:col-span-2">
                    <span className="font-medium text-muted-foreground flex items-center gap-1">
                      <Calendar className="h-4 w-4" />
                      開催期間:
                    </span>
                    <span className="ml-2">
                      {group.event_start_date && group.event_end_date && group.event_start_date === group.event_end_date
                        ? new Date(group.event_start_date).toLocaleDateString('ja-JP')
                        : `${group.event_start_date ? new Date(group.event_start_date).toLocaleDateString('ja-JP') : ''} 〜 ${group.event_end_date ? new Date(group.event_end_date).toLocaleDateString('ja-JP') : ''}`
                      }
                    </span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* 部門情報カード */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-lg">{group ? '部門情報' : '大会情報'}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div>
                <span className="font-medium text-muted-foreground">{group ? '部門名:' : '大会名:'}</span>
                <span className="ml-2">{group ? (tournament.category_name || tournament.tournament_name) : tournament.tournament_name}</span>
              </div>
              <div>
                <span className="font-medium text-muted-foreground">形式:</span>
                <span className="ml-2">{tournament.format_name}</span>
              </div>
              {!group && tournament.venue_name && (
                <div>
                  <span className="font-medium text-muted-foreground">会場:</span>
                  <span className="ml-2">{tournament.venue_name}</span>
                </div>
              )}
              <div>
                <span className="font-medium text-muted-foreground">募集期間:</span>
                <span className="ml-2">
                  {tournament.recruitment_start_date} 〜 {tournament.recruitment_end_date}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        <TournamentJoinForm
          tournamentId={tournamentId}
          teamPlayers={teamPlayers}
          existingTournamentPlayers={existingTournamentPlayers}
          existingTournamentTeamInfo={existingTournamentTeamInfo}
          isEditMode={actualEditMode}
          isNewTeamMode={isNewTeamMode}
          specificTeamId={specificTeamId || undefined}
        />
      </div>
    </div>
  );
}