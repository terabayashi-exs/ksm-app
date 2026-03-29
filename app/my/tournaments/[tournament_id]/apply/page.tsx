// app/my/tournaments/[tournament_id]/apply/page.tsx
export const metadata = { title: "大会参加申し込み" };

import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { redirect } from 'next/navigation';
import MyTournamentJoinForm from '@/components/features/my/MyTournamentJoinForm';
import { getTournamentWithGroupInfo } from '@/lib/tournament-detail';
import Link from 'next/link';
import { Home, ChevronRight } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface PageProps {
  params: Promise<{ tournament_id: string }>;
  searchParams: Promise<{ team?: string; mode?: string; tournament_team_id?: string }>;
}

interface TeamPlayer {
  player_id: number;
  player_name: string;
  jersey_number: number | null;
  is_active: number;
}

interface ExistingTournamentPlayer {
  player_id: number;
  player_name: string;
  jersey_number: number | null;
}

interface ExistingTournamentTeamInfo {
  team_name: string;
  team_omission: string;
}

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

async function getExistingTournamentPlayers(tournamentId: number, teamId: string, tournamentTeamId?: number): Promise<ExistingTournamentPlayer[]> {
  const result = await db.execute(`
    SELECT DISTINCT
      tp.player_id,
      p.player_name,
      tp.jersey_number
    FROM t_tournament_players tp
    INNER JOIN m_players p ON tp.player_id = p.player_id
    WHERE tp.tournament_id = ?
      AND tp.team_id = ?
      AND tp.player_status = 'active'
      ${tournamentTeamId ? 'AND tp.tournament_team_id = ?' : ''}
    ORDER BY tp.jersey_number ASC, p.player_name ASC
  `, tournamentTeamId ? [tournamentId, teamId, tournamentTeamId] : [tournamentId, teamId]);

  return result.rows.map(row => ({
    player_id: Number(row.player_id),
    player_name: String(row.player_name),
    jersey_number: row.jersey_number ? Number(row.jersey_number) : null
  }));
}

async function getExistingTournamentTeamInfo(tournamentId: number, teamId: string, tournamentTeamId?: number): Promise<ExistingTournamentTeamInfo | null> {
  const result = await db.execute(`
    SELECT
      team_name,
      team_omission
    FROM t_tournament_teams
    WHERE tournament_id = ?
      AND team_id = ?
      ${tournamentTeamId ? 'AND tournament_team_id = ?' : ''}
    ORDER BY created_at DESC
    LIMIT 1
  `, tournamentTeamId ? [tournamentId, teamId, tournamentTeamId] : [tournamentId, teamId]);

  if (result.rows.length === 0) return null;

  const row = result.rows[0];
  return {
    team_name: String(row.team_name),
    team_omission: String(row.team_omission)
  };
}

async function getAllParticipatingPlayerIds(tournamentId: number, excludeTournamentTeamId?: number): Promise<number[]> {
  const result = await db.execute(`
    SELECT DISTINCT tp.player_id
    FROM t_tournament_players tp
    WHERE tp.tournament_id = ?
      AND tp.player_status = 'active'
      ${excludeTournamentTeamId ? 'AND tp.tournament_team_id != ?' : ''}
  `, excludeTournamentTeamId ? [tournamentId, excludeTournamentTeamId] : [tournamentId]);

  return result.rows.map(row => Number(row.player_id));
}

