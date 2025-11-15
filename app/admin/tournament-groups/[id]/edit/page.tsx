import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
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
    <div className="min-h-screen bg-background">
      <div className="bg-card shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="py-6">
            <h1 className="text-3xl font-bold text-foreground">大会情報を編集</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {group.group_name}
            </p>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <TournamentGroupEditForm initialData={group} />
      </div>
    </div>
  );
}
