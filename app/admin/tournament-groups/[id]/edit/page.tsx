export const metadata = { title: "大会編集" };

import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import Link from 'next/link';
import { ChevronRight, Home } from 'lucide-react';
import Header from '@/components/layout/Header';
import TournamentGroupEditForm from '@/components/features/tournament/TournamentGroupEditForm';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function EditTournamentGroupPage({ params }: Props) {
  const session = await auth();

  if (!session || session.user.role !== 'admin') {
    redirect('/auth/login');
  }

  const { id } = await params;
  const groupId = parseInt(id);

  // 大会情報を取得
  const groupResult = await db.execute(`
    SELECT
      tg.group_id,
      tg.group_name,
      tg.organizer,
      tg.venue_id,
      tg.event_start_date,
      tg.event_end_date,
      tg.recruitment_start_date,
      tg.recruitment_end_date,
      tg.visibility,
      tg.event_description,
      tg.created_at,
      tg.updated_at
    FROM t_tournament_groups tg
    WHERE tg.group_id = ?
  `, [groupId]);

  if (groupResult.rows.length === 0) {
    redirect('/admin/tournament-groups');
  }

  const groupRow = groupResult.rows[0];

  // プレーンなオブジェクトに変換
  const group = {
    group_id: Number(groupRow.group_id),
    group_name: String(groupRow.group_name),
    organizer: groupRow.organizer ? String(groupRow.organizer) : null,
    venue_id: groupRow.venue_id ? Number(groupRow.venue_id) : null,
    event_start_date: groupRow.event_start_date ? String(groupRow.event_start_date) : null,
    event_end_date: groupRow.event_end_date ? String(groupRow.event_end_date) : null,
    recruitment_start_date: groupRow.recruitment_start_date ? String(groupRow.recruitment_start_date) : null,
    recruitment_end_date: groupRow.recruitment_end_date ? String(groupRow.recruitment_end_date) : null,
    visibility: String(groupRow.visibility),
    event_description: groupRow.event_description ? String(groupRow.event_description) : null,
  };

  return (
    <div className="min-h-screen bg-white">
      <Header />

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
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
          <Link href="/admin/tournament-groups" className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-gray-100 text-gray-600 hover:bg-gray-200 hover:text-gray-900 transition-colors whitespace-nowrap">
            大会一覧
          </Link>
          <ChevronRight className="h-4 w-4 text-gray-400 flex-shrink-0" />
          <Link href={`/admin/tournament-groups/${id}`} className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-gray-100 text-gray-600 hover:bg-gray-200 hover:text-gray-900 transition-colors whitespace-nowrap">
            {group.group_name}
          </Link>
          <ChevronRight className="h-4 w-4 text-gray-400 flex-shrink-0" />
          <span className="inline-flex items-center px-2.5 py-1.5 rounded-md bg-primary/10 text-primary font-medium">
            大会情報を編集
          </span>
        </nav>
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">大会情報を編集</h1>
          <p className="text-sm text-gray-500 mt-1">
            {group.group_name}
          </p>
        </div>
        <TournamentGroupEditForm initialData={group} />
      </div>
    </div>
  );
}
