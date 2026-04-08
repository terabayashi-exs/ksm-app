import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { deleteBlobsByUrls } from "@/lib/blob-helpers";
import { db } from "@/lib/db";
import { TournamentBlobArchiver } from "@/lib/tournament-blob-archiver";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth();

    if (!session || session.user.role !== "admin") {
      return NextResponse.json({ success: false, error: "管理者権限が必要です" }, { status: 401 });
    }

    const { id } = await params;
    const tournamentId = parseInt(id);

    if (isNaN(tournamentId)) {
      return NextResponse.json({ success: false, error: "無効な大会IDです" }, { status: 400 });
    }

    // 大会が存在するかチェック
    const tournamentCheck = await db.execute(
      "SELECT tournament_id, tournament_name, status FROM t_tournaments WHERE tournament_id = ?",
      [tournamentId],
    );

    if (tournamentCheck.rows.length === 0) {
      return NextResponse.json(
        { success: false, error: "指定された大会が見つかりません" },
        { status: 404 },
      );
    }

    const tournament = tournamentCheck.rows[0];

    // 開催中または完了済みの大会は削除不可
    if (tournament.status === "ongoing" || tournament.status === "completed") {
      return NextResponse.json(
        { success: false, error: "開催中または完了済みの大会は削除できません" },
        { status: 400 },
      );
    }

    // 関連データを順序立てて削除（外部キー制約に配慮）
    // エラーカウンター（部分的失敗の追跡用）
    const deletionErrors: string[] = [];

    try {
      console.log(`削除開始: 大会ID ${tournamentId}`);

      // 削除前にレコード数を確認（デバッグ用）
      const checkRecordCounts = async () => {
        const tables = [
          {
            name: "t_matches_final",
            query:
              "SELECT COUNT(*) as count FROM t_matches_final WHERE match_id IN (SELECT match_id FROM t_matches_live WHERE match_block_id IN (SELECT match_block_id FROM t_match_blocks WHERE tournament_id = ?))",
          },
          {
            name: "t_matches_live",
            query:
              "SELECT COUNT(*) as count FROM t_matches_live WHERE match_block_id IN (SELECT match_block_id FROM t_match_blocks WHERE tournament_id = ?)",
          },
          {
            name: "t_match_blocks",
            query: "SELECT COUNT(*) as count FROM t_match_blocks WHERE tournament_id = ?",
          },
          {
            name: "t_tournament_players",
            query: "SELECT COUNT(*) as count FROM t_tournament_players WHERE tournament_id = ?",
          },
          {
            name: "t_tournament_teams",
            query: "SELECT COUNT(*) as count FROM t_tournament_teams WHERE tournament_id = ?",
          },
          {
            name: "t_tournament_rules",
            query: "SELECT COUNT(*) as count FROM t_tournament_rules WHERE tournament_id = ?",
          },
          {
            name: "t_tournament_files",
            query: "SELECT COUNT(*) as count FROM t_tournament_files WHERE tournament_id = ?",
          },
          {
            name: "t_email_send_history",
            query: "SELECT COUNT(*) as count FROM t_email_send_history WHERE tournament_id = ?",
          },
          {
            name: "t_tournament_notifications",
            query:
              "SELECT COUNT(*) as count FROM t_tournament_notifications WHERE tournament_id = ?",
          },
          {
            name: "t_archived_tournament_json",
            query:
              "SELECT COUNT(*) as count FROM t_archived_tournament_json WHERE tournament_id = ?",
          },
        ];

        console.log("削除前レコード数:");
        for (const table of tables) {
          try {
            const result = await db.execute(table.query, [tournamentId]);
            const count = Number(result.rows[0]?.count) || 0;
            if (count > 0) {
              console.log(`  ${table.name}: ${count} レコード`);
            }
          } catch {
            // テーブルが存在しない場合はスキップ
          }
        }
      };

      await checkRecordCounts();

      // 1. スポンサーバナー画像削除（Blob Storage）
      // 注意: t_sponsor_bannersはON DELETE CASCADEで自動削除されるため、
      // その前にBlobから画像を削除する必要がある
      try {
        console.log("🗑️ スポンサーバナー画像を削除中...");
        const bannerResult = await db.execute(
          "SELECT image_blob_url FROM t_sponsor_banners WHERE tournament_id = ?",
          [tournamentId],
        );

        if (bannerResult.rows.length > 0) {
          const blobUrls = bannerResult.rows.map((row) => row.image_blob_url as string);
          console.log(`📊 削除対象のバナー画像: ${blobUrls.length}件`);

          const deletedCount = await deleteBlobsByUrls(blobUrls);
          console.log(`✅ スポンサーバナー画像削除完了: ${deletedCount}/${blobUrls.length}件`);
        } else {
          console.log("✓ スポンサーバナー画像: 削除対象なし");
        }
      } catch (err) {
        console.warn(
          "⚠️ スポンサーバナー画像削除でエラー:",
          err instanceof Error ? err.message : err,
        );
        // Blob削除エラーは警告に留め、処理は継続
      }

      // 2. 試合状態データ削除（t_match_statusが存在する場合）
      try {
        const result = await db.execute(
          "DELETE FROM t_match_status WHERE match_block_id IN (SELECT match_block_id FROM t_match_blocks WHERE tournament_id = ?)",
          [tournamentId],
        );
        console.log(`✓ 試合状態データ削除完了: ${result.rowsAffected} レコード`);
      } catch (err) {
        console.warn("試合状態データ削除をスキップ:", err instanceof Error ? err.message : err);
        deletionErrors.push(
          `t_match_status: ${err instanceof Error ? err.message : "不明なエラー"}`,
        );
      }

      // 2. 試合結果データ削除（t_matches_finalが存在する場合）
      try {
        const result = await db.execute(
          "DELETE FROM t_matches_final WHERE match_id IN (SELECT match_id FROM t_matches_live WHERE match_block_id IN (SELECT match_block_id FROM t_match_blocks WHERE tournament_id = ?))",
          [tournamentId],
        );
        console.log(`✓ 試合結果データ削除完了: ${result.rowsAffected} レコード`);
      } catch (err) {
        console.warn("試合結果データ削除をスキップ:", err instanceof Error ? err.message : err);
        deletionErrors.push(
          `t_matches_final: ${err instanceof Error ? err.message : "不明なエラー"}`,
        );
      }

      // 3. ライブ試合データ削除
      try {
        const result = await db.execute(
          "DELETE FROM t_matches_live WHERE match_block_id IN (SELECT match_block_id FROM t_match_blocks WHERE tournament_id = ?)",
          [tournamentId],
        );
        console.log(`✓ ライブ試合データ削除完了: ${result.rowsAffected} レコード`);
      } catch (err) {
        console.warn("ライブ試合データ削除をスキップ:", err instanceof Error ? err.message : err);
        deletionErrors.push(
          `t_matches_live: ${err instanceof Error ? err.message : "不明なエラー"}`,
        );
      }

      // 4. 試合ブロックデータ削除
      try {
        const result = await db.execute("DELETE FROM t_match_blocks WHERE tournament_id = ?", [
          tournamentId,
        ]);
        console.log(`✓ 試合ブロックデータ削除完了: ${result.rowsAffected} レコード`);
      } catch (err) {
        console.warn("試合ブロックデータ削除をスキップ:", err instanceof Error ? err.message : err);
        deletionErrors.push(
          `t_match_blocks: ${err instanceof Error ? err.message : "不明なエラー"}`,
        );
      }

      // 5. 大会参加選手データ削除（t_tournament_playersが存在する場合）
      try {
        const result = await db.execute(
          "DELETE FROM t_tournament_players WHERE tournament_id = ?",
          [tournamentId],
        );
        console.log(`✓ 大会参加選手データ削除完了: ${result.rowsAffected} レコード`);
      } catch (err) {
        console.warn("大会参加選手データ削除をスキップ:", err instanceof Error ? err.message : err);
        deletionErrors.push(
          `t_tournament_players: ${err instanceof Error ? err.message : "不明なエラー"}`,
        );
      }

      // 6. 大会参加チームデータ削除（t_tournament_teamsが存在する場合）
      try {
        const result = await db.execute("DELETE FROM t_tournament_teams WHERE tournament_id = ?", [
          tournamentId,
        ]);
        console.log(`✓ 大会参加チームデータ削除完了: ${result.rowsAffected} レコード`);
      } catch (err) {
        console.warn(
          "大会参加チームデータ削除をスキップ:",
          err instanceof Error ? err.message : err,
        );
        deletionErrors.push(
          `t_tournament_teams: ${err instanceof Error ? err.message : "不明なエラー"}`,
        );
      }

      // 7. 大会ルール削除（t_tournament_rulesが存在する場合）- 強化版
      try {
        // まず存在するレコード数を確認
        const countResult = await db.execute(
          "SELECT COUNT(*) as count FROM t_tournament_rules WHERE tournament_id = ?",
          [tournamentId],
        );
        const ruleCount = Number(countResult.rows[0]?.count) || 0;

        if (ruleCount > 0) {
          console.log(`削除対象のt_tournament_rulesレコード: ${ruleCount} 件`);
          // 強制削除実行
          const result = await db.execute(
            "DELETE FROM t_tournament_rules WHERE tournament_id = ?",
            [tournamentId],
          );
          console.log(`✅ 大会ルールデータ削除完了: ${result.rowsAffected} レコード`);
        } else {
          console.log("✓ 大会ルールデータ: 削除対象レコードなし");
        }
      } catch (err) {
        console.error("❌ 大会ルールデータ削除でエラー:", err instanceof Error ? err.message : err);
        deletionErrors.push(
          `t_tournament_rules: ${err instanceof Error ? err.message : "不明なエラー"}`,
        );

        // 再試行: 個別レコードを特定して削除
        try {
          console.log("🔄 t_tournament_rules の個別削除を試行中...");
          const ruleRecords = await db.execute(
            "SELECT tournament_rule_id FROM t_tournament_rules WHERE tournament_id = ?",
            [tournamentId],
          );

          for (const record of ruleRecords.rows) {
            try {
              await db.execute("DELETE FROM t_tournament_rules WHERE tournament_rule_id = ?", [
                record.tournament_rule_id,
              ]);
              console.log(`✓ ルールID ${record.tournament_rule_id} を個別削除`);
            } catch (individualErr) {
              console.error(`❌ ルールID ${record.tournament_rule_id} の削除失敗:`, individualErr);
            }
          }
        } catch (retryErr) {
          console.error("🚫 t_tournament_rules の再試行も失敗:", retryErr);
        }
      }

      // 8. 大会ファイル削除（t_tournament_filesが存在する場合）
      try {
        const result = await db.execute("DELETE FROM t_tournament_files WHERE tournament_id = ?", [
          tournamentId,
        ]);
        console.log(`✓ 大会ファイルデータ削除完了: ${result.rowsAffected} レコード`);
      } catch (err) {
        console.warn("大会ファイルデータ削除をスキップ:", err instanceof Error ? err.message : err);
        deletionErrors.push(
          `t_tournament_files: ${err instanceof Error ? err.message : "不明なエラー"}`,
        );
      }

      // 9. メール送信履歴削除（t_email_send_historyが存在する場合）
      try {
        const result = await db.execute(
          "DELETE FROM t_email_send_history WHERE tournament_id = ?",
          [tournamentId],
        );
        console.log(`✓ メール送信履歴データ削除完了: ${result.rowsAffected} レコード`);
      } catch (err) {
        console.warn(
          "メール送信履歴データ削除をスキップ:",
          err instanceof Error ? err.message : err,
        );
        deletionErrors.push(
          `t_email_send_history: ${err instanceof Error ? err.message : "不明なエラー"}`,
        );
      }

      // 10. 大会通知削除（t_tournament_notificationsが存在する場合）
      try {
        const result = await db.execute(
          "DELETE FROM t_tournament_notifications WHERE tournament_id = ?",
          [tournamentId],
        );
        console.log(`✓ 大会通知データ削除完了: ${result.rowsAffected} レコード`);
      } catch (err) {
        console.warn("大会通知データ削除をスキップ:", err instanceof Error ? err.message : err);
        deletionErrors.push(
          `t_tournament_notifications: ${err instanceof Error ? err.message : "不明なエラー"}`,
        );
      }

      // 11. アーカイブデータ削除（データベース）
      try {
        const result = await db.execute(
          "DELETE FROM t_archived_tournament_json WHERE tournament_id = ?",
          [tournamentId],
        );
        console.log(`✓ データベースアーカイブデータ削除完了: ${result.rowsAffected} レコード`);
      } catch (err) {
        console.warn(
          "データベースアーカイブデータ削除をスキップ:",
          err instanceof Error ? err.message : err,
        );
        deletionErrors.push(
          `t_archived_tournament_json: ${err instanceof Error ? err.message : "不明なエラー"}`,
        );
      }

      // 12. アーカイブデータ削除（Blob Storage）
      if (process.env.BLOB_READ_WRITE_TOKEN) {
        try {
          console.log(`🗑️ Blobアーカイブを削除中... (大会ID: ${tournamentId})`);
          const blobDeleteSuccess = await TournamentBlobArchiver.deleteArchive(tournamentId);
          if (blobDeleteSuccess) {
            console.log("✅ Blobアーカイブデータ削除完了");
          } else {
            console.warn("⚠️ Blobアーカイブが見つからないか削除に失敗");
          }
        } catch (blobError) {
          console.error("❌ Blobアーカイブ削除エラー:", blobError);
          // Blobエラーは警告に留め、大会削除処理は継続
        }
      } else {
        console.log("⏭️ Blobアーカイブ削除をスキップ: BLOB_READ_WRITE_TOKEN が設定されていません");
      }

      // 13. 最終確認: 全ての外部キー制約チェック
      try {
        console.log("🔍 最終外部キー制約チェックを実行中...");

        // 全ての関連テーブルの残存レコードをチェック
        const allConstraintChecks = [
          {
            name: "t_tournament_rules",
            query: "SELECT COUNT(*) as count FROM t_tournament_rules WHERE tournament_id = ?",
          },
          {
            name: "t_tournament_teams",
            query: "SELECT COUNT(*) as count FROM t_tournament_teams WHERE tournament_id = ?",
          },
          {
            name: "t_tournament_players",
            query: "SELECT COUNT(*) as count FROM t_tournament_players WHERE tournament_id = ?",
          },
          {
            name: "t_match_blocks",
            query: "SELECT COUNT(*) as count FROM t_match_blocks WHERE tournament_id = ?",
          },
          {
            name: "t_tournament_files",
            query: "SELECT COUNT(*) as count FROM t_tournament_files WHERE tournament_id = ?",
          },
          {
            name: "t_email_send_history",
            query: "SELECT COUNT(*) as count FROM t_email_send_history WHERE tournament_id = ?",
          },
          {
            name: "t_tournament_notifications",
            query:
              "SELECT COUNT(*) as count FROM t_tournament_notifications WHERE tournament_id = ?",
          },
          {
            name: "t_archived_tournament_json",
            query:
              "SELECT COUNT(*) as count FROM t_archived_tournament_json WHERE tournament_id = ?",
          },
        ];

        const remainingConstraints: string[] = [];

        for (const check of allConstraintChecks) {
          try {
            const result = await db.execute(check.query, [tournamentId]);
            const count = Number(result.rows[0]?.count) || 0;
            if (count > 0) {
              remainingConstraints.push(`${check.name}: ${count}件`);
              console.warn(`⚠️ 外部キー制約違反: ${check.name} に ${count} レコード残存`);

              // 残存レコードを強制削除
              try {
                const deleteQuery = `DELETE FROM ${check.name} WHERE tournament_id = ?`;
                const deleteResult = await db.execute(deleteQuery, [tournamentId]);
                console.log(
                  `🗑️ 強制削除: ${check.name} の ${deleteResult.rowsAffected} レコードを削除`,
                );
              } catch (forceDeleteError) {
                console.error(`❌ ${check.name} の強制削除失敗:`, forceDeleteError);
                deletionErrors.push(
                  `${check.name} 強制削除失敗: ${forceDeleteError instanceof Error ? forceDeleteError.message : "不明なエラー"}`,
                );
              }
            }
          } catch {
            // テーブルが存在しない場合はスキップ
          }
        }

        if (remainingConstraints.length > 0) {
          console.warn(`⚠️ 外部キー制約が残存していました: ${remainingConstraints.join(", ")}`);
        } else {
          console.log("✅ 全ての外部キー制約チェック完了 - 削除可能");
        }
      } catch (constraintError) {
        console.error("❌ 外部キー制約チェックでエラー:", constraintError);
        deletionErrors.push(
          `外部キー制約チェック失敗: ${constraintError instanceof Error ? constraintError.message : "不明なエラー"}`,
        );
      }

      // 14. 大会データ削除（メインテーブル）- 最終削除
      try {
        const result = await db.execute("DELETE FROM t_tournaments WHERE tournament_id = ?", [
          tournamentId,
        ]);
        console.log(`✅ 大会データ削除完了: ${result.rowsAffected} レコード`);

        if (deletionErrors.length > 0) {
          console.warn("⚠️ 一部のデータ削除で問題が発生しましたが、メイン削除は成功:");
          deletionErrors.forEach((error) => console.warn(`  - ${error}`));
        }

        console.log(`🗑️ 大会削除完了: ${tournament.tournament_name} (ID: ${tournamentId})`);

        return NextResponse.json({
          success: true,
          message: `大会「${tournament.tournament_name}」を削除しました`,
          warnings: deletionErrors.length > 0 ? deletionErrors : undefined,
        });
      } catch (mainDeleteError) {
        console.error("❌ 大会メインレコードの削除に失敗しました", mainDeleteError);

        // メインテーブル削除失敗時の詳細エラー情報
        const errorMessage =
          mainDeleteError instanceof Error ? mainDeleteError.message : "不明なエラー";

        // 外部キー制約エラーの場合は、残存レコードの詳細を調査
        if (errorMessage.includes("FOREIGN KEY constraint failed")) {
          console.log("🔍 外部キー制約エラーの原因を調査中...");

          try {
            // 残存する可能性のあるレコードをチェック
            const remainingChecks = [
              {
                name: "t_tournament_rules",
                query: "SELECT tournament_rule_id FROM t_tournament_rules WHERE tournament_id = ?",
              },
              {
                name: "t_tournament_teams",
                query: "SELECT team_id FROM t_tournament_teams WHERE tournament_id = ?",
              },
              {
                name: "t_tournament_players",
                query: "SELECT player_id FROM t_tournament_players WHERE tournament_id = ?",
              },
              {
                name: "t_match_blocks",
                query: "SELECT match_block_id FROM t_match_blocks WHERE tournament_id = ?",
              },
            ];

            for (const check of remainingChecks) {
              try {
                const result = await db.execute(check.query, [tournamentId]);
                if (result.rows.length > 0) {
                  console.error(
                    `🚫 外部キー制約の原因: ${check.name} に ${result.rows.length} レコードが残存`,
                  );
                  console.error(
                    `   残存レコードID: ${result.rows.map((r: { [key: string]: unknown }) => Object.values(r)[0]).join(", ")}`,
                  );
                }
              } catch {
                // テーブルが存在しない場合はスキップ
              }
            }
          } catch (investigateErr) {
            console.error("調査中にエラー:", investigateErr);
          }
        }

        return NextResponse.json(
          {
            success: false,
            error: `大会メインレコードの削除に失敗しました`,
            details: errorMessage,
            partialDeletion:
              deletionErrors.length > 0 ? "一部の関連データは削除されました" : undefined,
          },
          { status: 500 },
        );
      }
    } catch (deleteError) {
      console.error("大会削除API エラー:", deleteError);
      return NextResponse.json(
        {
          success: false,
          error: `大会削除中にエラーが発生しました: ${deleteError instanceof Error ? deleteError.message : "不明なエラー"}`,
        },
        { status: 500 },
      );
    }
  } catch (error) {
    console.error("大会削除API エラー:", error);
    return NextResponse.json(
      { success: false, error: "サーバーエラーが発生しました" },
      { status: 500 },
    );
  }
}
