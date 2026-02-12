import { createClient } from '@libsql/client';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const db = createClient({
  url: process.env.DATABASE_URL_STAG!,
  authToken: process.env.DATABASE_AUTH_TOKEN_STAG,
});

async function duplicateTournament() {
  try {
    console.log('=== 大会複製スクリプト開始 ===\n');

    // 1. 元の大会データを確認
    console.log('1. 元の大会データを確認中...');
    const originalGroup = await db.execute({
      sql: 'SELECT * FROM t_tournament_groups WHERE group_id = ?',
      args: [23],
    });

    if (originalGroup.rows.length === 0) {
      throw new Error('group_id:23の大会が見つかりません');
    }

    const originalGroupData: any = originalGroup.rows[0];
    console.log('元の大会:', originalGroupData.group_name);
    console.log('作成者:', originalGroupData.admin_login_id);

    // 2. test001管理者の確認
    const test001Admin = await db.execute({
      sql: 'SELECT * FROM m_administrators WHERE admin_login_id = ?',
      args: ['test001'],
    });

    if (test001Admin.rows.length === 0) {
      throw new Error('test001管理者が見つかりません');
    }

    console.log('test001管理者を確認しました');

    // 3. test002管理者の確認・作成
    console.log('\n2. test002管理者の確認・作成中...');
    let test002Admin = await db.execute({
      sql: 'SELECT * FROM m_administrators WHERE admin_login_id = ?',
      args: ['test002'],
    });

    if (test002Admin.rows.length === 0) {
      console.log('test002管理者が存在しないため作成します...');
      const test001Data: any = test001Admin.rows[0];
      await db.execute({
        sql: `INSERT INTO m_administrators (
          admin_login_id, password_hash, email, organization_name,
          current_plan_id, subscription_status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
        args: [
          'test002',
          test001Data.password_hash,
          'test002@example.com',
          test001Data.organization_name,
          test001Data.current_plan_id,
          test001Data.subscription_status,
        ],
      });
      console.log('test002管理者を作成しました');
    } else {
      console.log('test002管理者が既に存在します');
    }

    // 4. 元の大会に関連する部門を確認
    console.log('\n3. 部門データを確認中...');
    const originalTournaments = await db.execute({
      sql: 'SELECT * FROM t_tournaments WHERE group_id = ? ORDER BY tournament_id',
      args: [23],
    });

    console.log(`部門数: ${originalTournaments.rows.length}`);
    originalTournaments.rows.forEach((row: any) => {
      console.log(`- tournament_id: ${row.tournament_id}, name: ${row.tournament_name}`);
    });

    // 5. 新しい大会グループを作成
    console.log('\n4. 新しい大会グループを作成中...');
    const newGroupName = originalGroupData.group_name.replace('001', '002');

    const insertGroup = await db.execute({
      sql: `INSERT INTO t_tournament_groups (
        group_name, organizer, venue_id, event_start_date, event_end_date,
        recruitment_start_date, recruitment_end_date, visibility,
        event_description, admin_login_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
      args: [
        newGroupName,
        originalGroupData.organizer,
        originalGroupData.venue_id,
        originalGroupData.event_start_date,
        originalGroupData.event_end_date,
        originalGroupData.recruitment_start_date,
        originalGroupData.recruitment_end_date,
        originalGroupData.visibility,
        originalGroupData.event_description,
        'test002',
      ],
    });

    const newGroupId = Number(insertGroup.lastInsertRowid);
    console.log(`新しい大会グループを作成しました (group_id: ${newGroupId})`);

    // 6. 部門を複製
    console.log('\n5. 部門を複製中...');
    const tournamentIdMap = new Map<number, number>();

    for (const originalTournament of originalTournaments.rows) {
      const t: any = originalTournament;
      const insertTournament = await db.execute({
        sql: `INSERT INTO t_tournaments (
          group_id, tournament_name, format_id, venue_id, team_count, court_count,
          tournament_dates, match_duration_minutes, break_duration_minutes,
          status, visibility, public_start_date, recruitment_start_date, recruitment_end_date,
          sport_type_id, created_by, archive_ui_version, is_archived,
          files_count, group_order, category_name, show_players_public,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
        args: [
          newGroupId,
          t.tournament_name,
          t.format_id,
          t.venue_id,
          t.team_count,
          t.court_count,
          t.tournament_dates,
          t.match_duration_minutes,
          t.break_duration_minutes,
          t.status,
          t.visibility,
          t.public_start_date,
          t.recruitment_start_date,
          t.recruitment_end_date,
          t.sport_type_id,
          'test002',
          t.archive_ui_version,
          t.is_archived,
          t.files_count || 0,
          t.group_order,
          t.category_name,
          t.show_players_public || 0,
        ],
      });

      const newTournamentId = Number(insertTournament.lastInsertRowid);
      tournamentIdMap.set(Number(t.tournament_id), newTournamentId);
      console.log(`部門を複製: ${t.tournament_id} -> ${newTournamentId} (${t.tournament_name})`);
    }

    // 7. トーナメントルールを複製
    console.log('\n6. トーナメントルールを複製中...');
    for (const [oldTournamentId, newTournamentId] of tournamentIdMap.entries()) {
      const rules = await db.execute({
        sql: 'SELECT * FROM t_tournament_rules WHERE tournament_id = ?',
        args: [oldTournamentId],
      });

      for (const rule of rules.rows) {
        const r: any = rule;
        await db.execute({
          sql: `INSERT INTO t_tournament_rules (
            tournament_id, phase, use_extra_time, use_penalty, active_periods,
            notes, point_system, walkover_settings, tie_breaking_rules,
            tie_breaking_enabled, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
          args: [
            newTournamentId,
            r.phase,
            r.use_extra_time,
            r.use_penalty,
            r.active_periods,
            r.notes,
            r.point_system,
            r.walkover_settings,
            r.tie_breaking_rules,
            r.tie_breaking_enabled,
          ],
        });
      }
      console.log(`トーナメントルールを複製: tournament_id ${newTournamentId} (${rules.rows.length}件)`);
    }

    // 8. チームデータを複製
    console.log('\n7. チームデータを複製中...');
    const teamIdMap = new Map<string, string>();
    let teamCounter = Date.now(); // タイムスタンプベースのカウンター

    for (const [oldTournamentId, newTournamentId] of tournamentIdMap.entries()) {
      const tournamentTeams = await db.execute({
        sql: 'SELECT * FROM t_tournament_teams WHERE tournament_id = ?',
        args: [oldTournamentId],
      });

      console.log(`部門 ${oldTournamentId} のチーム数: ${tournamentTeams.rows.length}`);

      for (const tt of tournamentTeams.rows) {
        const ttData: any = tt;

        // チームマスターを取得
        const teamMaster = await db.execute({
          sql: 'SELECT * FROM m_teams WHERE team_id = ?',
          args: [ttData.team_id],
        });

        if (teamMaster.rows.length === 0) {
          console.log(`警告: team_id ${ttData.team_id} のマスターデータが見つかりません`);
          continue;
        }

        const teamData: any = teamMaster.rows[0];

        // 既に複製済みかチェック
        let newTeamId: string;
        if (teamIdMap.has(teamData.team_id)) {
          newTeamId = teamIdMap.get(teamData.team_id)!;
        } else {
          // 新しいteam_idを生成（TEXT型のPKなので文字列を生成）
          newTeamId = `dup_${teamCounter++}`;

          // 新しいチームマスターを作成
          await db.execute({
            sql: `INSERT INTO m_teams (
              team_id, team_name, team_omission, contact_person, contact_email, contact_phone,
              representative_player_id, password_hash, is_active,
              created_at, updated_at, registration_type
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'), ?)`,
            args: [
              newTeamId,
              teamData.team_name,
              teamData.team_omission,
              teamData.contact_person,
              teamData.contact_email,
              teamData.contact_phone,
              teamData.representative_player_id,
              teamData.password_hash,
              teamData.is_active,
              teamData.registration_type,
            ],
          });

          teamIdMap.set(teamData.team_id, newTeamId);
          console.log(`チームマスターを複製: ${teamData.team_name} (${teamData.team_id} -> ${newTeamId})`);
        }

        // 新しいトーナメントチームを作成
        await db.execute({
          sql: `INSERT INTO t_tournament_teams (
            tournament_id, team_id, team_name, team_omission,
            assigned_block, block_position, withdrawal_status,
            withdrawal_reason, registration_method, participation_status,
            created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
          args: [
            newTournamentId,
            newTeamId,
            ttData.team_name,
            ttData.team_omission,
            ttData.assigned_block,
            ttData.block_position,
            ttData.withdrawal_status || 'active',
            ttData.withdrawal_reason,
            ttData.registration_method,
            ttData.participation_status,
          ],
        });
      }
    }

    // 9. 選手データを複製
    console.log('\n8. 選手データを複製中...');
    let totalPlayers = 0;
    for (const [oldTeamId, newTeamId] of teamIdMap.entries()) {
      const players = await db.execute({
        sql: 'SELECT * FROM m_players WHERE current_team_id = ?',
        args: [oldTeamId],
      });

      for (const player of players.rows) {
        const p: any = player;
        await db.execute({
          sql: `INSERT INTO m_players (
            player_name, jersey_number, current_team_id, is_active,
            created_at, updated_at
          ) VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))`,
          args: [
            p.player_name,
            p.jersey_number,
            newTeamId,
            p.is_active,
          ],
        });
        totalPlayers++;
      }

      if (players.rows.length > 0) {
        console.log(`選手を複製: current_team_id ${newTeamId} (${players.rows.length}名)`);
      }
    }

    // 10. 試合ブロックとライブ試合データを複製
    console.log('\n9. 試合ブロックと試合データを複製中...');

    for (const [oldTournamentId, newTournamentId] of tournamentIdMap.entries()) {
      const matchBlocks = await db.execute({
        sql: 'SELECT * FROM t_match_blocks WHERE tournament_id = ?',
        args: [oldTournamentId],
      });

      if (matchBlocks.rows.length === 0) {
        console.log(`tournament_id ${oldTournamentId} には試合ブロックがありません（スキップ）`);
        continue;
      }

      const blockIdMap = new Map<number, number>();

      for (const block of matchBlocks.rows) {
        const b: any = block;
        const insertBlock = await db.execute({
          sql: `INSERT INTO t_match_blocks (
            tournament_id, phase, display_round_name, block_name, match_type,
            block_order, team_rankings, remarks, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
          args: [
            newTournamentId,
            b.phase,
            b.display_round_name,
            b.block_name,
            b.match_type,
            b.block_order,
            b.team_rankings,
            b.remarks,
          ],
        });

        const newBlockId = Number(insertBlock.lastInsertRowid);
        blockIdMap.set(Number(b.match_block_id), newBlockId);
        console.log(`試合ブロックを複製: ${b.block_name} (${b.match_block_id} -> ${newBlockId})`);
      }

      // t_matches_liveを複製
      const matchesLive = await db.execute({
        sql: `SELECT ml.* FROM t_matches_live ml
              WHERE ml.match_block_id IN (
                SELECT match_block_id FROM t_match_blocks WHERE tournament_id = ?
              )`,
        args: [oldTournamentId],
      });

      for (const match of matchesLive.rows) {
        const m: any = match;
        const newBlockId = blockIdMap.get(Number(m.match_block_id));

        if (!newBlockId) {
          console.log(`警告: match_block_id ${m.match_block_id} が見つかりません`);
          continue;
        }

        await db.execute({
          sql: `INSERT INTO t_matches_live (
            match_block_id, tournament_date, match_number, match_code,
            team1_display_name, team2_display_name, court_number, start_time,
            team1_scores, team2_scores, period_count, is_draw, is_walkover,
            match_status, result_status, remarks, confirmed_by,
            cancellation_type, team1_tournament_team_id, team2_tournament_team_id,
            winner_tournament_team_id, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
          args: [
            newBlockId,
            m.tournament_date,
            m.match_number,
            m.match_code,
            m.team1_display_name,
            m.team2_display_name,
            m.court_number,
            m.start_time,
            m.team1_scores,
            m.team2_scores,
            m.period_count,
            m.is_draw,
            m.is_walkover,
            m.match_status,
            m.result_status,
            m.remarks,
            m.confirmed_by,
            m.cancellation_type,
            m.team1_tournament_team_id,
            m.team2_tournament_team_id,
            m.winner_tournament_team_id,
          ],
        });
      }

      if (matchesLive.rows.length > 0) {
        console.log(`試合データ(t_matches_live)を複製: tournament_id ${newTournamentId} (${matchesLive.rows.length}件)`);
      }
    }

    console.log('\n=== 大会複製完了 ===');
    console.log(`新しい大会グループID: ${newGroupId}`);
    console.log(`大会名: ${newGroupName}`);
    console.log(`作成管理者: test002`);
    console.log(`複製された部門数: ${tournamentIdMap.size}`);
    console.log(`複製されたチーム数: ${teamIdMap.size}`);
    console.log(`複製された選手数: ${totalPlayers}`);

  } catch (error) {
    console.error('エラーが発生しました:', error);
    throw error;
  }
}

duplicateTournament().catch(console.error);
