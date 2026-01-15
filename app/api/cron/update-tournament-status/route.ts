// app/api/cron/update-tournament-status/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { calculateTournamentStatusSync } from '@/lib/tournament-status';

/**
 * Vercel Cron: 大会ステータス自動更新
 *
 * 実行頻度: 毎日深夜2時 (JST)
 * 目的: 全大会のステータスを日付ベースで再計算・更新
 */
export async function GET(request: NextRequest) {
  try {
    // Vercel Cronからのリクエストか確認
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;

    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    console.log('🔄 [CRON] 大会ステータス自動更新開始');

    // 1. 全大会を取得（アーカイブ済みを除く）
    const result = await db.execute(`
      SELECT
        tournament_id,
        tournament_name,
        status,
        tournament_dates,
        recruitment_start_date,
        recruitment_end_date,
        public_start_date,
        is_archived
      FROM t_tournaments
      WHERE is_archived = 0
      ORDER BY tournament_id
    `);

    console.log(`📊 [CRON] ${result.rows.length}件の大会を処理中...`);

    let updated = 0;
    let unchanged = 0;
    const updates: Array<{ id: number; name: string; old: string; new: string }> = [];

    for (const row of result.rows) {
      const currentStatus = String(row.status);

      // 管理者が明示的に設定したステータスは保持
      if (currentStatus === 'ongoing' || currentStatus === 'completed') {
        unchanged++;
        continue;
      }

      // ステータスを再計算
      const newStatus = calculateTournamentStatusSync({
        status: currentStatus,
        tournament_dates: String(row.tournament_dates),
        recruitment_start_date: row.recruitment_start_date as string | null,
        recruitment_end_date: row.recruitment_end_date as string | null,
        public_start_date: row.public_start_date as string | null,
      });

      // ステータスが変更された場合のみ更新
      if (currentStatus !== newStatus) {
        await db.execute(`
          UPDATE t_tournaments
          SET status = ?, updated_at = datetime('now', '+9 hours')
          WHERE tournament_id = ?
        `, [newStatus, row.tournament_id]);

        updates.push({
          id: Number(row.tournament_id),
          name: String(row.tournament_name),
          old: currentStatus,
          new: newStatus,
        });

        updated++;
      } else {
        unchanged++;
      }
    }

    console.log(`✅ [CRON] 大会ステータス自動更新完了`);
    console.log(`   更新: ${updated}件, 変更なし: ${unchanged}件`);

    if (updates.length > 0) {
      console.log('📝 [CRON] 更新された大会:');
      updates.forEach(u => {
        console.log(`   ID:${u.id} ${u.name}: ${u.old} → ${u.new}`);
      });
    }

    return NextResponse.json({
      success: true,
      data: {
        total: result.rows.length,
        updated,
        unchanged,
        updates
      },
      message: `大会ステータスを自動更新しました（${updated}件更新）`
    });

  } catch (error) {
    console.error('❌ [CRON] 大会ステータス自動更新エラー:', error);
    return NextResponse.json(
      {
        success: false,
        error: '大会ステータスの自動更新に失敗しました',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
