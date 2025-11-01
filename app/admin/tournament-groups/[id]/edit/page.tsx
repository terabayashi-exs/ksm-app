import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db';
import TournamentGroupForm from '@/components/features/tournament/TournamentGroupForm';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function EditTournamentGroupPage({ params }: Props) {
  const session = await auth();
  
  if (!session) {
    redirect('/auth/login');
  }
  
  if (session.user.role !== 'admin') {
    redirect('/');
  }

  const { id } = await params;
  const groupId = parseInt(id);

  // グループ情報を取得
  const groupResult = await db.execute(`
    SELECT * FROM m_tournament_groups WHERE group_id = ?
  `, [groupId]);

  if (groupResult.rows.length === 0) {
    redirect('/admin/tournament-groups');
  }

  const groupRow = groupResult.rows[0];
  const group = {
    group_id: Number(groupRow.group_id),
    group_name: String(groupRow.group_name),
    group_description: groupRow.group_description ? String(groupRow.group_description) : undefined,
    group_color: String(groupRow.group_color),
    display_order: Number(groupRow.display_order)
  };

  return (
    <div className="container mx-auto py-8 px-4 max-w-2xl">
      <Card>
        <CardHeader>
          <CardTitle>グループ編集: {group.group_name}</CardTitle>
        </CardHeader>
        <CardContent>
          <TournamentGroupForm group={group} />
        </CardContent>
      </Card>
    </div>
  );
}