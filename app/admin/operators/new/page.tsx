import { Metadata } from 'next';
import { getServerSession } from 'next-auth';
import { authOptions, ExtendedUser } from '@/lib/auth';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { ChevronRight, Home } from 'lucide-react';
import NewOperatorForm from '@/components/admin/operators/new-operator-form';
import { hasOperatorPermission } from '@/lib/operator-permission-check';

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
  const user = session?.user as ExtendedUser | undefined;
  const roles = user?.roles || [];
  const isAdmin = roles.includes('admin');
  const loginUserId = user?.loginUserId;
  const isOperatorWithPerm = roles.includes('operator') && loginUserId
    ? await hasOperatorPermission(loginUserId, 'canManageOperators')
    : false;

  if (!session?.user || (!isAdmin && !isOperatorWithPerm)) {
    redirect('/auth/signin');
  }

  const params = await searchParams;
  const groupId = params.group_id ? parseInt(params.group_id, 10) : undefined;

  return (
    <div>
      <div className="bg-base-800 border-b-[3px] border-primary">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="py-6">
            <h1 className="text-3xl font-bold text-white">運営者を追加</h1>
            <p className="text-sm text-white/70 mt-1">
              メールアドレスを入力すると、既存アカウントの有無を自動判定します。既存ユーザーには即座に権限を付与し、新規ユーザーには招待メールを送信します。
            </p>
          </div>
        </div>
      </div>
      <div className="container mx-auto py-8 px-4 max-w-4xl">
        <nav className="flex flex-wrap items-center gap-1.5 text-sm mb-6">
          <Link href="/" className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-gray-100 text-gray-600 hover:bg-gray-200 hover:text-gray-900 transition-colors whitespace-nowrap"><Home className="h-3.5 w-3.5" /><span>Home</span></Link>
          <ChevronRight className="h-4 w-4 text-gray-400 flex-shrink-0" />
          <Link href="/my?tab=admin" className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-gray-100 text-gray-600 hover:bg-gray-200 hover:text-gray-900 transition-colors whitespace-nowrap">マイダッシュボード</Link>
          <ChevronRight className="h-4 w-4 text-gray-400 flex-shrink-0" />
          <Link href={groupId ? `/admin/operators?group_id=${groupId}` : '/admin/operators'} className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-gray-100 text-gray-600 hover:bg-gray-200 hover:text-gray-900 transition-colors whitespace-nowrap">運営者管理</Link>
          <ChevronRight className="h-4 w-4 text-gray-400 flex-shrink-0" />
          <span className="inline-flex items-center px-2.5 py-1.5 rounded-md bg-primary/10 text-primary font-medium">運営者を追加</span>
        </nav>
        <NewOperatorForm groupId={groupId} />
      </div>
    </div>
  );
}
