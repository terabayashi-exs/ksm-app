// app/admin/withdrawal-requests/page.tsx
// 管理者向け辞退申請管理ページ

export const metadata = { title: "辞退申請管理" };

import { Suspense } from 'react';
import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import WithdrawalRequestManagement from '@/components/features/admin/WithdrawalRequestManagement';
import { Card, CardContent } from '@/components/ui/card';
import { ChevronRight, Home } from 'lucide-react';
import Link from 'next/link';
import Header from '@/components/layout/Header';

export default async function WithdrawalRequestsPage() {
  const session = await auth();
  
  if (!session || session.user.role !== 'admin') {
    redirect('/auth/login');
  }

  return (
    <div className="min-h-screen bg-white">
      <Header />
      <div className="container mx-auto px-4 py-8 max-w-6xl">
        <nav className="flex flex-wrap items-center gap-1.5 text-sm mb-6">
          <Link href="/" className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-gray-100 text-gray-600 hover:bg-gray-200 hover:text-gray-900 transition-colors whitespace-nowrap">
            <Home className="h-3.5 w-3.5" />
            <span>Home</span>
          </Link>
          <ChevronRight className="h-4 w-4 text-gray-400 flex-shrink-0" />
          <Link href="/my?tab=admin" className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-gray-100 text-gray-600 hover:bg-gray-200 hover:text-gray-900 transition-colors whitespace-nowrap">
            マイダッシュボード
          </Link>
          <ChevronRight className="h-4 w-4 text-gray-400 flex-shrink-0" />
          <span className="inline-flex items-center px-2.5 py-1.5 rounded-md bg-primary/10 text-primary font-medium">
            辞退申請管理
          </span>
        </nav>
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">辞退申請管理</h1>
          <p className="text-sm text-gray-500 mt-1">
            チームからの大会辞退申請を確認・承認・却下することができます
          </p>
        </div>
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