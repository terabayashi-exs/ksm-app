import { Metadata } from 'next';
import { getServerSession } from 'next-auth';
import { authOptions, ExtendedUser } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { notFound } from 'next/navigation';
import OperatorForm from '@/components/admin/operators/operator-form';
import { db } from '@/lib/db';

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

async function getOperator(operatorId: number, adminLoginId: string) {
  try {
    // 管理者IDを取得
    const adminResult = await db.execute({
      sql: 'SELECT administrator_id FROM m_administrators WHERE admin_login_id = ?',
      args: [adminLoginId]
    });

    if (adminResult.rows.length === 0) {
      return null;
    }

    // 運営者を取得
    const operatorResult = await db.execute({
      sql: `SELECT
              operator_id,
              operator_login_id,
              operator_name,
              administrator_id,
              is_active,
              created_at,
              updated_at
            FROM m_operators
            WHERE operator_id = ?`,
      args: [operatorId]
    });

    if (operatorResult.rows.length === 0) {
      return null;
    }

    const operator = operatorResult.rows[0];

    // 所属確認
    if (operator.administrator_id !== adminResult.rows[0].administrator_id) {
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
      operatorId: Number(operator.operator_id),
      operatorLoginId: operator.operator_login_id,
      operatorName: operator.operator_name,
      administratorId: Number(operator.administrator_id),
      isActive: operator.is_active === 1,
      createdAt: operator.created_at,
      updatedAt: operator.updated_at,
      accessibleTournaments: accessResult.rows.map((row) => ({
        tournamentId: Number(row.tournament_id),
        tournamentName: row.tournament_name,
        categoryName: row.category_name,
        groupId: Number(row.group_id),
        groupName: row.group_name,
        permissions: JSON.parse(row.permissions as string)
      }))
    };
  } catch (error) {
    console.error('運営者取得エラー:', error);
    return null;
  }
}

export default async function EditOperatorPage({ params, searchParams }: PageProps) {
  const session = await getServerSession(authOptions);

  if (!session?.user || (session.user as ExtendedUser).role !== 'admin') {
    redirect('/auth/signin');
  }

  const resolvedParams = await params;
  const resolvedSearchParams = await searchParams;
  const operatorId = parseInt(resolvedParams.id);
  const groupId = resolvedSearchParams.group_id ? parseInt(resolvedSearchParams.group_id, 10) : undefined;

  const operator = await getOperator(operatorId, session.user.id);

  if (!operator) {
    notFound();
  }

  const initialData = {
    operatorLoginId: String(operator.operatorLoginId),
    operatorName: String(operator.operatorName),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tournamentAccess: operator.accessibleTournaments.map((t: any) => ({
      tournamentId: Number(t.tournamentId),
      tournamentName: String(t.tournamentName || ''),
      categoryName: String(t.categoryName || ''),
      groupId: Number(t.groupId),
      groupName: String(t.groupName || ''),
      permissions: t.permissions
    })),
  };

  return (
    <div className="container mx-auto py-8 px-4 max-w-4xl">
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2">運営者を編集</h1>
        <p className="text-muted-foreground">
          {String(operator.operatorName)}（{String(operator.operatorLoginId)}）の情報を編集します。
        </p>
      </div>

      <OperatorForm
        operatorId={operatorId}
        initialData={initialData}
        mode="edit"
        groupId={groupId}
      />
    </div>
  );
}
