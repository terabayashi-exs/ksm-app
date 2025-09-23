// app/admin/profile/page.tsx
// 管理者プロフィール設定ページ

import { Metadata } from 'next';
import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import AdminLogoUpload from '@/components/features/admin/AdminLogoUpload';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { User, ImageIcon } from 'lucide-react';

export const metadata: Metadata = {
  title: 'プロフィール設定 - 管理者',
  description: '管理者プロフィール設定とロゴ管理',
};

export default async function AdminProfilePage() {
  const session = await auth();

  if (!session || session.user.role !== 'admin') {
    redirect('/auth/login');
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="bg-card shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-6">
            <div>
              <h1 className="text-3xl font-bold text-foreground">プロフィール設定</h1>
              <p className="text-sm text-muted-foreground mt-1">
                管理者情報の確認とロゴの設定を行います
              </p>
            </div>
            <div>
              <Button asChild variant="outline">
                <Link href="/admin">ダッシュボードに戻る</Link>
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid gap-8">
          {/* 管理者基本情報 */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="h-5 w-5" />
              基本情報
            </CardTitle>
            <CardDescription>
              現在ログイン中の管理者情報
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-gray-700">管理者ID</label>
                <p className="text-gray-900 mt-1">{session.user.administratorId}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">ユーザー名</label>
                <p className="text-gray-900 mt-1">{session.user.name}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">メールアドレス</label>
                <p className="text-gray-900 mt-1">{session.user.email}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">権限</label>
                <p className="text-gray-900 mt-1">
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                    管理者
                  </span>
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ロゴ設定 */}
        <AdminLogoUpload />

        {/* 設定説明 */}
        <Card className="bg-blue-50 border-blue-200">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-blue-800">
              <ImageIcon className="h-5 w-5" />
              ロゴについて
            </CardTitle>
          </CardHeader>
          <CardContent className="text-blue-700">
            <div className="space-y-3">
              <h3 className="font-medium">ロゴ設定の効果</h3>
              <ul className="space-y-2 text-sm">
                <li className="flex items-start gap-2">
                  <span className="w-1.5 h-1.5 bg-blue-600 rounded-full mt-2 flex-shrink-0"></span>
                  <span>あなたが作成した大会のカードに組織ロゴが表示されます</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="w-1.5 h-1.5 bg-blue-600 rounded-full mt-2 flex-shrink-0"></span>
                  <span>参加者や観覧者が大会の主催者を一目で識別できます</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="w-1.5 h-1.5 bg-blue-600 rounded-full mt-2 flex-shrink-0"></span>
                  <span>組織のブランディング効果が期待できます</span>
                </li>
              </ul>
              
              <h3 className="font-medium mt-4">ロゴの推奨仕様</h3>
              <ul className="space-y-2 text-sm">
                <li className="flex items-start gap-2">
                  <span className="w-1.5 h-1.5 bg-blue-600 rounded-full mt-2 flex-shrink-0"></span>
                  <span>形式: JPEG、PNG、WebP</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="w-1.5 h-1.5 bg-blue-600 rounded-full mt-2 flex-shrink-0"></span>
                  <span>サイズ: 200x200px程度の正方形</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="w-1.5 h-1.5 bg-blue-600 rounded-full mt-2 flex-shrink-0"></span>
                  <span>容量: 5MB以下</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="w-1.5 h-1.5 bg-blue-600 rounded-full mt-2 flex-shrink-0"></span>
                  <span>背景: 透明または白背景を推奨</span>
                </li>
              </ul>
            </div>
          </CardContent>
        </Card>
        </div>
      </div>
    </div>
  );
}