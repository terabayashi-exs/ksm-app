// app/admin/tournaments/create/page.tsx
import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import TournamentCreateForm from '@/components/forms/TournamentCreateForm';

export default async function CreateTournamentPage() {
  const session = await auth();
  
  if (!session || session.user.role !== 'admin') {
    redirect('/auth/login');
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ヘッダー */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between py-6">
            <div className="flex items-center space-x-4">
              <Button variant="outline" size="sm" asChild>
                <Link href="/admin" className="flex items-center">
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  ダッシュボードに戻る
                </Link>
              </Button>
              <div>
                <h1 className="text-3xl font-bold text-gray-900">新規大会作成</h1>
                <p className="text-sm text-gray-500 mt-1">
                  チーム数を入力して最適なフォーマットを選択し、大会の詳細を設定してください
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* メインコンテンツ */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <TournamentCreateForm />
      </div>
    </div>
  );
}