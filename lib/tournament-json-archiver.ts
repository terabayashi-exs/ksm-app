// lib/tournament-json-archiver.ts
import { db } from '@/lib/db';
// import { Tournament } from '@/lib/types';
import { getRawTournamentById } from '@/lib/tournament-detail';
import { ArchiveVersionManager } from '@/lib/archive-version-manager';

/**
 * アーカイブ結果の型定義
 */
interface ArchiveResult {
  success: boolean;
  error?: string;
  data?: {
    tournament_id: number;
    tournament_name: string;
    file_size: number;
    archived_at: string;
  };
}

/**
 * 大会の全データをJSON形式で収集・保存
 */
export async function archiveTournamentAsJson(
  tournamentId: number, 
  archivedBy: string
): Promise<ArchiveResult> {
  try {
    console.log(`🎯 大会ID ${tournamentId} のJSONアーカイブを開始...`);

    // 1. 大会基本情報を取得（アーカイブフラグに関係なく生データを取得）
    const tournament = await getRawTournamentById(tournamentId);
    
    if (!tournament) {
      return {
        success: false,
        error: '大会情報が見つかりません'
      };
    }

    // 2. 参加チーム情報を取得
    const teamsResult = await db.execute(`
      SELECT 
        tt.team_id,
        tt.team_name,
        tt.team_omission,
        tt.assigned_block,
        tt.block_position,
        tt.withdrawal_status,
        (SELECT COUNT(*) FROM t_tournament_players tp 
         WHERE tp.team_id = tt.team_id AND tp.tournament_id = tt.tournament_id) as player_count,
        t.contact_person,
        t.contact_email
      FROM t_tournament_teams tt
      LEFT JOIN m_teams t ON tt.team_id = t.team_id
      WHERE tt.tournament_id = ?
      ORDER BY tt.assigned_block, tt.block_position
    `, [tournamentId]);

    // 3. 試合データを取得（ライブ + 確定結果）
    const matchesResult = await db.execute(`
      SELECT 
        ml.match_id,
        ml.match_block_id,
        ml.tournament_date,
        ml.match_number,
        ml.match_code,
        ml.team1_id,
        ml.team2_id,
        ml.team1_display_name,
        ml.team2_display_name,
        ml.court_number,
        ml.start_time,
        mb.phase,
        mb.display_round_name,
        mb.block_name,
        mb.match_type,
        mb.block_order,
        mf.team1_scores,
        mf.team2_scores,
        mf.winner_team_id,
        COALESCE(mf.is_draw, 0) as is_draw,
        COALESCE(mf.is_walkover, 0) as is_walkover,
        ml.match_status,
        ml.result_status,
        ml.remarks,
        CASE WHEN mf.match_id IS NOT NULL THEN 1 ELSE 0 END as has_result
      FROM t_matches_live ml
      LEFT JOIN t_matches_final mf ON ml.match_id = mf.match_id
      LEFT JOIN t_match_blocks mb ON ml.match_block_id = mb.match_block_id
      WHERE mb.tournament_id = ?
      ORDER BY ml.tournament_date, ml.match_number
    `, [tournamentId]);

    // 4. 順位表データを取得
    const standingsResult = await db.execute(`
      SELECT 
        mb.block_name,
        mb.phase,
        mb.team_rankings,
        mb.remarks
      FROM t_match_blocks mb
      WHERE mb.tournament_id = ?
      ORDER BY 
        CASE mb.phase 
          WHEN 'preliminary' THEN 1
          WHEN 'final' THEN 2 
        END,
        mb.block_name
    `, [tournamentId]);

    // 5. 戦績表用の結果データを取得
    const resultsResult = await db.execute(`
      SELECT 
        ml.match_code,
        ml.team1_id,
        ml.team2_id,
        COALESCE(t1.team_name, ml.team1_display_name) as team1_name,
        COALESCE(t2.team_name, ml.team2_display_name) as team2_name,
        mf.team1_scores,
        mf.team2_scores,
        mf.winner_team_id,
        mf.is_draw,
        mf.is_walkover,
        mb.block_name
      FROM t_matches_live ml
      LEFT JOIN t_matches_final mf ON ml.match_id = mf.match_id
      LEFT JOIN m_teams t1 ON ml.team1_id = t1.team_id
      LEFT JOIN m_teams t2 ON ml.team2_id = t2.team_id
      LEFT JOIN t_match_blocks mb ON ml.match_block_id = mb.match_block_id
      WHERE mb.tournament_id = ? AND mf.match_id IS NOT NULL
      ORDER BY ml.match_code
    `, [tournamentId]);

    // 6. PDF情報を取得
    const { checkTournamentBracketPdfExists, checkTournamentResultsPdfExists } = await import('@/lib/pdf-utils');
    const bracketPdfExists = await checkTournamentBracketPdfExists(tournamentId);
    const resultsPdfExists = await checkTournamentResultsPdfExists(tournamentId);

    // 7. スコアの計算処理を追加
    const processedMatches = matchesResult.rows.map(match => {
      const calculateGoals = (scores: string | null): number => {
        if (!scores) return 0;
        return scores.split(',').reduce((sum, score) => sum + (parseInt(score) || 0), 0);
      };

      return {
        ...match,
        team1_goals: calculateGoals(match.team1_scores as string | null),
        team2_goals: calculateGoals(match.team2_scores as string | null),
        has_result: true  // t_matches_finalから取得したデータはすべて確定済み
      };
    });

    // 8. データをJSON形式で保存
    const tournamentData = JSON.stringify(tournament);
    const teamsData = JSON.stringify(teamsResult.rows);
    const matchesData = JSON.stringify(processedMatches);
    const standingsData = JSON.stringify(standingsResult.rows);
    const resultsData = JSON.stringify(resultsResult.rows);
    const pdfInfoData = JSON.stringify({
      bracketPdfExists,
      resultsPdfExists
    });

    const currentTime = new Date().toISOString().replace('T', ' ').substring(0, 19);
    const currentVersion = ArchiveVersionManager.getCurrentVersion();
    // 大会ルール情報を取得（テーブル存在チェック込み）
    let rules = {
      supports_pk: false,
      period_count: 2,
      has_extra_time: false
    };

    try {
      const tournamentRules = await db.execute(`
        SELECT 
          use_penalty,
          use_extra_time,
          active_periods
        FROM t_tournament_rules 
        WHERE tournament_id = ? 
        ORDER BY phase
        LIMIT 1
      `, [tournamentId]);

      if (tournamentRules.rows && tournamentRules.rows.length > 0) {
        const rule = tournamentRules.rows[0];
        
        // active_periodsからピリオド数を計算
        let periodCount = 2; // デフォルト
        try {
          const periods = JSON.parse(rule.active_periods as string);
          periodCount = Array.isArray(periods) ? periods.filter(p => p !== '5').length : 2; // '5'はPK戦なので除外
        } catch (parseError) {
          console.warn('active_periods解析エラー:', parseError);
        }

        rules = {
          supports_pk: Boolean(rule.use_penalty),
          period_count: periodCount,
          has_extra_time: Boolean(rule.use_extra_time)
        };
        
        console.log(`✅ 大会ルール取得成功: supports_pk=${rules.supports_pk}, has_extra_time=${rules.has_extra_time}, period_count=${rules.period_count}`);
      }
    } catch (error) {
      console.warn(`Warning: Could not fetch tournament rules for tournament ${tournamentId}:`, error);
      // デフォルト値を使用（すでに設定済み）
    }

    // 実際の試合データから推測してルール情報を補完
    if (matchesResult.rows.length > 0) {
      const sampleMatch = matchesResult.rows.find(m => 
        m.team1_scores && 
        typeof m.team1_scores === 'string' && 
        m.team1_scores.includes(',')
      );
      if (sampleMatch && typeof sampleMatch.team1_scores === 'string') {
        const scoreArray = sampleMatch.team1_scores.split(',');
        if (scoreArray.length >= 5) {
          rules.has_extra_time = true;
          rules.period_count = 4; // 前半・後半・延長前半・延長後半
          rules.supports_pk = true;
        } else if (scoreArray.length >= 3) {
          rules.has_extra_time = false;
          rules.period_count = 2; // 前半・後半のみ
          rules.supports_pk = true;
        }
      }
    }

    const metadata = JSON.stringify({
      total_teams: teamsResult.rows.length,
      total_matches: processedMatches.length,
      completed_matches: matchesResult.rows.filter(m => m.has_result === 1).length,
      blocks_count: new Set(standingsResult.rows.map(s => s.block_name)).size,
      archive_ui_version: currentVersion,
      // 大会ルール情報を追加
      tournament_rules: {
        has_extra_time: Boolean(rules.has_extra_time),
        period_count: Number(rules.period_count || 2),
        supports_pk: Boolean(rules.supports_pk),
        score_format: rules.has_extra_time ? "regular_extra_pk" : "regular_pk"
      }
    });

    // 9. データベースに保存
    try {
      await db.execute(`
        INSERT OR REPLACE INTO t_archived_tournament_json (
          tournament_id,
          tournament_name,
          tournament_data,
          teams_data,
          matches_data,
          standings_data,
          results_data,
          pdf_info_data,
          archive_version,
          archived_at,
          archived_by,
          metadata
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', '+9 hours'), ?, ?)
      `, [
        tournamentId,
        tournament.tournament_name,
        tournamentData,
        teamsData,
        matchesData,
        standingsData,
        resultsData,
        pdfInfoData,
        currentVersion,
        archivedBy,
        metadata
      ]);
      
      console.log(`✅ アーカイブデータベース保存完了: tournament_id=${tournamentId}`);
    } catch (dbError) {
      console.error('🔥 アーカイブデータベース保存エラー:', dbError);
      
      // データベース保存に失敗した場合、アーカイブフラグもfalseに戻す
      try {
        await db.execute(`
          UPDATE t_tournaments 
          SET is_archived = 0 
          WHERE tournament_id = ?
        `, [tournamentId]);
        console.log(`🔄 アーカイブフラグをリセットしました: tournament_id=${tournamentId}`);
      } catch (rollbackError) {
        console.error('🔥 アーカイブフラグリセット失敗:', rollbackError);
      }
      
      throw new Error(`アーカイブの保存に失敗しました: ${dbError instanceof Error ? dbError.message : String(dbError)}`);
    }

    // 10. アーカイブバージョン情報を記録
    try {
      await ArchiveVersionManager.recordArchiveVersion(tournamentId, archivedBy);
    } catch (versionError) {
      console.error('🔥 アーカイブバージョン記録エラー:', versionError);
      // バージョン記録エラーは致命的ではないので処理継続
    }

    // 11. 大会にアーカイブフラグを設定（データ保存成功後）
    try {
      await db.execute(`
        UPDATE t_tournaments 
        SET is_archived = 1, archived_at = datetime('now', '+9 hours'), archived_by = ?
        WHERE tournament_id = ?
      `, [archivedBy, tournamentId]);
      
      console.log(`✅ アーカイブフラグ設定完了: tournament_id=${tournamentId}`);
    } catch (flagError) {
      console.error('🔥 アーカイブフラグ設定エラー:', flagError);
      throw new Error(`アーカイブフラグの設定に失敗しました: ${flagError instanceof Error ? flagError.message : String(flagError)}`);
    }

    const totalSize = Buffer.byteLength(
      tournamentData + teamsData + matchesData + standingsData + resultsData + pdfInfoData,
      'utf8'
    );

    console.log(`✅ JSONアーカイブ完了: ${tournament.tournament_name}`);
    console.log(`   データサイズ: ${(totalSize / 1024).toFixed(2)} KB`);

    return {
      success: true,
      data: {
        tournament_id: tournamentId,
        tournament_name: tournament.tournament_name,
        file_size: totalSize,
        archived_at: currentTime
      }
    };

  } catch (error) {
    console.error(`🔥 JSONアーカイブエラー (大会ID: ${tournamentId}):`, error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'アーカイブ処理中にエラーが発生しました'
    };
  }
}

