import { Metadata } from 'next';
import { getServerSession } from 'next-auth';
import { authOptions, ExtendedUser } from '@/lib/auth';
import { redirect } from 'next/navigation';
import OperatorForm from '@/components/admin/operators/operator-form';

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
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2">運営者を追加</h1>
        <p className="text-muted-foreground">
          新しい運営者を登録します。運営者はログインして担当する大会の運営業務を行うことができます。
        </p>
      </div>

      <OperatorForm mode="create" groupId={groupId} />
    </div>
  );
}
