import { Metadata } from 'next';
import { getServerSession } from 'next-auth';
import { authOptions, ExtendedUser } from '@/lib/auth';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
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
    <div>
      <div className="bg-base-800 border-b-[3px] border-primary">
        <div className="max-w-_xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="py-6">
            <h1 className="text-3xl font-bold text-white">運営者を追加</h1>
            <p className="text-sm text-white/70 mt-1">
              メールアドレスを入力すると、既存アカウントの有無を自動判定します。既存ユーザーには即座に権限を付与し、新規ユーザーには招待メールを送信します。
            </p>
          </div>
        </div>
      </div>
      <div className="container mx-auto py-8 px-4 max-w-4xl">
        <div className="mb-6">
          <Button asChild variant="outline" size="sm">
            <Link href={groupId ? `/admin/operators?group_id=${groupId}` : '/admin/operators'}>
              <ArrowLeft className="h-4 w-4 mr-1" />
              運営者一覧に戻る
            </Link>
          </Button>
        </div>
        <NewOperatorForm groupId={groupId} />
      </div>
    </div>
  );
}
