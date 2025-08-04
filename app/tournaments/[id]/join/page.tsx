// app/tournaments/[id]/join/page.tsx
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { redirect } from 'next/navigation';
import TournamentJoinForm from '@/components/features/tournament/TournamentJoinForm';

interface PageProps {
  params: Promise<{ id: string }>;
}

interface TournamentDetails {
  tournament_id: number;
  tournament_name: string;
  recruitment_start_date: string | null;
  recruitment_end_date: string | null;
  status: string;
  visibility: string;
  format_name: string | null;
  venue_name: string | null;
}

interface TeamPlayer {
  player_id: number;
  player_name: string;
  jersey_number: number | null;
  is_active: number;
}

async function getTournamentDetails(tournamentId: number): Promise<TournamentDetails | null> {
  const result = await db.execute(`
    SELECT 
      t.tournament_id,
      t.tournament_name,
      t.recruitment_start_date,
      t.recruitment_end_date,
      t.status,
      t.visibility,
      f.format_name,
      v.venue_name
    FROM t_tournaments t
    LEFT JOIN m_tournament_formats f ON t.format_id = f.format_id
    LEFT JOIN m_venues v ON t.venue_id = v.venue_id
    WHERE t.tournament_id = ? AND t.visibility = 'open'
  `, [tournamentId]);

  const row = result.rows[0];
  if (!row) return null;

  // データベースの行オブジェクトをプレーンオブジェクトに変換
  return {
    tournament_id: Number(row.tournament_id),
    tournament_name: String(row.tournament_name),
    recruitment_start_date: row.recruitment_start_date ? String(row.recruitment_start_date) : null,
    recruitment_end_date: row.recruitment_end_date ? String(row.recruitment_end_date) : null,
    status: String(row.status),
    visibility: String(row.visibility),
    format_name: row.format_name ? String(row.format_name) : null,
    venue_name: row.venue_name ? String(row.venue_name) : null,
  };
}

async function getTeamPlayers(teamId: string): Promise<TeamPlayer[]> {
  const result = await db.execute(`
    SELECT 
      player_id,
      player_name,
      jersey_number,
      is_active
    FROM m_players
    WHERE current_team_id = ?
    ORDER BY jersey_number ASC, player_name ASC
  `, [teamId]);

  // データベースの行オブジェクトをプレーンオブジェクトに変換
  return result.rows.map(row => ({
    player_id: Number(row.player_id),
    player_name: String(row.player_name),
    jersey_number: row.jersey_number ? Number(row.jersey_number) : null,
    is_active: Number(row.is_active)
  }));
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
    SELECT 
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

export default async function TournamentJoinPage({ params }: PageProps) {
  const session = await auth();
  const resolvedParams = await params;
  const tournamentId = parseInt(resolvedParams.id);

  // 認証チェック（チーム権限必須）
  if (!session || session.user.role !== 'team') {
    redirect(`/auth/login?callbackUrl=${encodeURIComponent(`/tournaments/${tournamentId}/join`)}`);
  }

  const teamId = session.user.teamId;
  if (!teamId) {
    redirect(`/auth/login?callbackUrl=${encodeURIComponent(`/tournaments/${tournamentId}/join`)}`);
  }

  // 大会情報取得
  const tournament = await getTournamentDetails(tournamentId);
  if (!tournament) {
    redirect('/public/tournaments');
  }

  // 募集期間チェック
  const now = new Date().toISOString().split('T')[0];
  if (tournament.recruitment_start_date && tournament.recruitment_end_date) {
    if (now < tournament.recruitment_start_date || now > tournament.recruitment_end_date) {
      redirect(`/public/tournaments/${tournamentId}`);
    }
  }

  // 既に参加申し込み済みかチェック
  const alreadyJoined = await checkExistingParticipation(tournamentId, teamId);

  // チームの選手一覧取得
  const teamPlayers = await getTeamPlayers(teamId);

  // 既存の大会参加選手情報を取得（修正モードの場合）
  const existingTournamentPlayers = alreadyJoined 
    ? await getExistingTournamentPlayers(tournamentId, teamId)
    : [];

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            {alreadyJoined ? '参加選手の変更' : '大会参加申し込み'}
          </h1>
          <p className="text-gray-600">
            {alreadyJoined 
              ? `${tournament.tournament_name} への参加選手を変更してください`
              : `${tournament.tournament_name} への参加選手を選択してください`
            }
          </p>
          {alreadyJoined && (
            <div className="mt-2 p-3 bg-blue-50 border border-blue-200 rounded-md">
              <p className="text-sm text-blue-800">
                既に参加申し込み済みです。参加選手の変更や背番号の修正が可能です。
              </p>
            </div>
          )}
        </div>

        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">大会情報</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div>
              <span className="font-medium text-gray-700">大会名:</span>
              <span className="ml-2">{tournament.tournament_name}</span>
            </div>
            <div>
              <span className="font-medium text-gray-700">形式:</span>
              <span className="ml-2">{tournament.format_name}</span>
            </div>
            {tournament.venue_name && (
              <div>
                <span className="font-medium text-gray-700">会場:</span>
                <span className="ml-2">{tournament.venue_name}</span>
              </div>
            )}
            <div>
              <span className="font-medium text-gray-700">募集期間:</span>
              <span className="ml-2">
                {tournament.recruitment_start_date} 〜 {tournament.recruitment_end_date}
              </span>
            </div>
          </div>
        </div>

        <TournamentJoinForm
          tournamentId={tournamentId}
          teamPlayers={teamPlayers}
          existingTournamentPlayers={existingTournamentPlayers}
          isEditMode={alreadyJoined}
        />
      </div>
    </div>
  );
}