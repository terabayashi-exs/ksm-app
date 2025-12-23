// app/tournaments/[id]/teams/page.tsx
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { redirect } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';
import Link from 'next/link';
import { Users, Edit, Eye } from 'lucide-react';

interface PageProps {
  params: Promise<{ id: string }>;
}

interface TournamentDetails {
  tournament_id: number;
  tournament_name: string;
  format_name: string | null;
  venue_name: string | null;
}

interface TournamentTeam {
  tournament_team_id: number;
  team_name: string;
  team_omission: string;
  player_count: number;
  created_at: string;
}

async function getTournamentDetails(tournamentId: number): Promise<TournamentDetails | null> {
  const result = await db.execute(`
    SELECT 
      t.tournament_id,
      t.tournament_name,
      f.format_name,
      v.venue_name
    FROM t_tournaments t
    LEFT JOIN m_tournament_formats f ON t.format_id = f.format_id
    LEFT JOIN m_venues v ON t.venue_id = v.venue_id
    WHERE t.tournament_id = ? AND t.visibility = 'open'
  `, [tournamentId]);

  const row = result.rows[0];
  if (!row) return null;

  return {
    tournament_id: Number(row.tournament_id),
    tournament_name: String(row.tournament_name),
    format_name: row.format_name ? String(row.format_name) : null,
    venue_name: row.venue_name ? String(row.venue_name) : null,
  };
}

async function getTournamentTeams(tournamentId: number, teamId: string): Promise<TournamentTeam[]> {
  const result = await db.execute(`
    SELECT 
      tt.tournament_team_id,
      tt.team_name,
      tt.team_omission,
      tt.created_at,
      COUNT(tp.player_id) as player_count
    FROM t_tournament_teams tt
    LEFT JOIN t_tournament_players tp ON tt.tournament_id = tp.tournament_id 
      AND tt.team_id = tp.team_id 
      AND tp.player_status = 'active'
    WHERE tt.tournament_id = ? AND tt.team_id = ?
    GROUP BY tt.tournament_team_id, tt.team_name, tt.team_omission, tt.created_at
    ORDER BY tt.created_at ASC
  `, [tournamentId, teamId]);

  return result.rows.map(row => ({
    tournament_team_id: Number(row.tournament_team_id),
    team_name: String(row.team_name),
    team_omission: String(row.team_omission),
    player_count: Number(row.player_count),
    created_at: String(row.created_at)
  }));
}

export default async function TournamentTeamsPage({ params }: PageProps) {
  const session = await auth();
  const resolvedParams = await params;
  const tournamentId = parseInt(resolvedParams.id);
  
  // 認証チェック（チーム権限必須）
  if (!session || session.user.role !== 'team') {
    redirect(`/auth/team/login?callbackUrl=${encodeURIComponent(`/tournaments/${tournamentId}/teams`)}`);
  }

  const teamId = session.user.teamId;
  if (!teamId) {
    redirect(`/auth/team/login?callbackUrl=${encodeURIComponent(`/tournaments/${tournamentId}/teams`)}`);
  }

  // 大会情報取得
  const tournament = await getTournamentDetails(tournamentId);
  if (!tournament) {
    redirect('/tournaments');
  }

  // 参加チーム一覧取得
  const tournamentTeams = await getTournamentTeams(tournamentId, teamId);
  
  // 参加していない場合は大会詳細にリダイレクト
  if (tournamentTeams.length === 0) {
    redirect(`/public/tournaments/${tournamentId}`);
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      
      <div className="bg-card shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-6">
            <div>
              <h1 className="text-3xl font-bold text-foreground">参加チーム管理</h1>
              <p className="text-sm text-muted-foreground mt-1">
                {tournament.tournament_name}
              </p>
            </div>
            <div className="flex space-x-3">
              <Button
                variant="outline"
                asChild
              >
                <Link href={`/public/tournaments/${tournamentId}`}>大会詳細に戻る</Link>
              </Button>
              <Button
                variant="outline"
                asChild
              >
                <Link href="/tournaments">大会一覧に戻る</Link>
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* 参加状況サマリー */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center">
              <Users className="w-5 h-5 mr-2" />
              参加状況
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="text-center">
                <div className="text-2xl font-bold text-blue-600">{tournamentTeams.length}</div>
                <div className="text-sm text-muted-foreground">参加チーム数</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-green-600">
                  {tournamentTeams.reduce((sum, team) => sum + team.player_count, 0)}
                </div>
                <div className="text-sm text-muted-foreground">総選手数</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-purple-600">
                  {tournamentTeams.filter(team => team.player_count > 0).length}
                </div>
                <div className="text-sm text-muted-foreground">選手登録済み</div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 参加チーム一覧 */}
        <Card>
          <CardHeader>
            <CardTitle>参加チーム一覧</CardTitle>
          </CardHeader>
          <CardContent>
            {tournamentTeams.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-muted-foreground">参加チームがありません。</p>
              </div>
            ) : (
              <div className="space-y-4">
                {tournamentTeams.map((team, index) => (
                  <div 
                    key={team.tournament_team_id} 
                    className="border rounded-lg p-4 hover:shadow-md transition-shadow"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-4">
                        <div className="bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-sm font-medium">
                          #{index + 1}
                        </div>
                        <div>
                          <h3 className="text-lg font-semibold text-foreground">
                            {team.team_name}
                          </h3>
                          <p className="text-sm text-muted-foreground">
                            略称: {team.team_omission} | 選手数: {team.player_count}人
                          </p>
                          <p className="text-xs text-muted-foreground/70">
                            登録日: {new Date(team.created_at).toLocaleDateString('ja-JP')}
                          </p>
                        </div>
                      </div>
                      <div className="flex space-x-2">
                        <Button 
                          asChild 
                          size="sm" 
                          variant="outline"
                          className="flex items-center"
                        >
                          <Link href={`/public/tournaments/${tournamentId}`}>
                            <Eye className="w-4 h-4 mr-1" />
                            詳細
                          </Link>
                        </Button>
                        <Button 
                          asChild 
                          size="sm" 
                          className="flex items-center bg-blue-600 hover:bg-blue-700"
                        >
                          <Link href={`/tournaments/${tournamentId}/join?team=${team.tournament_team_id}`}>
                            <Edit className="w-4 h-4 mr-1" />
                            参加選手変更
                          </Link>
                        </Button>
                      </div>
                    </div>
                    
                    {team.player_count === 0 && (
                      <div className="mt-3 p-3 bg-yellow-50 border border-yellow-200 rounded-md">
                        <p className="text-sm text-yellow-800">
                          ⚠️ このチームはまだ選手が登録されていません。参加選手を登録してください。
                        </p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
            
            {/* 追加参加ボタン */}
            <div className="mt-6 pt-6 border-t border-border">
              <div className="text-center">
                <Button 
                  asChild 
                  variant="outline" 
                  className="border-dashed border-2 border-muted hover:border-blue-300 hover:bg-muted"
                >
                  <Link href={`/tournaments/${tournamentId}/join?mode=new`}>
                    <Users className="w-4 h-4 mr-2" />
                    追加のチームで参加する
                  </Link>
                </Button>
                <p className="text-xs text-muted-foreground mt-2">
                  同じマスターチームから複数のチーム名で参加できます
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Footer />
    </div>
  );
}