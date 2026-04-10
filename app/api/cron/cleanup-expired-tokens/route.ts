// app/api/cron/cleanup-expired-tokens/route.ts
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

/**
 * Vercel Cron: 期限切れトークン・招待の一括クリーンアップ
 *
 * 実行頻度: 毎日深夜3時 (JST) = 18:00 UTC
 * 対象:
 *   - t_match_result_tokens（大会日から30日以上経過）
 *   - t_password_reset_tokens（期限切れ or 使用済み7日以上）
 *   - t_email_verification_tokens（期限切れ or 使用済み7日以上）
 *   - t_team_invitations（期限切れpending→expired更新、30日以上前のexpired/cancelled削除）
 *   - t_operator_invitations（同上）
 */
export async function GET(request: NextRequest) {
  try {
    // Vercel Cronからのリクエストか確認
    const authHeader = request.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;

    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    console.log("🧹 [CRON] 期限切れトークン クリーンアップ開始");

    const results: Record<string, number> = {};

    // 1. t_match_result_tokens: 大会日が30日以上前の試合のトークンを削除
    const matchTokensResult = await db.execute(
      `DELETE FROM t_match_result_tokens
       WHERE match_id IN (
         SELECT ml.match_id
         FROM t_matches_live ml
         WHERE ml.tournament_date < date('now', '+9 hours', '-30 days')
       )`,
    );
    results.match_result_tokens = matchTokensResult.rowsAffected;
    console.log(`   t_match_result_tokens: ${matchTokensResult.rowsAffected}件削除`);

    // 2. t_password_reset_tokens: 期限切れ未使用 or 使用済み7日以上前
    const passwordTokensResult = await db.execute(
      `DELETE FROM t_password_reset_tokens
       WHERE (expires_at < datetime('now', '+9 hours') AND used_at IS NULL)
          OR (used_at IS NOT NULL AND used_at < datetime('now', '+9 hours', '-7 days'))`,
    );
    results.password_reset_tokens = passwordTokensResult.rowsAffected;
    console.log(`   t_password_reset_tokens: ${passwordTokensResult.rowsAffected}件削除`);

    // 3. t_email_verification_tokens: 期限切れ未使用 or 使用済み7日以上前
    const emailTokensResult = await db.execute(
      `DELETE FROM t_email_verification_tokens
       WHERE (expires_at < datetime('now', '+9 hours') AND used = 0)
          OR (used = 1 AND used_at < datetime('now', '+9 hours', '-7 days'))`,
    );
    results.email_verification_tokens = emailTokensResult.rowsAffected;
    console.log(`   t_email_verification_tokens: ${emailTokensResult.rowsAffected}件削除`);

    // 4. t_team_invitations: 期限切れpendingをexpiredに更新
    const teamInvitationsUpdated = await db.execute(
      `UPDATE t_team_invitations
       SET status = 'expired'
       WHERE status = 'pending' AND expires_at < datetime('now', '+9 hours')`,
    );
    results.team_invitations_expired = teamInvitationsUpdated.rowsAffected;
    console.log(`   t_team_invitations: ${teamInvitationsUpdated.rowsAffected}件をexpiredに更新`);

    // 4b. t_team_invitations: 30日以上前のexpired/cancelledを削除
    const teamInvitationsDeleted = await db.execute(
      `DELETE FROM t_team_invitations
       WHERE status IN ('expired', 'cancelled')
         AND created_at < datetime('now', '+9 hours', '-30 days')`,
    );
    results.team_invitations_deleted = teamInvitationsDeleted.rowsAffected;
    console.log(`   t_team_invitations: ${teamInvitationsDeleted.rowsAffected}件削除`);

    // 5. t_operator_invitations: 期限切れpendingをexpiredに更新
    const operatorInvitationsUpdated = await db.execute(
      `UPDATE t_operator_invitations
       SET status = 'expired'
       WHERE status = 'pending' AND expires_at < datetime('now', '+9 hours')`,
    );
    results.operator_invitations_expired = operatorInvitationsUpdated.rowsAffected;
    console.log(
      `   t_operator_invitations: ${operatorInvitationsUpdated.rowsAffected}件をexpiredに更新`,
    );

    // 5b. t_operator_invitations: 30日以上前のexpired/cancelledを削除
    const operatorInvitationsDeleted = await db.execute(
      `DELETE FROM t_operator_invitations
       WHERE status IN ('expired', 'cancelled')
         AND created_at < datetime('now', '+9 hours', '-30 days')`,
    );
    results.operator_invitations_deleted = operatorInvitationsDeleted.rowsAffected;
    console.log(`   t_operator_invitations: ${operatorInvitationsDeleted.rowsAffected}件削除`);

    console.log("✅ [CRON] 期限切れトークン クリーンアップ完了");

    return NextResponse.json({
      success: true,
      data: results,
      message: "期限切れトークンのクリーンアップが完了しました",
    });
  } catch (error) {
    console.error("❌ [CRON] トークンクリーンアップエラー:", error);
    return NextResponse.json(
      {
        success: false,
        error: "トークンクリーンアップに失敗しました",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
