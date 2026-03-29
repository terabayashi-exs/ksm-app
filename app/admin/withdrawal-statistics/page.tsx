// app/admin/withdrawal-statistics/page.tsx
// 辞退申請統計レポートページ

import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import WithdrawalStatistics from '@/components/features/admin/WithdrawalStatistics';

export const metadata = {
  title: '辞退申請統計 | 大会GO 管理',
  description: '辞退申請の統計情報とレポート'
};

export default async function WithdrawalStatisticsPage() {
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
              <h1 className="text-2xl font-bold text-white">辞退申請統計</h1>
              <p className="text-sm text-white/70 mt-1">大会辞退申請の詳細な統計情報と傾向分析</p>
            </div>
          </div>
        </div>
      </div>
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        <WithdrawalStatistics />

      {/* 統計情報の説明 */}
      <div className="mt-8 p-6 bg-primary/5 rounded-lg">
        <h2 className="text-lg font-semibold text-primary mb-3">📊 統計情報の説明</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm">
          <div>
            <h3 className="font-medium text-primary mb-2">指標の定義</h3>
            <ul className="space-y-1 text-primary">
              <li><strong>総申請数:</strong> 期間内の全辞退申請件数</li>
              <li><strong>承認率:</strong> 承認済み申請 ÷ 総申請数</li>
              <li><strong>辞退率:</strong> 大会の辞退申請数 ÷ 参加チーム数</li>
              <li><strong>処理時間:</strong> 申請から承認・却下までの日数</li>
            </ul>
          </div>
          <div>
            <h3 className="font-medium text-primary mb-2">活用方法</h3>
            <ul className="space-y-1 text-primary">
              <li><strong>傾向分析:</strong> 辞退理由の傾向を把握し対策を検討</li>
              <li><strong>運営改善:</strong> 処理時間を短縮するための改善点を特定</li>
              <li><strong>大会計画:</strong> 辞退率の高い大会の要因を分析</li>
              <li><strong>予防対策:</strong> 頻出する辞退理由への事前対策</li>
            </ul>
          </div>
        </div>
        </div>
      </div>
    </div>
  );
}