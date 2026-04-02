// app/admin/tournaments/[id]/edit/page.tsx
export const metadata = { title: "部門編集" };

import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { ChevronRight, Home } from 'lucide-react';
import Header from '@/components/layout/Header';
import TournamentEditForm from '@/components/forms/TournamentEditForm';
import { db } from '@/lib/db';
import { Tournament } from '@/lib/types';
import type { TournamentStatus } from '@/lib/tournament-status';

type TournamentWithExtras = Tournament & { sport_name: string | null; default_match_duration: number | null; default_break_duration: number | null };

async function getTournament(id: string): Promise<TournamentWithExtras | null> {
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
        t.status,
        t.visibility,
        t.show_players_public,
        t.public_start_date,
        t.recruitment_start_date,
        t.recruitment_end_date,
        t.sport_type_id,
        t.group_id,
        t.created_at,
        t.updated_at,
        v.venue_name,
        f.format_name,
        f.default_match_duration,
        f.default_break_duration,
        st.sport_name,
        tg.group_name
      FROM t_tournaments t
      LEFT JOIN m_venues v ON v.venue_id = CAST(JSON_EXTRACT(t.venue_id, '$[0]') AS INTEGER)
      LEFT JOIN m_tournament_formats f ON t.format_id = f.format_id
      LEFT JOIN m_sport_types st ON t.sport_type_id = st.sport_type_id
      LEFT JOIN t_tournament_groups tg ON t.group_id = tg.group_id
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
      venue_id: row.venue_id ? String(row.venue_id) : null,
      team_count: Number(row.team_count),
      court_count: Number(row.court_count),
      tournament_dates: row.tournament_dates as string,
      match_duration_minutes: Number(row.match_duration_minutes),
      break_duration_minutes: Number(row.break_duration_minutes),
      status: row.status as TournamentStatus,
      visibility: row.visibility === 'open' ? 1 : 0,
      show_players_public: Number(row.show_players_public) === 1,
      public_start_date: row.public_start_date as string,
      recruitment_start_date: row.recruitment_start_date as string,
      recruitment_end_date: row.recruitment_end_date as string,
      sport_type_id: Number(row.sport_type_id || 0),
      group_id: row.group_id ? Number(row.group_id) : null,
      created_at: String(row.created_at),
      updated_at: String(row.updated_at),
      venue_name: row.venue_name as string,
      format_name: row.format_name as string,
      group_name: row.group_name ? String(row.group_name) : null,
      sport_name: row.sport_name ? String(row.sport_name) : null,
      default_match_duration: row.default_match_duration ? Number(row.default_match_duration) : null,
      default_break_duration: row.default_break_duration ? Number(row.default_break_duration) : null,
    } as Tournament & { sport_name: string | null; default_match_duration: number | null; default_break_duration: number | null };
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

  if (!session || (session.user.role !== 'admin' && session.user.role !== 'operator')) {
    redirect('/auth/admin/login');
  }

  const resolvedParams = await params;
  const tournament = await getTournament(resolvedParams.id);

  if (!tournament) {
    redirect('/admin');
  }

  return (
    <div className="min-h-screen bg-white">
      <Header />

      {/* メインコンテンツ */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <nav className="flex flex-wrap items-center gap-1.5 text-sm mb-6">
          <Link href="/" className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-gray-100 text-gray-600 hover:bg-gray-200 hover:text-gray-900 transition-colors whitespace-nowrap">
            <Home className="h-3.5 w-3.5" />
            <span>Home</span>
          </Link>
          <ChevronRight className="h-4 w-4 text-gray-400 flex-shrink-0" />
          <Link href="/my?tab=admin" className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-gray-100 text-gray-600 hover:bg-gray-200 hover:text-gray-900 transition-colors whitespace-nowrap">
            マイダッシュボード
          </Link>
          <ChevronRight className="h-4 w-4 text-gray-400 flex-shrink-0" />
          <span className="inline-flex items-center px-2.5 py-1.5 rounded-md bg-primary/10 text-primary font-medium">
            部門編集
          </span>
        </nav>
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">部門編集</h1>
          <p className="text-sm text-gray-500 mt-1">
            部門「{tournament.tournament_name}」の設定を編集します
          </p>
        </div>
        <TournamentEditForm tournament={tournament} />
      </div>
    </div>
  );
}