// app/admin/tournaments/[id]/participants/page.tsx
// 参加チーム管理ページ

export const metadata = { title: "参加チーム管理" };

import { Suspense } from 'react';
import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import ParticipantManagement from '@/components/features/admin/ParticipantManagement';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Users, Mail, ChevronRight, Home } from 'lucide-react';
import Link from 'next/link';
import { Skeleton } from '@/components/ui/skeleton';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function ParticipantsPage({ params }: PageProps) {
  const session = await auth();

  if (!session || (session.user.role !== 'admin' && session.user.role !== 'operator')) {
    redirect('/auth/login');
  }

  const resolvedParams = await params;
  const tournamentId = parseInt(resolvedParams.id, 10);

  if (isNaN(tournamentId)) {
    redirect('/admin/tournaments');
  }

  return (
    <div>
      <div className="bg-base-800 border-b-[3px] border-primary">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="py-6">
            <h1 className="text-3xl font-bold text-white flex items-center gap-3">
              <Users className="h-8 w-8 text-white" />
              参加チーム管理
            </h1>
          </div>
        </div>
      </div>
      <div className="container mx-auto px-4 py-8 max-w-7xl">
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
            参加チーム管理
          </span>
        </nav>
        <div className="flex items-center justify-end mb-6">
          <Button asChild variant="outline">
            <Link href={`/admin/tournaments/${tournamentId}/participants/email`}>
              <Mail className="h-4 w-4 mr-2" />
              メール送信
            </Link>
          </Button>
        </div>
        <div className="space-y-6">
          {/* 参加チーム管理コンポーネント */}
        <Suspense fallback={
          <div className="space-y-4">
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-64 w-full" />
          </div>
        }>
          <ParticipantManagement tournamentId={tournamentId} />
        </Suspense>

        {/* 注意事項 */}
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="pt-6">
            <h3 className="font-semibold text-primary mb-2">💡 参加チーム管理について</h3>
            <ul className="text-sm text-primary space-y-1 list-disc list-inside">
              <li>参加確定チームをキャンセル待ちに変更すると、参加枠が空きます</li>
              <li>辞退申請を承認すると、自動的にキャンセル済みになります</li>
              <li>辞退承認後は、試合結果に影響を与える可能性があります</li>
            </ul>
          </CardContent>
        </Card>
        </div>
      </div>
    </div>
  );
}
