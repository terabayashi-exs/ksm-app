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

    // 2. 大会フォーマット詳細情報を取得（現在のスキーマに対応）
    let formatDetails = null;
    try {
      const formatResult = await db.execute(`
        SELECT
          t.format_id,
          t.format_name,
          f.target_team_count,
          f.format_description,
          f.created_at as format_created_at
        FROM t_tournaments t
        LEFT JOIN m_tournament_formats f ON t.format_id = f.format_id
        WHERE t.tournament_id = ?
      `, [tournamentId]);

      if (formatResult.rows && formatResult.rows.length > 0) {
        const format = formatResult.rows[0];

        // 試合データから試合構造情報を取得（m_match_templates の代替）
        // t_matches_live には phase, round_name, block_name, match_type,
        // execution_priority, team1_source, team2_source が直接格納されている
        const matchStructureResult = await db.execute(`
          SELECT DISTINCT
            ml.match_code,
            mb.phase,
            ml.round_name,
            ml.block_name,
            ml.match_type,
            ml.execution_priority,
            ml.team1_source,
            ml.team2_source
          FROM t_matches_live ml
          JOIN t_match_blocks mb ON ml.match_block_id = mb.match_block_id
          WHERE mb.tournament_id = ?
          ORDER BY ml.execution_priority, ml.match_code
        `, [tournamentId]);

        // 実際のブロック情報から予選・決勝情報を推測
        const blocksInfo = await db.execute(`
          SELECT DISTINCT phase, COUNT(*) as block_count
          FROM t_match_blocks
          WHERE tournament_id = ?
          GROUP BY phase
        `, [tournamentId]);

        const preliminaryBlocks = Number(blocksInfo.rows.find(b => b.phase === 'preliminary')?.block_count) || 0;
        const finalBlocks = Number(blocksInfo.rows.find(b => b.phase === 'final')?.block_count) || 0;

        formatDetails = {
          format_info: {
            format_id: format.format_id,
            format_name: format.format_name,
            target_team_count: format.target_team_count,
            format_description: format.format_description,
            // 推測された情報
            preliminary_format: preliminaryBlocks > 0 ? 'league' : 'none',
            final_format: finalBlocks > 0 ? 'tournament' : 'none',
            preliminary_advance_count: 2, // デフォルト値
            has_third_place_match: matchStructureResult.rows.some(t => t.match_code === 'T7'),
            format_created_at: format.format_created_at
          },
          match_templates: matchStructureResult.rows.map(match => ({
            match_code: match.match_code,
            phase: match.phase,
            round_name: match.round_name,
            block_name: match.block_name,
            match_type: match.match_type,
            execution_priority: match.execution_priority,
            team1_source: match.team1_source,
            team2_source: match.team2_source
          }))
        };

        console.log(`✅ 大会フォーマット詳細取得成功: ${format.format_name} (試合構造数: ${matchStructureResult.rows.length})`);
      }
    } catch (error) {
      console.warn(`Warning: Could not fetch tournament format details for tournament ${tournamentId}:`, error);
      formatDetails = {
        format_info: {
          format_name: 'Unknown Format',
          target_team_count: 0,
          format_description: 'フォーマット情報が取得できませんでした'
        },
        match_templates: []
      };
    }

    // 3. 参加チーム情報を取得
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
        COALESCE(tt1.team_name, ml.team1_display_name) as team1_name,
        COALESCE(tt2.team_name, ml.team2_display_name) as team2_name,
        mf.team1_scores,
        mf.team2_scores,
        mf.is_draw,
        mf.is_walkover,
        mb.block_name
      FROM t_matches_live ml
      LEFT JOIN t_matches_final mf ON ml.match_id = mf.match_id
      LEFT JOIN t_tournament_teams tt1 ON ml.team1_tournament_team_id = tt1.tournament_team_id
      LEFT JOIN t_tournament_teams tt2 ON ml.team2_tournament_team_id = tt2.tournament_team_id
      LEFT JOIN t_match_blocks mb ON ml.match_block_id = mb.match_block_id
      WHERE mb.tournament_id = ? AND mf.match_id IS NOT NULL
      ORDER BY ml.match_code
    `, [tournamentId]);

    // 6. PDF情報を取得
    const { checkTournamentBracketPdfExists, checkTournamentResultsPdfExists } = await import('@/lib/pdf-utils');
    const bracketPdfExists = await checkTournamentBracketPdfExists(tournamentId);
    const resultsPdfExists = await checkTournamentResultsPdfExists(tournamentId);

    // 7. スコアの計算処理を追加（現在のスキーマに対応）
    const processedMatches = matchesResult.rows.map(match => {
      // 実際のスキーマに合わせてteam1_scores/team2_scoresを使用
      const team1Scores = match.team1_scores as number || 0;
      const team2Scores = match.team2_scores as number || 0;

      return {
        ...match,
        team1_goals: team1Scores, // 表示用にgoalsプロパティも設定
        team2_goals: team2Scores,
        has_result: Boolean(match.has_result)
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
    // 詳細な競技設定情報を取得（テーブル存在チェック込み）
    let sportSettings = {
      supports_pk: false,
      period_count: 2,
      has_extra_time: false,
      sport_code: 'soccer', // デフォルト値
      tie_breaking_rules: [] as string[],
      score_format_rules: {},
      competition_format: 'knockout_preliminary'
    };

    // デフォルトのサッカー競技設定を適用（DB依存処理を回避）
    try {
      // 基本的なサッカー競技設定を適用
      sportSettings = {
        supports_pk: true, // サッカーではPK戦をサポート
        period_count: 2, // 前半・後半
        has_extra_time: false, // 基本は延長戦なし
        sport_code: 'soccer', // デフォルトはサッカー
        tie_breaking_rules: ['points', 'goal_difference', 'goals_for'],
        score_format_rules: {
          regular_time: true,
          extra_time: false,
          penalty_shootout: true,
          periods_structure: [1, 2]
        },
        competition_format: 'standard_tournament'
      };
      
      console.log(`✅ デフォルトサッカー競技設定を適用: tournament_id=${tournamentId}`);
    } catch (error) {
      console.warn(`Warning: Could not set sport settings for tournament ${tournamentId}:`, error);
      // デフォルト値を使用（すでに設定済み）
    }

    // 実際の試合データから競技設定を推測・補完（現在のスキーマに対応）
    if (matchesResult.rows.length > 0) {
      // 現在のスキーマでは単純な数値形式なので、デフォルト値を維持
      const hasConfirmedMatches = matchesResult.rows.some(m => m.has_result);
      if (hasConfirmedMatches) {
        // 確定済み試合があれば基本的なサッカー設定を適用
        sportSettings.supports_pk = true;
        sportSettings.period_count = 2;
        sportSettings.has_extra_time = false;
        sportSettings.score_format_rules = {
          regular_time: true,
          extra_time: false,
          penalty_shootout: true,
          periods_structure: [1, 2]
        };
        
        console.log(`📊 試合データから競技設定を補完: サッカー基本設定適用 (確定試合数: ${matchesResult.rows.filter(m => m.has_result).length})`);
      }
    }

    // ブロック構成詳細情報を取得
    let blockStructure = null;
    try {
      // ブロック情報を詳細に取得
      const blocksResult = await db.execute(`
        SELECT DISTINCT
          mb.match_block_id,
          mb.phase,
          mb.block_name,
          mb.display_round_name,
          mb.block_order,
          mb.match_type,
          COUNT(DISTINCT tt.team_id) as teams_in_block,
          COUNT(DISTINCT ml.match_id) as matches_in_block
        FROM t_match_blocks mb
        LEFT JOIN t_tournament_teams tt ON tt.assigned_block = mb.block_name AND tt.tournament_id = mb.tournament_id
        LEFT JOIN t_matches_live ml ON ml.match_block_id = mb.match_block_id
        WHERE mb.tournament_id = ?
        GROUP BY mb.match_block_id, mb.phase, mb.block_name, mb.display_round_name, mb.block_order, mb.match_type
        ORDER BY mb.phase, mb.block_order
      `, [tournamentId]);

      // ブロック別チーム配置詳細を取得
      const blockTeamsResult = await db.execute(`
        SELECT 
          tt.assigned_block,
          tt.block_position,
          tt.team_id,
          tt.team_name,
          tt.team_omission,
          COUNT(tp.player_id) as player_count
        FROM t_tournament_teams tt
        LEFT JOIN t_tournament_players tp ON tp.team_id = tt.team_id AND tp.tournament_id = tt.tournament_id
        WHERE tt.tournament_id = ? AND tt.assigned_block IS NOT NULL
        GROUP BY tt.assigned_block, tt.block_position, tt.team_id, tt.team_name, tt.team_omission
        ORDER BY tt.assigned_block, tt.block_position
      `, [tournamentId]);

      blockStructure = {
        blocks_info: blocksResult.rows.map(block => ({
          match_block_id: block.match_block_id,
          phase: block.phase,
          block_name: block.block_name,
          display_round_name: block.display_round_name,
          block_order: block.block_order,
          match_type: block.match_type,
          teams_count: block.teams_in_block,
          matches_count: block.matches_in_block
        })),
        block_assignments: blockTeamsResult.rows.reduce((acc, team) => {
          const blockName = String(team.assigned_block);
          if (!acc[blockName]) {
            acc[blockName] = [];
          }
          acc[blockName].push({
            team_id: team.team_id,
            team_name: team.team_name,
            team_omission: team.team_omission,
            block_position: team.block_position,
            player_count: team.player_count
          });
          return acc;
        }, {} as Record<string, unknown[]>),
        preliminary_blocks: blocksResult.rows.filter(b => b.phase === 'preliminary').map(b => b.block_name),
        final_blocks: blocksResult.rows.filter(b => b.phase === 'final').map(b => b.block_name),
        total_blocks_count: blocksResult.rows.length,
        preliminary_blocks_count: blocksResult.rows.filter(b => b.phase === 'preliminary').length,
        final_blocks_count: blocksResult.rows.filter(b => b.phase === 'final').length
      };

      console.log(`✅ ブロック構成情報取得成功: ${blockStructure.total_blocks_count}ブロック (予選:${blockStructure.preliminary_blocks_count}, 決勝:${blockStructure.final_blocks_count})`);
    } catch (error) {
      console.warn(`Warning: Could not fetch block structure for tournament ${tournamentId}:`, error);
      blockStructure = {
        blocks_info: [],
        block_assignments: {},
        preliminary_blocks: [],
        final_blocks: [],
        total_blocks_count: 0,
        preliminary_blocks_count: 0,
        final_blocks_count: 0
      };
    }

    // その他の拡張メタデータを収集
    let extendedMetadata = null;
    try {
      // 会場情報を取得
      const venueResult = await db.execute(`
        SELECT 
          v.venue_id,
          v.venue_name,
          v.address,
          v.available_courts
        FROM m_venues v
        JOIN t_tournaments t ON t.venue_id = v.venue_id
        WHERE t.tournament_id = ?
      `, [tournamentId]);

      // UI表示に影響する設定情報を収集
      const displaySettings = {
        team_display_preference: 'omission_priority', // 略称優先
        score_display_format: 'goals_with_pk_separate', // ゴール数+PK別表示
        bracket_layout_style: 'vertical_flow', // 縦流しレイアウト
        standings_sort_criteria: sportSettings.tie_breaking_rules || ['points', 'goal_difference', 'goals_for'],
        color_scheme: {
          preliminary_blocks: ['blue', 'green', 'yellow', 'purple'], // A,B,C,Dブロックの色分け
          final_tournament: 'red',
          completed_match: 'white',
          ongoing_match: 'green',
          scheduled_match: 'gray'
        }
      };

      // 時点情報を記録（将来の変更検出用）
      const snapshotInfo = {
        archived_timestamp: new Date().toISOString(),
        system_version: '2.0', // アーカイブシステムのバージョン
        data_structure_version: '1.0', // データ構造のバージョン
        ui_compatibility_version: currentVersion, // UI互換性バージョン
        database_schema_checksum: `tournament_${tournamentId}_${new Date().getTime()}`,
        total_data_size: 0 // 後で計算
      };

      extendedMetadata = {
        venue_info: venueResult.rows.length > 0 ? {
          venue_id: venueResult.rows[0].venue_id,
          venue_name: venueResult.rows[0].venue_name,
          address: venueResult.rows[0].address,
          available_courts: venueResult.rows[0].available_courts
        } : null,
        display_settings: displaySettings,
        snapshot_info: snapshotInfo,
        archive_completeness_check: {
          has_tournament_data: !!tournament,
          has_teams_data: teamsResult.rows.length > 0,
          has_matches_data: matchesResult.rows.length > 0,
          has_standings_data: standingsResult.rows.length > 0,
          has_sport_settings: !!sportSettings,
          has_format_details: !!formatDetails,
          has_block_structure: !!blockStructure
        }
      };

      console.log(`✅ 拡張メタデータ収集完了: 会場情報=${extendedMetadata.venue_info ? 'あり' : 'なし'}`);
    } catch (error) {
      console.warn(`Warning: Could not collect extended metadata for tournament ${tournamentId}:`, error);
      extendedMetadata = {
        venue_info: null,
        display_settings: {},
        snapshot_info: {
          archived_timestamp: new Date().toISOString(),
          system_version: '2.0',
          data_structure_version: '1.0',
          ui_compatibility_version: currentVersion
        },
        archive_completeness_check: {}
      };
    }

    const metadata = JSON.stringify({
      total_teams: teamsResult.rows.length,
      total_matches: processedMatches.length,
      completed_matches: matchesResult.rows.filter(m => m.has_result === 1).length,
      blocks_count: new Set(standingsResult.rows.map(s => s.block_name)).size,
      archive_ui_version: currentVersion,
      // 拡張された競技設定情報
      sport_settings: {
        sport_code: sportSettings.sport_code,
        supports_pk: Boolean(sportSettings.supports_pk),
        has_extra_time: Boolean(sportSettings.has_extra_time),
        period_count: Number(sportSettings.period_count || 2),
        tie_breaking_rules: sportSettings.tie_breaking_rules,
        score_format_rules: sportSettings.score_format_rules,
        competition_format: sportSettings.competition_format,
        // 後方互換性のために従来のフィールドも保持
        score_format: sportSettings.has_extra_time ? "regular_extra_pk" : "regular_pk"
      },
      // 大会フォーマット詳細情報
      format_details: formatDetails,
      // ブロック構成詳細情報
      block_structure: blockStructure,
      // 拡張メタデータ（UI表示設定・会場情報など）
      extended_metadata: extendedMetadata,
      // レガシー対応（削除予定）
      tournament_rules: {
        has_extra_time: Boolean(sportSettings.has_extra_time),
        period_count: Number(sportSettings.period_count || 2),
        supports_pk: Boolean(sportSettings.supports_pk),
        score_format: sportSettings.has_extra_time ? "regular_extra_pk" : "regular_pk"
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