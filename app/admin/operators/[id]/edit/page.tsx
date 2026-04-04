import { Metadata } from 'next';
import { getServerSession } from 'next-auth';
import { authOptions, ExtendedUser } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { notFound } from 'next/navigation';
import EditOperatorForm from '@/components/admin/operators/edit-operator-form';
import { db } from '@/lib/db';
import Link from 'next/link';
import { ChevronRight, Home } from 'lucide-react';
import Header from '@/components/layout/Header';
import { hasOperatorPermission } from '@/lib/operator-permission-check';

export const metadata: Metadata = {
  title: '運営者を編集',
  description: '運営者情報を編集します',
};

interface PageProps {
  params: Promise<{
    id: string;
  }>;
  searchParams: Promise<{
    group_id?: string;
  }>;
}

async function getOperator(operatorId: number, adminLoginUserId: number, isSuperadmin: boolean) {
  try {
    // 運営者を取得（m_login_users + m_login_user_roles）
    const operatorResult = await db.execute({
      sql: `SELECT
              u.login_user_id,
              u.email,
              u.display_name,
              u.is_active,
              u.created_at,
              u.updated_at,
              u.created_by_login_user_id
            FROM m_login_users u
            INNER JOIN m_login_user_roles r ON u.login_user_id = r.login_user_id
            WHERE u.login_user_id = ? AND r.role = 'operator'`,
      args: [operatorId]
    });

    if (operatorResult.rows.length === 0) {
      return null;
    }

    const operator = operatorResult.rows[0];

    // 所属確認（自分が作成した運営者のみ編集可能、スーパー管理者は全運営者を編集可能）
    if (!isSuperadmin && operator.created_by_login_user_id !== adminLoginUserId) {
      return null;
    }

    // アクセス可能な部門を取得
    const accessResult = await db.execute({
      sql: `SELECT
              ota.tournament_id,
              ota.permissions,
              t.tournament_name,
              t.category_name,
              t.group_id,
              tg.group_name
            FROM t_operator_tournament_access ota
            JOIN t_tournaments t ON ota.tournament_id = t.tournament_id
            JOIN t_tournament_groups tg ON t.group_id = tg.group_id
            WHERE ota.operator_id = ?
            ORDER BY tg.group_name, t.category_name`,
      args: [operatorId]
    });

    return {
      operatorId: Number(operator.login_user_id),
      operatorLoginId: String(operator.email),
      operatorName: String(operator.display_name),
      isActive: Number(operator.is_active) === 1,
      createdAt: String(operator.created_at),
      updatedAt: String(operator.updated_at),
      accessibleTournaments: accessResult.rows.map((row) => ({
        tournamentId: Number(row.tournament_id),
        tournamentName: String(row.tournament_name),
        categoryName: String(row.category_name),
        groupId: Number(row.group_id),
        groupName: String(row.group_name),
        permissions: JSON.parse(String(row.permissions))
      }))
    };
  } catch (error) {
    console.error('運営者取得エラー:', error);
    return null;
  }
}

export default async function EditOperatorPage({ params, searchParams }: PageProps) {
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

  const adminLoginUserId = loginUserId;
  const isSuperadmin = !!user?.isSuperadmin;
  if (!adminLoginUserId) {
    redirect('/auth/signin');
  }

  const resolvedParams = await params;
  const resolvedSearchParams = await searchParams;
  const operatorId = parseInt(resolvedParams.id);
  const groupId = resolvedSearchParams.group_id ? parseInt(resolvedSearchParams.group_id, 10) : undefined;

  const operator = await getOperator(operatorId, adminLoginUserId, isSuperadmin);

  if (!operator) {
    notFound();
  }

  return (
    <div className="min-h-screen bg-white">
      <Header />
      <div className="container mx-auto py-8 px-4 max-w-4xl">
        <nav className="flex flex-wrap items-center gap-1.5 text-sm mb-6">
          <Link href="/" className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-gray-100 text-gray-600 hover:bg-gray-200 hover:text-gray-900 transition-colors whitespace-nowrap"><Home className="h-3.5 w-3.5" /><span>Home</span></Link>
          <ChevronRight className="h-4 w-4 text-gray-400 flex-shrink-0" />
          <Link href="/my?tab=admin" className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-gray-100 text-gray-600 hover:bg-gray-200 hover:text-gray-900 transition-colors whitespace-nowrap">マイダッシュボード</Link>
          <ChevronRight className="h-4 w-4 text-gray-400 flex-shrink-0" />
          <Link href={groupId ? `/admin/operators?group_id=${groupId}` : '/admin/operators'} className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-gray-100 text-gray-600 hover:bg-gray-200 hover:text-gray-900 transition-colors whitespace-nowrap">運営者管理</Link>
          <ChevronRight className="h-4 w-4 text-gray-400 flex-shrink-0" />
          <span className="inline-flex items-center px-2.5 py-1.5 rounded-md bg-primary/10 text-primary font-medium">運営者を編集</span>
        </nav>
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">運営者を編集</h1>
          <p className="text-sm text-gray-500 mt-1">
            部門アクセス権と操作権限を変更できます
          </p>
        </div>
        <EditOperatorForm
        operatorId={operatorId}
        operatorEmail={String(operator.operatorLoginId)}
        operatorName={String(operator.operatorName)}
        initialTournamentAccess={operator.accessibleTournaments}
        groupId={groupId}
      />
      </div>
    </div>
  );
}
