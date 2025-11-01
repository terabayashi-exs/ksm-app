import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import TournamentGroupForm from '@/components/features/tournament/TournamentGroupForm';

export default async function CreateTournamentGroupPage() {
  const session = await auth();
  
  if (!session) {
    redirect('/auth/login');
  }
  
  if (session.user.role !== 'admin') {
    redirect('/');
  }

  return (
    <div className="container mx-auto py-8 px-4 max-w-2xl">
      <Card>
        <CardHeader>
          <CardTitle>新規グループ作成</CardTitle>
        </CardHeader>
        <CardContent>
          <TournamentGroupForm />
        </CardContent>
      </Card>
    </div>
  );
}