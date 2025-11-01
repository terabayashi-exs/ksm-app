import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import TournamentGroupList from '@/components/features/tournament/TournamentGroupList';
import { Plus } from 'lucide-react';

export default async function TournamentGroupsPage() {
  const session = await auth();
  
  if (!session) {
    redirect('/auth/login');
  }
  
  if (session.user.role !== 'admin') {
    redirect('/');
  }

  return (
    <div className="container mx-auto py-8 px-4">
      <div className="mb-8">
        <div className="flex justify-between items-center">
          <h1 className="text-3xl font-bold">大会グループ管理</h1>
          <div className="flex gap-4">
            <Button asChild variant="outline">
              <Link href="/admin/tournament-groups/create">
                <Plus className="w-4 h-4 mr-2" />
                新規グループ作成
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/admin">
                ダッシュボードに戻る
              </Link>
            </Button>
          </div>
        </div>
        <p className="mt-2 text-gray-600">
          複数の大会をグループ化して、統一的に管理できます。
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>グループ一覧</CardTitle>
        </CardHeader>
        <CardContent>
          <TournamentGroupList />
        </CardContent>
      </Card>
    </div>
  );
}