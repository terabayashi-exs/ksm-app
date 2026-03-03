import { Metadata } from 'next';
import { getServerSession } from 'next-auth';
import { authOptions, ExtendedUser } from '@/lib/auth';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
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
    <div>
      <div className="bg-base-800 border-b-[3px] border-primary">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="py-6">
            <h1 className="text-3xl font-bold text-white">
              {groupId ? "大会の運営者管理" : "運営者の管理"}
            </h1>
            <p className="text-sm text-white/70 mt-1">
              運営者の登録、編集、削除を行います。運営者ごとに権限とアクセス可能な部門を設定できます。
            </p>
          </div>
        </div>
      </div>
      <div className="container mx-auto py-8 px-4">
        <div className="mb-6">
          <Button asChild variant="outline" size="sm">
            <Link href="/my?tab=admin">
              <ArrowLeft className="h-4 w-4 mr-1" />
              ダッシュボードに戻る
            </Link>
          </Button>
        </div>
        <OperatorList groupId={groupId} />
      </div>
    </div>
  );
}
