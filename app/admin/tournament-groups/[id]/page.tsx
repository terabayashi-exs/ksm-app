import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db';
import Link from 'next/link';
import TournamentGroupDetail from '@/components/features/tournament/TournamentGroupDetail';
import { ArrowLeft, Edit } from 'lucide-react';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function TournamentGroupDetailPage({ params }: Props) {
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
    <div className="container mx-auto py-8 px-4">
      <div className="mb-6 flex justify-between items-center">
        <div className="flex items-center gap-4">
          <Button asChild variant="outline" size="icon">
            <Link href="/admin/tournament-groups">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-3xl font-bold">{group.group_name}</h1>
            {group.group_description && (
              <p className="text-gray-600 mt-1">{group.group_description}</p>
            )}
          </div>
        </div>
        <Button asChild variant="outline">
          <Link href={`/admin/tournament-groups/${groupId}/edit`}>
            <Edit className="h-4 w-4 mr-2" />
            グループ情報を編集
          </Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>グループ内の大会管理</CardTitle>
        </CardHeader>
        <CardContent>
          <TournamentGroupDetail groupId={groupId} />
        </CardContent>
      </Card>
    </div>
  );
}