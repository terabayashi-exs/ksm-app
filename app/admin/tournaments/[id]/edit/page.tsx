// app/admin/tournaments/[id]/edit/page.tsx
import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import TournamentEditForm from '@/components/forms/TournamentEditForm';
import { db } from '@/lib/db';
import { Tournament } from '@/lib/types';

async function getTournament(id: string): Promise<Tournament | null> {
  try {
    // Fetching tournament data server-side
    const result = await db.execute(`
      SELECT 
        t.tournament_id,
        t.tournament_name,
        t.format_id,
        t.venue_id,
        t.team_count,
        t.court_count,
        t.tournament_dates,
        t.match_duration_minutes,
        t.break_duration_minutes,
        t.win_points,
        t.draw_points,
        t.loss_points,
        t.walkover_winner_goals,
        t.walkover_loser_goals,
        t.status,
        t.visibility,
        t.public_start_date,
        t.recruitment_start_date,
        t.recruitment_end_date,
        t.created_at,
        t.updated_at,
        v.venue_name,
        f.format_name
      FROM t_tournaments t
      LEFT JOIN m_venues v ON t.venue_id = v.venue_id
      LEFT JOIN m_tournament_formats f ON t.format_id = f.format_id
      WHERE t.tournament_id = ?
    `, [parseInt(id)]);

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    return {
      tournament_id: Number(row.tournament_id),
      tournament_name: String(row.tournament_name),
      format_id: Number(row.format_id),
      venue_id: Number(row.venue_id),
      team_count: Number(row.team_count),
      court_count: Number(row.court_count),
      tournament_dates: row.tournament_dates as string,
      match_duration_minutes: Number(row.match_duration_minutes),
      break_duration_minutes: Number(row.break_duration_minutes),
      win_points: Number(row.win_points),
      draw_points: Number(row.draw_points),
      loss_points: Number(row.loss_points),
      walkover_winner_goals: Number(row.walkover_winner_goals),
      walkover_loser_goals: Number(row.walkover_loser_goals),
      status: row.status as 'planning' | 'ongoing' | 'completed',
      visibility: row.visibility === 'open' ? 1 : 0,
      public_start_date: row.public_start_date as string,
      recruitment_start_date: row.recruitment_start_date as string,
      recruitment_end_date: row.recruitment_end_date as string,
      created_at: String(row.created_at),
      updated_at: String(row.updated_at),
      venue_name: row.venue_name as string,
      format_name: row.format_name as string
    };
  } catch (error) {
    console.error('大会データの取得に失敗:', error);
    return null;
  }
}

interface EditTournamentPageProps {
  params: Promise<{ id: string }>;
}

// キャッシュを無効化
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function EditTournamentPage({ params }: EditTournamentPageProps) {
  const session = await auth();
  
  if (!session || session.user.role !== 'admin') {
    redirect('/auth/login');
  }

  const resolvedParams = await params;
  const tournament = await getTournament(resolvedParams.id);

  if (!tournament) {
    redirect('/admin');
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
                <h1 className="text-3xl font-bold text-gray-900">大会編集</h1>
                <p className="text-sm text-gray-500 mt-1">
                  「{tournament.tournament_name}」の設定を編集します
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* メインコンテンツ */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <TournamentEditForm tournament={tournament} />
      </div>
    </div>
  );
}