/**
 * アーカイブデータを取得
 */
export async function getArchivedTournamentJson(tournamentId: number) {
  try {
    console.log(`🗃️ getArchivedTournamentJson開始: tournament_id=${tournamentId}`);
    
    const result = await db.execute(`
      SELECT * FROM t_archived_tournament_json 
      WHERE tournament_id = ?
    `, [tournamentId]);

    console.log(`🗃️ SQLクエリ結果: ${result.rows.length} 件`);

    if (result.rows.length === 0) {
      console.warn(`🗃️ アーカイブなし: tournament_id=${tournamentId}`);
      return null;
    }

    // アクセス日時を更新
    await db.execute(`
      UPDATE t_archived_tournament_json 
      SET last_accessed = datetime('now', '+9 hours') 
      WHERE tournament_id = ?
    `, [tournamentId]);

    const archive = result.rows[0];
    console.log(`🗃️ アーカイブデータ構築: ${archive.tournament_name}`);
    
    const returnData = {
      tournament_id: archive.tournament_id,
      tournament_name: archive.tournament_name,
      tournament: JSON.parse(archive.tournament_data as string),
      teams: JSON.parse(archive.teams_data as string),
      matches: JSON.parse(archive.matches_data as string),
      standings: JSON.parse(archive.standings_data as string),
      results: JSON.parse(archive.results_data as string),
      pdfInfo: JSON.parse(archive.pdf_info_data as string),
      archived_at: archive.archived_at,
      archived_by: archive.archived_by,
      metadata: archive.metadata ? JSON.parse(archive.metadata as string) : null
    };
    
    console.log(`🗃️ 正常に返却: tournament_id=${returnData.tournament_id}`);
    return returnData;
  } catch (error) {
    console.error('🗃️ アーカイブデータ取得エラー:', error);
    return null;
  }
}

/**
 * アーカイブ一覧を取得
 */
export async function getArchivedTournamentsList() {
  try {
    const result = await db.execute(`
      SELECT 
        tournament_id,
        tournament_name,
        archived_at,
        archived_by,
        metadata
      FROM t_archived_tournament_json
      ORDER BY archived_at DESC
    `);

    return result.rows.map(row => ({
      tournament_id: row.tournament_id,
      tournament_name: row.tournament_name,
      archived_at: row.archived_at,
      archived_by: row.archived_by,
      metadata: row.metadata ? JSON.parse(row.metadata as string) : null
    }));
  } catch (error) {
    console.error('アーカイブ一覧取得エラー:', error);
    return [];
  }
}