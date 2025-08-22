// app/tournaments/[id]/withdrawal/page.tsx
// 大会エントリー辞退申請ページ

import { Suspense } from 'react';
import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db';
import WithdrawalForm from '@/components/features/tournament/WithdrawalForm';
import BackButton from '@/components/ui/back-button';
import { Card, CardContent } from '@/components/ui/card';

interface PageProps {
  params: Promise<{ id: string }>;
}

async function getTournamentInfo(tournamentId: number, userEmail: string) {
  // 大会情報と参加状況を取得
  const result = await db.execute(`
    SELECT 
      t.tournament_name,
      t.status as tournament_status,
      tt.tournament_team_id,
      tt.team_name,
      tt.withdrawal_status
    FROM t_tournaments t
    LEFT JOIN t_tournament_teams tt ON t.tournament_id = tt.tournament_id
    LEFT JOIN m_teams mt ON tt.team_id = mt.team_id
    WHERE t.tournament_id = ? AND (mt.contact_email = ? OR tt.tournament_team_id IS NULL)
    LIMIT 1
  `, [tournamentId, userEmail]);

  if (result.rows.length === 0) {
    return null;
  }

  return result.rows[0];
}

export default async function WithdrawalPage({ params }: PageProps) {
  const session = await auth();
  
  if (!session) {
    redirect('/auth/login');
  }

  const resolvedParams = await params;
  const tournamentId = parseInt(resolvedParams.id);
  
  if (isNaN(tournamentId)) {
    redirect('/team');
  }

  const tournamentInfo = await getTournamentInfo(tournamentId, session.user.email);

  if (!tournamentInfo) {
    redirect('/team');
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <div className="space-y-6">
        {/* ヘッダー */}
        <div className="flex items-center gap-4">
          <BackButton />
          <div>
            <h1 className="text-2xl font-bold text-gray-900">大会エントリー辞退</h1>
            <p className="text-gray-600 mt-1">{String(tournamentInfo.tournament_name)}</p>
          </div>
        </div>

        {/* 辞退申請フォーム */}
        <Suspense fallback={
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-center py-8">
                <div className="text-gray-500">読み込み中...</div>
              </div>
            </CardContent>
          </Card>
        }>
          <WithdrawalForm tournamentId={tournamentId} />
        </Suspense>

        {/* 注意事項 */}
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="pt-6">
            <h3 className="font-semibold text-amber-800 mb-2">⚠️ 辞退申請に関する注意事項</h3>
            <ul className="text-sm text-amber-700 space-y-1 list-disc list-inside">
              <li>辞退申請は管理者の承認が必要です</li>
              <li>承認後はエントリーの取り消しができません</li>
              <li>既に試合が開始されている場合、辞退により不戦敗となる可能性があります</li>
              <li>参加費の返金については大会運営者にお問い合わせください</li>
              <li>辞退理由は管理者に共有されます</li>
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}