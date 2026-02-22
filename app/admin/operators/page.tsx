import { Metadata } from 'next';
import { getServerSession } from 'next-auth';
import { authOptions, ExtendedUser } from '@/lib/auth';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import OperatorList from '@/components/admin/operators/operator-list';

export const metadata: Metadata = {
  title: '運営者の管理',
  description: '運営者の登録・編集・削除',
};

export default async function OperatorsPage({
  searchParams,
}: {
  searchParams: Promise<{ group_id?: string }>;
}) {
  const session = await getServerSession(authOptions);

  if (!session?.user || (session.user as ExtendedUser).role !== 'admin') {
    redirect('/auth/admin/login');
  }

  const params = await searchParams;
  const groupId = params.group_id ? parseInt(params.group_id, 10) : undefined;

  console.log('OperatorsPage - groupId:', groupId, 'params:', params);

  return (
    <div className="container mx-auto py-8 px-4">
      <div className="mb-6">
        <div className="flex justify-between items-start mb-4">
          <div>
            <h1 className="text-3xl font-bold mb-2">
              {groupId ? "大会の運営者管理" : "運営者の管理"}
            </h1>
            <p className="text-muted-foreground">
              運営者の登録、編集、削除を行います。運営者ごとに権限とアクセス可能な部門を設定できます。
            </p>
          </div>
          <Button asChild variant="outline">
            <Link href="/my?tab=admin">
              ダッシュボードに戻る
            </Link>
          </Button>
        </div>
      </div>

      <OperatorList groupId={groupId} />
    </div>
  );
}
