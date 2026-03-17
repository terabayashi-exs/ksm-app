// app/admin/withdrawal-requests/page.tsx
// 管理者向け辞退申請管理ページ

import { Suspense } from 'react';
import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import WithdrawalRequestManagement from '@/components/features/admin/WithdrawalRequestManagement';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AlertTriangle, ArrowLeft } from 'lucide-react';
import Link from 'next/link';

export default async function WithdrawalRequestsPage() {
  const session = await auth();
  
  if (!session || session.user.role !== 'admin') {
    redirect('/auth/login');
  }

  return (
    <div>
      <div className="bg-base-800 border-b-[3px] border-primary">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-6">
            <div>
              <h1 className="text-3xl font-bold text-white flex items-center gap-2">
                <AlertTriangle className="h-8 w-8 text-white" />
                辞退申請管理
              </h1>
              <p className="text-sm text-white/70 mt-1">
                チームからの大会辞退申請を確認・承認・却下することができます
              </p>
            </div>
            <Button asChild variant="outline" className="text-white border-white/30 hover:bg-white/10 hover:text-white">
              <Link href="/admin" className="flex items-center gap-2">
                <ArrowLeft className="h-4 w-4" />
                ダッシュボードに戻る
              </Link>
            </Button>
          </div>
        </div>
      </div>
      <div className="container mx-auto px-4 py-8 max-w-6xl">
        <div className="space-y-6">
          {/* 辞退申請管理コンポーネント */}
        <Suspense fallback={
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-center py-8">
                <div className="text-gray-500">辞退申請を読み込み中...</div>
              </div>
            </CardContent>
          </Card>
        }>
          <WithdrawalRequestManagement />
        </Suspense>

        {/* 注意事項 */}
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="pt-6">
            <h3 className="font-semibold text-primary mb-2">💡 辞退申請処理について</h3>
            <ul className="text-sm text-primary space-y-1 list-disc list-inside">
              <li>承認された辞退申請は取り消すことができません</li>
              <li>辞退承認後は、該当チームの試合結果に影響を与える可能性があります</li>
              <li>却下された申請について、チームには別途連絡することをお勧めします</li>
              <li>辞退が承認されても、参加費の返金は別途手動で対応してください</li>
              <li>大会開始後の辞退承認は特に慎重に検討してください</li>
            </ul>
          </CardContent>
        </Card>
        </div>
      </div>
    </div>
  );
}