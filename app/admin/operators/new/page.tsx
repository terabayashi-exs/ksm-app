import { Metadata } from 'next';
import { getServerSession } from 'next-auth';
import { authOptions, ExtendedUser } from '@/lib/auth';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import NewOperatorForm from '@/components/admin/operators/new-operator-form';

export const metadata: Metadata = {
  title: '運営者を追加',
  description: '新しい運営者を登録します',
};

export default async function NewOperatorPage({
  searchParams,
}: {
  searchParams: Promise<{ group_id?: string }>;
}) {
  const session = await getServerSession(authOptions);

  if (!session?.user || (session.user as ExtendedUser).role !== 'admin') {
    redirect('/auth/signin');
  }

  const params = await searchParams;
  const groupId = params.group_id ? parseInt(params.group_id, 10) : undefined;

  return (
    <div className="container mx-auto py-8 px-4 max-w-4xl">
      <div className="flex justify-between items-start mb-6">
        <div>
          <h1 className="text-3xl font-bold mb-2">運営者を追加</h1>
          <p className="text-muted-foreground">
            メールアドレスを入力すると、既存アカウントの有無を自動判定します。既存ユーザーには即座に権限を付与し、新規ユーザーには招待メールを送信します。
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href={groupId ? `/admin/operators?group_id=${groupId}` : '/admin/operators'}>
            運営者一覧に戻る
          </Link>
        </Button>
      </div>

      <NewOperatorForm groupId={groupId} />
    </div>
  );
}
