// lib/tournament-json-archiver.ts
import { db } from '@/lib/db';
// import { Tournament } from '@/lib/types';
import { getTournamentById } from '@/lib/tournament-detail';
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

    // 1. 大会基本情報を取得
    const tournament = await getTournamentById(tournamentId);
    
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
        COALESCE(
          CASE 
            WHEN mf.team1_scores IS NOT NULL AND mf.team1_scores != '' 
            THEN (
              SELECT SUM(CAST(value AS INTEGER)) 
              FROM json_each(mf.team1_scores)
            )
            ELSE 0 
          END, 0
        ) as team1_goals,
        COALESCE(
          CASE 
            WHEN mf.team2_scores IS NOT NULL AND mf.team2_scores != '' 
            THEN (
              SELECT SUM(CAST(value AS INTEGER)) 
              FROM json_each(mf.team2_scores)
            )
            ELSE 0 
          END, 0
        ) as team2_goals,
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
        COALESCE(
          CASE 
            WHEN mf.team1_scores IS NOT NULL AND mf.team1_scores != '' 
            THEN (
              SELECT SUM(CAST(value AS INTEGER)) 
              FROM json_each(mf.team1_scores)
            )
            ELSE 0 
          END, 0
        ) as team1_goals,
        COALESCE(
          CASE 
            WHEN mf.team2_scores IS NOT NULL AND mf.team2_scores != '' 
            THEN (
              SELECT SUM(CAST(value AS INTEGER)) 
              FROM json_each(mf.team2_scores)
            )
            ELSE 0 
          END, 0
        ) as team2_goals,
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

    // 7. データをJSON形式で保存
    const tournamentData = JSON.stringify(tournament);
    const teamsData = JSON.stringify(teamsResult.rows);
    const matchesData = JSON.stringify(matchesResult.rows);
    const standingsData = JSON.stringify(standingsResult.rows);
    const resultsData = JSON.stringify(resultsResult.rows);
    const pdfInfoData = JSON.stringify({
      bracketPdfExists,
      resultsPdfExists
    });

    const currentTime = new Date().toISOString().replace('T', ' ').substring(0, 19);
    const currentVersion = ArchiveVersionManager.getCurrentVersion();
    const metadata = JSON.stringify({
      total_teams: teamsResult.rows.length,
      total_matches: matchesResult.rows.length,
      completed_matches: matchesResult.rows.filter(m => m.has_result === 1).length,
      blocks_count: new Set(standingsResult.rows.map(s => s.block_name)).size,
      archive_ui_version: currentVersion
    });

    // 8. データベースに保存
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

    // 9. アーカイブバージョン情報を記録
    await ArchiveVersionManager.recordArchiveVersion(tournamentId, archivedBy);

    // 10. 大会にアーカイブフラグを設定
    await db.execute(`
      UPDATE t_tournaments 
      SET is_archived = 1 
      WHERE tournament_id = ?
    `, [tournamentId]);

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
    const result = await db.execute(`
      SELECT * FROM t_archived_tournament_json 
      WHERE tournament_id = ?
    `, [tournamentId]);

    if (result.rows.length === 0) {
      return null;
    }

    // アクセス日時を更新
    await db.execute(`
      UPDATE t_archived_tournament_json 
      SET last_accessed = datetime('now', '+9 hours') 
      WHERE tournament_id = ?
    `, [tournamentId]);

    const archive = result.rows[0];
    return {
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
  } catch (error) {
    console.error('アーカイブデータ取得エラー:', error);
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