export default async function MyTournamentJoinPage({ params, searchParams }: PageProps) {
  const session = await auth();
  const resolvedParams = await params;
  const resolvedSearchParams = await searchParams;
  const tournamentId = parseInt(resolvedParams.tournament_id);
  const specificTeamId = resolvedSearchParams.team;
  const mode = resolvedSearchParams.mode; // 'new' = 新規追加モード
  const tournamentTeamIdParam = resolvedSearchParams.tournament_team_id
    ? parseInt(resolvedSearchParams.tournament_team_id)
    : undefined;

  // 認証チェック（統合ログインシステム対応）
  if (!session?.user) {
    redirect(`/auth/login?callbackUrl=${encodeURIComponent(`/my/tournaments/${tournamentId}/apply`)}`);
  }

  const roles = (session.user.roles ?? []) as ("admin" | "operator" | "team")[];
  let teamIds = (session.user.teamIds ?? []) as string[];
  const isAdmin = roles.includes("admin") || roles.includes("operator");

  // チームロールでもなく管理者でもなく、チームIDもない場合はログインページへ
  if (!roles.includes("team") && !isAdmin && teamIds.length === 0) {
    console.error('[apply] redirect: no team role and no teamIds', { roles, teamIds: teamIds.length, isAdmin });
    redirect(`/auth/login?callbackUrl=${encodeURIComponent(`/my/tournaments/${tournamentId}/apply`)}`);
  }

  // 旧adminプロバイダーでログインした管理者の場合、teamIdsがセッションにないためDBから取得
  if (teamIds.length === 0 && isAdmin && session.user.loginUserId) {
    const teamsResult = await db.execute(
      `SELECT team_id FROM m_team_members WHERE login_user_id = ? AND is_active = 1`,
      [session.user.loginUserId]
    );
    teamIds = teamsResult.rows.map(r => r.team_id as string);
  }

  // 特定のチームが指定されている場合はそれを使用、そうでない場合は最初のチームを使用
  const teamId = specificTeamId || teamIds[0];
  if (!teamId) {
    console.error('[apply] redirect: teamId not found', { specificTeamId, teamIds, roles, loginUserId: session.user.loginUserId });
    redirect(`/my?message=${encodeURIComponent('チームが見つかりませんでした')}`);
  }

  // 大会情報取得（グループ情報含む）
  let tournamentData;
  try {
    tournamentData = await getTournamentWithGroupInfo(tournamentId);
  } catch (error) {
    console.error('[apply] getTournamentWithGroupInfo error:', error, { tournamentId });
    redirect(`/my?message=${encodeURIComponent('大会情報の取得に失敗しました')}`);
  }
  if (!tournamentData) {
    console.error('[apply] redirect: tournamentData is falsy', { tournamentId });
    redirect('/my');
  }

  const { tournament, group } = tournamentData;

  // 募集期間チェック（時刻も含めて厳密にチェック）
  if (tournament.recruitment_start_date && tournament.recruitment_end_date) {
    const now = new Date();
    const startDate = new Date(tournament.recruitment_start_date);
    const endDate = new Date(tournament.recruitment_end_date);

    if (now < startDate || now > endDate) {
      redirect(`/my?message=${encodeURIComponent('募集期間外です')}`);
    }
  }

  // 既に参加申し込み済みかチェック
  const alreadyJoined = await checkExistingParticipation(tournamentId, teamId);

  // 新規追加モード（mode=new）の場合は、参加済みでも編集モードにしない
  const isNewTeamMode = mode === 'new';
  const isEditMode = alreadyJoined && !isNewTeamMode;

  // チームの選手一覧取得
  const teamPlayers = await getTeamPlayers(teamId);

  // 既存の大会参加選手情報を取得（編集モードの場合のみ）
  // 新規追加モード時は空配列を渡す
  const existingTournamentPlayers = isEditMode
    ? await getExistingTournamentPlayers(tournamentId, teamId, tournamentTeamIdParam)
    : [];

  // 既存の大会参加チーム情報を取得（編集モードの場合のみ）
  // 新規追加モード時はnullを渡す
  const existingTournamentTeamInfo = isEditMode
    ? await getExistingTournamentTeamInfo(tournamentId, teamId, tournamentTeamIdParam)
    : null;

  // この大会で既に参加登録されている選手のIDリストを取得
  // 編集モード時は自分のチームの選手を除外するため、tournament_team_idを渡す
  let excludeTournamentTeamId: number | undefined;
  if (isEditMode) {
    // URLパラメータからtournament_team_idを取得、なければDBから最初のものを取得
    if (tournamentTeamIdParam) {
      excludeTournamentTeamId = tournamentTeamIdParam;
    } else if (existingTournamentPlayers.length > 0) {
      const ttResult = await db.execute(`
        SELECT tournament_team_id FROM t_tournament_teams
        WHERE tournament_id = ? AND team_id = ?
        ORDER BY created_at DESC
        LIMIT 1
      `, [tournamentId, teamId]);
      if (ttResult.rows.length > 0) {
        excludeTournamentTeamId = Number(ttResult.rows[0].tournament_team_id);
      }
    }
  }
  const alreadyParticipatingPlayerIds = await getAllParticipatingPlayerIds(tournamentId, excludeTournamentTeamId);

  return (
    <div className="min-h-screen bg-white">
      <div className="bg-base-800 border-b-[3px] border-primary">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="py-6">
            <h1 className="text-2xl font-bold text-white">
              {isEditMode ? '参加選手の変更' : '大会参加申し込み'}
            </h1>
            <p className="text-sm text-white/70 mt-1">
              {group
                ? `${group.group_name} - ${tournament.category_name || tournament.tournament_name}`
                : tournament.tournament_name
              }
              {isEditMode ? ' への参加選手を変更します' : ' への参加選手を選択してください'}
            </p>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <nav className="flex flex-wrap items-center gap-1.5 text-sm mb-6">
          <Link href="/" className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-gray-100 text-gray-600 hover:bg-gray-200 hover:text-gray-900 transition-colors whitespace-nowrap"><Home className="h-3.5 w-3.5" /><span>Home</span></Link>
          <ChevronRight className="h-4 w-4 text-gray-400 flex-shrink-0" />
          <Link href="/my?tab=team" className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-gray-100 text-gray-600 hover:bg-gray-200 hover:text-gray-900 transition-colors whitespace-nowrap">マイダッシュボード</Link>
          <ChevronRight className="h-4 w-4 text-gray-400 flex-shrink-0" />
          <span className="inline-flex items-center px-2.5 py-1.5 rounded-md bg-primary/10 text-primary font-medium">
            {isEditMode ? '参加選手の変更' : '参加申し込み'}
          </span>
        </nav>

        {isEditMode && (
          <div className="mb-6 p-3 bg-primary/5 border border-primary/20 rounded-md">
            <p className="text-sm text-primary">
              既に参加申し込み済みです。参加選手の変更や背番号の修正が可能です。
            </p>
          </div>
        )}
        {isNewTeamMode && (
          <div className="mb-6 p-3 bg-green-50 border border-green-200 rounded-md">
            <p className="text-sm text-green-800">
              追加申し込みモードです。同じチームから別のチーム名で参加登録できます。
            </p>
          </div>
        )}

        {/* 部門情報カード */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-lg">{group ? '部門情報' : '大会情報'}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div>
                <span className="font-medium text-gray-500">{group ? '部門名:' : '大会名:'}</span>
                <span className="ml-2">{group ? (tournament.category_name || tournament.tournament_name) : tournament.tournament_name}</span>
              </div>
              <div>
                <span className="font-medium text-gray-500">形式:</span>
                <span className="ml-2">{tournament.format_name}</span>
              </div>
              {!group && tournament.venue_name && (
                <div>
                  <span className="font-medium text-gray-500">会場:</span>
                  <span className="ml-2">{tournament.venue_name}</span>
                </div>
              )}
              <div>
                <span className="font-medium text-gray-500">募集期間:</span>
                <span className="ml-2">
                  {tournament.recruitment_start_date?.replace('T', ' ')} 〜 {tournament.recruitment_end_date?.replace('T', ' ')}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        <MyTournamentJoinForm
          tournamentId={tournamentId}
          teamId={teamId}
          teamPlayers={teamPlayers}
          existingTournamentPlayers={existingTournamentPlayers}
          existingTournamentTeamInfo={existingTournamentTeamInfo}
          isEditMode={isEditMode}
          alreadyParticipatingPlayerIds={alreadyParticipatingPlayerIds}
        />
      </div>
    </div>
  );
}
