// app/api/admin/tournaments/duplicate/route.ts
/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { ArchiveVersionManager } from '@/lib/archive-version-manager';

/**
 * 複製レベルに応じて適切なステータスを決定
 */
function determineStatusForLevel(level: string, sourceStatus: string): string {
  switch (level) {
    case 'level1':
    case 'level2':
      // レベル1-2: 常にplanningで開始（準備段階）
      return 'planning';
    case 'level3':
      // レベル3: 組合せ済みなので、元のステータスがongoing/completedならそれを保持
      return ['ongoing', 'completed'].includes(sourceStatus) ? sourceStatus : 'planning';
    case 'level4':
      // レベル4: 進行データも複製するので、元のステータスをそのまま複製
      return sourceStatus || 'planning';
    default:
      return 'planning';
  }
}

interface DuplicateRequest {
  source_tournament_id: number;
  new_tournament_name: string;
  duplicate_level: 'level1' | 'level2' | 'level3' | 'level4';
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session || session.user.role !== 'admin') {
      return NextResponse.json(
        { success: false, error: '管理者権限が必要です' },
        { status: 401 }
      );
    }

    const { source_tournament_id, new_tournament_name, duplicate_level }: DuplicateRequest = await request.json();

    if (!source_tournament_id || !new_tournament_name?.trim() || !duplicate_level) {
      return NextResponse.json(
        { success: false, error: '必要なパラメータが不足しています' },
        { status: 400 }
      );
    }

    // 複製元大会の存在確認
    const sourceTournament = await db.execute(`
      SELECT 
        t.*,
        st.sport_code,
        st.sport_name
      FROM t_tournaments t
      LEFT JOIN m_sport_types st ON t.sport_type_id = st.sport_type_id
      WHERE t.tournament_id = ?
    `, [source_tournament_id]);

    if (sourceTournament.rows.length === 0) {
      return NextResponse.json(
        { success: false, error: '複製元の大会が見つかりません' },
        { status: 404 }
      );
    }

    // アーカイブ済み大会の複製制限チェック
    const sourceData = sourceTournament.rows[0] as any;
    if (sourceData.is_archived === 1) {
      return NextResponse.json(
        { success: false, error: 'アーカイブ済みの大会は複製できません。アーカイブ前の大会データから複製してください。' },
        { status: 400 }
      );
    }

    // 大会名の重複チェック
    const nameCheck = await db.execute(`
      SELECT tournament_id FROM t_tournaments WHERE tournament_name = ?
    `, [new_tournament_name.trim()]);

    if (nameCheck.rows.length > 0) {
      return NextResponse.json(
        { success: false, error: 'この大会名は既に使用されています' },
        { status: 400 }
      );
    }

    console.log(`[DUPLICATE] 開始: 大会${source_tournament_id} -> レベル${duplicate_level}`);

    // 複製実行
    const result = await duplicateTournament(source_tournament_id, new_tournament_name.trim(), duplicate_level, session.user.id);

    console.log(`[DUPLICATE] 完了: 新しい大会ID ${result.new_tournament_id}`);

    return NextResponse.json({
      success: true,
      message: '大会の複製が完了しました',
      details: {
        original_tournament_id: source_tournament_id,
        new_tournament_id: result.new_tournament_id,
        new_tournament_name: new_tournament_name.trim(),
        level_applied: `レベル${duplicate_level.slice(-1)}`,
        teams_copied: result.teams_copied || 0,
        matches_copied: result.matches_copied || 0
      }
    });

  } catch (error) {
    console.error('[DUPLICATE] エラー:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: '複製処理中にエラーが発生しました',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

/**
 * 大会複製のメイン処理
 */
async function duplicateTournament(
  sourceTournamentId: number, 
  newTournamentName: string, 
  level: 'level1' | 'level2' | 'level3' | 'level4',
  createdBy: string
) {
  // 1. 大会基本情報の複製
  const newTournamentId = await duplicateTournamentBasic(sourceTournamentId, newTournamentName, level, createdBy);
  
  // 2. ルール情報の複製
  await duplicateTournamentRules(sourceTournamentId, newTournamentId);

  // 3. ブロック情報の複製（空の状態）
  const blockMapping = await duplicateMatchBlocks(sourceTournamentId, newTournamentId, level);

  // 4. 基本試合スケジュールの複製（テンプレートベース）
  const matchMapping = await duplicateMatchesBasic(sourceTournamentId, newTournamentId, blockMapping);

  let teams_copied = 0;
  const matches_copied = matchMapping.size;

  // レベル2以上: チーム・選手データの複製
  if (['level2', 'level3', 'level4'].includes(level)) {
    teams_copied = await duplicateTeamsAndPlayers(sourceTournamentId, newTournamentId);
  }

  // レベル3以上: 組合せ・チーム割り当ての複製
  if (['level3', 'level4'].includes(level)) {
    await duplicateTeamAssignments(sourceTournamentId, newTournamentId, blockMapping, matchMapping);
  }

  // レベル4: 進行中データの複製
  if (level === 'level4') {
    // まず自動作成された可能性があるt_match_statusレコードを削除
    await cleanupAutoCreatedMatchStatus(newTournamentId);
    await duplicateMatchProgress(sourceTournamentId, newTournamentId, matchMapping, blockMapping);
  }

  return {
    new_tournament_id: newTournamentId,
    teams_copied,
    matches_copied
  };
}

/**
 * 大会基本情報の複製
 */
async function duplicateTournamentBasic(sourceTournamentId: number, newTournamentName: string, level: string, createdBy: string): Promise<number> {
  // 複製元の大会情報を取得
  const sourceResult = await db.execute(`
    SELECT * FROM t_tournaments WHERE tournament_id = ?
  `, [sourceTournamentId]);

  if (sourceResult.rows.length === 0) {
    throw new Error('複製元の大会が見つかりません');
  }

  const sourceData = sourceResult.rows[0] as any;

  // 新しい大会を作成（実際のスキーマに合わせて調整）
  console.log(`[DUPLICATE] 大会基本情報複製中:`, {
    tournament_name: newTournamentName,
    sport_type_id: sourceData.sport_type_id,
    format_id: sourceData.format_id,
    venue_id: sourceData.venue_id
  });

  // 現在のアーカイブバージョンを取得（複製元ではなく現在の最新バージョンを使用）
  const currentArchiveVersion = ArchiveVersionManager.getCurrentVersion();
  console.log(`[DUPLICATE] 新しい大会には現在のUIバージョンを適用: ${currentArchiveVersion}`);
  
  const insertResult = await db.execute(`
    INSERT INTO t_tournaments (
      tournament_name, format_id, venue_id, team_count,
      recruitment_start_date, recruitment_end_date, tournament_dates,
      status, visibility, public_start_date, court_count, match_duration_minutes, break_duration_minutes,
      sport_type_id, created_by, archive_ui_version, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', '+9 hours'), datetime('now', '+9 hours'))
  `, [
    newTournamentName,
    sourceData.format_id || 1, // デフォルト値を提供
    sourceData.venue_id || 1, // デフォルト値を提供
    sourceData.team_count || 0,
    sourceData.recruitment_start_date,
    sourceData.recruitment_end_date,
    sourceData.tournament_dates,
    determineStatusForLevel(level, sourceData.status), // レベルに応じてステータスを決定
    sourceData.visibility || 'preparing', // 複製元の公開設定を引き継ぐ（デフォルトは非公開）
    sourceData.public_start_date, // 公開開始日を複製
    sourceData.court_count || 4,
    sourceData.match_duration_minutes || 15,
    sourceData.break_duration_minutes || 5,
    sourceData.sport_type_id || 1, // 競技種別を複製（重要！）
    createdBy, // 複製実行者のIDを設定
    currentArchiveVersion // 複製元ではなく現在のUIバージョンを設定（新しい大会用）
  ]);

  return Number(insertResult.lastInsertRowid);
}

/**
 * ルール情報の複製
 */
async function duplicateTournamentRules(sourceTournamentId: number, newTournamentId: number): Promise<void> {
  console.log(`[DUPLICATE] ルール複製開始: 大会${sourceTournamentId} -> 大会${newTournamentId}`);
  
  const rulesResult = await db.execute(`
    SELECT * FROM t_tournament_rules WHERE tournament_id = ?
  `, [sourceTournamentId]);

  console.log(`[DUPLICATE] 元の大会のルール数: ${rulesResult.rows.length}`);
  
  if (rulesResult.rows.length === 0) {
    console.log(`[DUPLICATE] 警告: 大会${sourceTournamentId}にルールデータが存在しません`);
    return;
  }

  for (const rule of rulesResult.rows) {
    const ruleData = rule as any;
    console.log(`[DUPLICATE] ルール複製中:`, {
      phase: ruleData.phase,
      use_extra_time: ruleData.use_extra_time,
      use_penalty: ruleData.use_penalty,
      active_periods: ruleData.active_periods,
      point_system: ruleData.point_system,
      walkover_settings: ruleData.walkover_settings,
      tie_breaking_rules: ruleData.tie_breaking_rules,
      tie_breaking_enabled: ruleData.tie_breaking_enabled
    });

    await db.execute(`
      INSERT INTO t_tournament_rules (
        tournament_id, phase, use_extra_time, use_penalty, active_periods,
        notes, point_system, walkover_settings,
        tie_breaking_rules, tie_breaking_enabled
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      newTournamentId,
      ruleData.phase,
      ruleData.use_extra_time,
      ruleData.use_penalty,
      ruleData.active_periods,
      ruleData.notes || null,
      ruleData.point_system || null,
      ruleData.walkover_settings || null,
      ruleData.tie_breaking_rules || null,
      ruleData.tie_breaking_enabled !== undefined ? ruleData.tie_breaking_enabled : 1
    ]);
  }
  
  console.log(`[DUPLICATE] ルール複製完了: ${rulesResult.rows.length}件`);
}

/**
 * ブロック情報の複製
 */
async function duplicateMatchBlocks(sourceTournamentId: number, newTournamentId: number, level: string): Promise<Map<number, number>> {
  const blocksResult = await db.execute(`
    SELECT * FROM t_match_blocks WHERE tournament_id = ? ORDER BY block_order
  `, [sourceTournamentId]);

  const blockMapping = new Map<number, number>();

  for (const block of blocksResult.rows) {
    const blockData = block as any;
    const insertResult = await db.execute(`
      INSERT INTO t_match_blocks (
        tournament_id, phase, display_round_name, block_name, match_type, block_order,
        team_rankings, remarks
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      newTournamentId,
      blockData.phase,
      blockData.display_round_name,
      blockData.block_name,
      blockData.match_type || '通常', // match_type フィールドを追加
      blockData.block_order,
      level === 'level4' ? blockData.team_rankings : null, // レベル4では順位表もコピー
      blockData.remarks
    ]);

    blockMapping.set(Number(blockData.match_block_id), Number(insertResult.lastInsertRowid));
  }

  return blockMapping;
}

/**
 * 基本試合スケジュールの複製
 */
async function duplicateMatchesBasic(
  sourceTournamentId: number, 
  newTournamentId: number, 
  blockMapping: Map<number, number>
): Promise<Map<number, number>> {
  const matchesResult = await db.execute(`
    SELECT * FROM t_matches_live WHERE match_block_id IN (
      SELECT match_block_id FROM t_match_blocks WHERE tournament_id = ?
    ) ORDER BY match_id
  `, [sourceTournamentId]);

  const matchMapping = new Map<number, number>();

  for (const match of matchesResult.rows) {
    const matchData = match as any;
    const newBlockId = blockMapping.get(Number(matchData.match_block_id));
    
    if (!newBlockId) {
      console.warn(`ブロックマッピングが見つかりません: ${matchData.match_block_id}`);
      continue;
    }

    const insertResult = await db.execute(`
      INSERT INTO t_matches_live (
        match_block_id, tournament_date, match_number, match_code,
        team1_id, team2_id, team1_display_name, team2_display_name,
        court_number, start_time, period_count,
        team1_scores, team2_scores, winner_team_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      newBlockId,
      String(matchData.tournament_date || '1'), // デフォルト値を提供
      Number(matchData.match_number) || 1,
      String(matchData.match_code) || 'M1',
      null, // レベル3以降で設定
      null, // レベル3以降で設定
      String(matchData.team1_display_name) || 'チーム1',
      String(matchData.team2_display_name) || 'チーム2',
      matchData.court_number ? Number(matchData.court_number) : null,
      matchData.start_time ? String(matchData.start_time) : null,
      Number(matchData.period_count) || 1,
      '[0]', // 初期スコア
      '[0]', // 初期スコア
      null // 勝者なし
    ]);

    matchMapping.set(Number(matchData.match_id), Number(insertResult.lastInsertRowid));
  }

  return matchMapping;
}

/**
 * チーム・選手データの複製
 */
async function duplicateTeamsAndPlayers(sourceTournamentId: number, newTournamentId: number): Promise<number> {
  // チーム情報の複製
  const teamsResult = await db.execute(`
    SELECT * FROM t_tournament_teams WHERE tournament_id = ?
  `, [sourceTournamentId]);

  let teamCount = 0;

  for (const team of teamsResult.rows) {
    const teamData = team as any;
    
    // チーム情報を複製（t_tournament_teamsテーブルの実際のフィールドのみ使用）
    const teamInsertResult = await db.execute(`
      INSERT INTO t_tournament_teams (
        tournament_id, team_id, assigned_block, block_position,
        team_name, team_omission, withdrawal_status, withdrawal_reason,
        withdrawal_requested_at, withdrawal_processed_at,
        withdrawal_processed_by, withdrawal_admin_comment,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      newTournamentId,
      teamData.team_id,
      null, // レベル3以降で設定
      null, // レベル3以降で設定
      teamData.team_name,
      teamData.team_omission,
      'active', // 辞退状況はリセット
      null,
      null,
      null,
      null,
      null,
      teamData.created_at,
      teamData.updated_at
    ]);

    const newTournamentTeamId = Number(teamInsertResult.lastInsertRowid);

    // 選手情報の複製
    const playersResult = await db.execute(`
      SELECT * FROM t_tournament_players WHERE tournament_id = ? AND team_id = ?
    `, [sourceTournamentId, teamData.team_id]);

    for (const player of playersResult.rows) {
      const playerData = player as any;
      await db.execute(`
        INSERT INTO t_tournament_players (
          tournament_id, team_id, player_id, tournament_team_id, jersey_number, player_status,
          registration_date, withdrawal_date, remarks, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        newTournamentId,
        playerData.team_id,
        playerData.player_id,
        newTournamentTeamId,
        playerData.jersey_number,
        playerData.player_status,
        playerData.registration_date,
        playerData.withdrawal_date,
        playerData.remarks,
        playerData.created_at,
        playerData.updated_at
      ]);
    }

    teamCount++;
  }

  return teamCount;
}

/**
 * チーム割り当て・組合せの複製
 */
async function duplicateTeamAssignments(
  sourceTournamentId: number,
  newTournamentId: number,
  blockMapping: Map<number, number>,
  matchMapping: Map<number, number>
): Promise<void> {
  // チームの組合せ情報を更新
  const teamsResult = await db.execute(`
    SELECT * FROM t_tournament_teams WHERE tournament_id = ?
  `, [sourceTournamentId]);

  for (const team of teamsResult.rows) {
    const teamData = team as any;
    if (teamData.assigned_block && teamData.block_position !== null) {
      await db.execute(`
        UPDATE t_tournament_teams 
        SET assigned_block = ?, block_position = ?
        WHERE tournament_id = ? AND team_id = ?
      `, [
        teamData.assigned_block,
        teamData.block_position,
        newTournamentId,
        teamData.team_id
      ]);
    }
  }

  // 試合のチーム割り当てを更新
  const matchesResult = await db.execute(`
    SELECT * FROM t_matches_live ml
    JOIN t_match_blocks mb ON ml.match_block_id = mb.match_block_id
    WHERE mb.tournament_id = ? AND ml.team1_id IS NOT NULL
  `, [sourceTournamentId]);

  for (const match of matchesResult.rows) {
    const matchData = match as any;
    const newMatchId = matchMapping.get(Number(matchData.match_id));
    
    if (newMatchId) {
      await db.execute(`
        UPDATE t_matches_live 
        SET team1_id = ?, team2_id = ?
        WHERE match_id = ?
      `, [
        matchData.team1_id,
        matchData.team2_id,
        newMatchId
      ]);
    }
  }
}

/**
 * 自動作成されたt_match_statusレコードをクリーンアップ
 */
async function cleanupAutoCreatedMatchStatus(tournamentId: number): Promise<void> {
  console.log(`[DUPLICATE] t_match_statusのクリーンアップ開始: 大会${tournamentId}`);
  
  await db.execute(`
    DELETE FROM t_match_status 
    WHERE match_id IN (
      SELECT ml.match_id 
      FROM t_matches_live ml
      JOIN t_match_blocks mb ON ml.match_block_id = mb.match_block_id
      WHERE mb.tournament_id = ?
    )
  `, [tournamentId]);
  
  console.log(`[DUPLICATE] t_match_statusのクリーンアップ完了`);
}

/**
 * 進行中データの複製
 */
async function duplicateMatchProgress(
  sourceTournamentId: number,
  newTournamentId: number,
  matchMapping: Map<number, number>,
  blockMapping: Map<number, number>
): Promise<void> {
  // 1. t_matches_liveの進行データを更新
  console.log('[DUPLICATE] t_matches_live進行データ複製開始');
  const matchesResult = await db.execute(`
    SELECT ml.* FROM t_matches_live ml
    JOIN t_match_blocks mb ON ml.match_block_id = mb.match_block_id
    WHERE mb.tournament_id = ?
  `, [sourceTournamentId]);

  for (const match of matchesResult.rows) {
    const matchData = match as any;
    const newMatchId = matchMapping.get(Number(matchData.match_id));
    
    if (!newMatchId) continue;

    // t_matches_live の進行データを更新
    await db.execute(`
      UPDATE t_matches_live 
      SET team1_scores = ?, team2_scores = ?, winner_team_id = ?
      WHERE match_id = ?
    `, [
      matchData.team1_scores || '[0]',
      matchData.team2_scores || '[0]',
      matchData.winner_team_id,
      newMatchId
    ]);
  }

  // 2. t_match_statusを独立して複製
  console.log('[DUPLICATE] t_match_status複製開始');
  const statusResult = await db.execute(`
    SELECT ms.* FROM t_match_status ms
    JOIN t_matches_live ml ON ms.match_id = ml.match_id
    JOIN t_match_blocks mb ON ml.match_block_id = mb.match_block_id
    WHERE mb.tournament_id = ?
  `, [sourceTournamentId]);

  console.log(`[DUPLICATE] 複製対象の試合状態数: ${statusResult.rows.length}`);

  for (const status of statusResult.rows) {
    const statusData = status as any;
    const newMatchId = matchMapping.get(Number(statusData.match_id));
    const newBlockId = blockMapping.get(Number(statusData.match_block_id));
    
    if (!newMatchId || !newBlockId) {
      console.warn(`[DUPLICATE] マッピング不足: match_id=${statusData.match_id}, block_id=${statusData.match_block_id}`);
      continue;
    }

    try {
      // 新規レコードを作成（cleanupで削除済みなので全て新規）
      await db.execute(`
        INSERT INTO t_match_status (
          match_id, match_block_id, match_status, current_period, updated_by, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?)
      `, [
        newMatchId,
        newBlockId,
        statusData.match_status,
        statusData.current_period || 1,
        statusData.updated_by || 'system_duplicate',
        statusData.updated_at || "datetime('now', '+9 hours')"
      ]);
      console.log(`[DUPLICATE] 試合状態複製成功: match_id=${newMatchId}, status=${statusData.match_status}`);
    } catch (error) {
      console.error(`[DUPLICATE] 試合状態複製エラー: match_id=${statusData.match_id}`, error);
    }
  }

  // 確定済み結果（t_matches_final）の複製
  console.log('[DUPLICATE] 確定済み結果の複製開始');
  const confirmedMatchesResult = await db.execute(`
    SELECT mf.* FROM t_matches_final mf
    JOIN t_matches_live ml ON mf.match_id = ml.match_id
    JOIN t_match_blocks mb ON ml.match_block_id = mb.match_block_id
    WHERE mb.tournament_id = ?
  `, [sourceTournamentId]);

  console.log(`[DUPLICATE] 確定済み試合数: ${confirmedMatchesResult.rows.length}`);

  for (const confirmedMatch of confirmedMatchesResult.rows) {
    const matchData = confirmedMatch as any;
    const newMatchId = matchMapping.get(Number(matchData.match_id));
    
    if (!newMatchId) {
      console.warn(`[DUPLICATE] 試合マッピングが見つかりません: ${matchData.match_id}`);
      continue;
    }

    try {
      // 実際のt_matches_finalスキーマに合わせて修正
      await db.execute(`
        INSERT INTO t_matches_final (
          match_id, match_block_id, tournament_date, match_number, match_code,
          team1_id, team2_id, team1_display_name, team2_display_name,
          court_number, start_time, team1_scores, team2_scores, period_count,
          winner_team_id, is_draw, is_walkover, match_status, result_status,
          remarks, created_at, updated_at, cancellation_type
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        newMatchId,
        blockMapping.get(Number(matchData.match_block_id)), // 新しいブロックID
        matchData.tournament_date,
        matchData.match_number,
        matchData.match_code,
        matchData.team1_id,
        matchData.team2_id,
        matchData.team1_display_name,
        matchData.team2_display_name,
        matchData.court_number,
        matchData.start_time,
        matchData.team1_scores,
        matchData.team2_scores,
        matchData.period_count || 1,
        matchData.winner_team_id,
        matchData.is_draw || 0,
        matchData.is_walkover || 0,
        matchData.match_status || 'completed',
        matchData.result_status || 'confirmed',
        matchData.remarks,
        matchData.created_at || "datetime('now', '+9 hours')",
        matchData.updated_at || "datetime('now', '+9 hours')",
        matchData.cancellation_type
      ]);
      console.log(`[DUPLICATE] 確定結果複製成功: 元試合${matchData.match_id} → 新試合${newMatchId}`);
    } catch (error) {
      console.error(`[DUPLICATE] 確定結果複製エラー: 試合${matchData.match_id}`, error);
    }
  }
}