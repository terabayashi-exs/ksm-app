import { createClient } from '@libsql/client';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const db = createClient({
  url: process.env.DATABASE_URL_STAG!,
  authToken: process.env.DATABASE_AUTH_TOKEN_STAG,
});

async function duplicateTournamentForUser(
  sourceGroupId: number,
  targetUsername: string,
  targetGroupNameSuffix: string
) {
  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`  ${targetUsername} 用の大会を複製中...`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

  try {
    // 1. 元の大会データを取得
    const originalGroup = await db.execute({
      sql: 'SELECT * FROM t_tournament_groups WHERE group_id = ?',
      args: [sourceGroupId],
    });

    if (originalGroup.rows.length === 0) {
      throw new Error(`group_id:${sourceGroupId}の大会が見つかりません`);
    }

    const originalGroupData: any = originalGroup.rows[0];

    // 2. test001管理者の確認
    const test001Admin = await db.execute({
      sql: 'SELECT * FROM m_administrators WHERE admin_login_id = ?',
      args: ['test001'],
    });

    if (test001Admin.rows.length === 0) {
      throw new Error('test001管理者が見つかりません');
    }

    // 3. ターゲット管理者の確認・作成
    let targetAdmin = await db.execute({
      sql: 'SELECT * FROM m_administrators WHERE admin_login_id = ?',
      args: [targetUsername],
    });

    if (targetAdmin.rows.length === 0) {
      console.log(`${targetUsername}管理者を作成中...`);
      const test001Data: any = test001Admin.rows[0];
      await db.execute({
        sql: `INSERT INTO m_administrators (
          admin_login_id, password_hash, email, organization_name,
          current_plan_id, subscription_status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
        args: [
          targetUsername,
          test001Data.password_hash,
          `${targetUsername}@example.com`,
          test001Data.organization_name,
          test001Data.current_plan_id,
          test001Data.subscription_status,
        ],
      });
      console.log(`${targetUsername}管理者を作成しました`);
    }

    // 4. 元の大会に関連する部門を取得
    const originalTournaments = await db.execute({
      sql: 'SELECT * FROM t_tournaments WHERE group_id = ? ORDER BY tournament_id',
      args: [sourceGroupId],
    });

    // 5. 新しい大会グループを作成
    const newGroupName = originalGroupData.group_name.replace('001', targetGroupNameSuffix);

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
        targetUsername,
      ],
    });

    const newGroupId = Number(insertGroup.lastInsertRowid);
    console.log(`新しい大会グループを作成: group_id=${newGroupId}, 名前=${newGroupName}`);

    // 6. 部門を複製
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
          newGroupId, t.tournament_name, t.format_id, t.venue_id, t.team_count, t.court_count,
          t.tournament_dates, t.match_duration_minutes, t.break_duration_minutes,
          t.status, t.visibility, t.public_start_date, t.recruitment_start_date, t.recruitment_end_date,
          t.sport_type_id, targetUsername, t.archive_ui_version, t.is_archived,
          t.files_count || 0, t.group_order, t.category_name, t.show_players_public || 0,
        ],
      });

      const newTournamentId = Number(insertTournament.lastInsertRowid);
      tournamentIdMap.set(Number(t.tournament_id), newTournamentId);
    }

    console.log(`部門を複製: ${tournamentIdMap.size}件`);

    // 7. トーナメントルールを複製
    let rulesCount = 0;
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
            newTournamentId, r.phase, r.use_extra_time, r.use_penalty, r.active_periods,
            r.notes, r.point_system, r.walkover_settings, r.tie_breaking_rules, r.tie_breaking_enabled,
          ],
        });
        rulesCount++;
      }
    }

    console.log(`トーナメントルールを複製: ${rulesCount}件`);

    // 8. チームデータを複製
    const teamIdMap = new Map<string, string>();
    let teamCounter = Date.now();

    for (const [oldTournamentId, newTournamentId] of tournamentIdMap.entries()) {
      const tournamentTeams = await db.execute({
        sql: 'SELECT * FROM t_tournament_teams WHERE tournament_id = ?',
        args: [oldTournamentId],
      });

      for (const tt of tournamentTeams.rows) {
        const ttData: any = tt;

        const teamMaster = await db.execute({
          sql: 'SELECT * FROM m_teams WHERE team_id = ?',
          args: [ttData.team_id],
        });

        if (teamMaster.rows.length === 0) continue;

        const teamData: any = teamMaster.rows[0];

        let newTeamId: string;
        if (teamIdMap.has(teamData.team_id)) {
          newTeamId = teamIdMap.get(teamData.team_id)!;
        } else {
          newTeamId = `dup_${teamCounter++}`;

          await db.execute({
            sql: `INSERT INTO m_teams (
              team_id, team_name, team_omission, contact_person, contact_email, contact_phone,
              representative_player_id, password_hash, is_active,
              created_at, updated_at, registration_type
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'), ?)`,
            args: [
              newTeamId, teamData.team_name, teamData.team_omission, teamData.contact_person,
              teamData.contact_email, teamData.contact_phone, teamData.representative_player_id,
              teamData.password_hash, teamData.is_active, teamData.registration_type,
            ],
          });

          teamIdMap.set(teamData.team_id, newTeamId);
        }

        await db.execute({
          sql: `INSERT INTO t_tournament_teams (
            tournament_id, team_id, team_name, team_omission,
            assigned_block, block_position, withdrawal_status,
            withdrawal_reason, registration_method, participation_status,
            created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
          args: [
            newTournamentId, newTeamId, ttData.team_name, ttData.team_omission,
            ttData.assigned_block, ttData.block_position, ttData.withdrawal_status || 'active',
            ttData.withdrawal_reason, ttData.registration_method, ttData.participation_status,
          ],
        });
      }
    }

    console.log(`チームマスターを複製: ${teamIdMap.size}件`);

    // 9. 試合ブロックとt_matches_liveを複製
    let blocksCount = 0;
    let matchesCount = 0;

    for (const [oldTournamentId, newTournamentId] of tournamentIdMap.entries()) {
      const matchBlocks = await db.execute({
        sql: 'SELECT * FROM t_match_blocks WHERE tournament_id = ?',
        args: [oldTournamentId],
      });

      if (matchBlocks.rows.length === 0) continue;

      const blockIdMap = new Map<number, number>();

      for (const block of matchBlocks.rows) {
        const b: any = block;
        const insertBlock = await db.execute({
          sql: `INSERT INTO t_match_blocks (
            tournament_id, phase, display_round_name, block_name, match_type,
            block_order, team_rankings, remarks, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
          args: [
            newTournamentId, b.phase, b.display_round_name, b.block_name, b.match_type,
            b.block_order, b.team_rankings, b.remarks,
          ],
        });

        const newBlockId = Number(insertBlock.lastInsertRowid);
        blockIdMap.set(Number(b.match_block_id), newBlockId);
        blocksCount++;
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

        if (!newBlockId) continue;

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
            newBlockId, m.tournament_date, m.match_number, m.match_code,
            m.team1_display_name, m.team2_display_name, m.court_number, m.start_time,
            m.team1_scores, m.team2_scores, m.period_count, m.is_draw, m.is_walkover,
            m.match_status, m.result_status, m.remarks, m.confirmed_by,
            m.cancellation_type, m.team1_tournament_team_id, m.team2_tournament_team_id,
            m.winner_tournament_team_id,
          ],
        });
        matchesCount++;
      }
    }

    console.log(`試合ブロックを複製: ${blocksCount}件`);
    console.log(`試合データを複製: ${matchesCount}件`);

    console.log(`✅ ${targetUsername} 用の大会複製完了 (group_id: ${newGroupId})`);

    return newGroupId;
  } catch (error) {
    console.error(`❌ ${targetUsername} 用の複製中にエラーが発生:`, error);
    throw error;
  }
}

async function main() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  大会一括複製スクリプト');
  console.log('  test003 ～ test010 用に複製');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const sourceGroupId = 23; // 元の大会ID
  const users = [
    { username: 'test003', suffix: '003' },
    { username: 'test004', suffix: '004' },
    { username: 'test005', suffix: '005' },
    { username: 'test006', suffix: '006' },
    { username: 'test007', suffix: '007' },
    { username: 'test008', suffix: '008' },
    { username: 'test009', suffix: '009' },
    { username: 'test010', suffix: '010' },
  ];

  const createdGroupIds: number[] = [];

  for (const user of users) {
    try {
      const groupId = await duplicateTournamentForUser(
        sourceGroupId,
        user.username,
        user.suffix
      );
      createdGroupIds.push(groupId);
    } catch (error) {
      console.error(`${user.username}の複製に失敗しました`);
      // エラーが発生しても次のユーザーの複製を続行
    }
  }

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  一括複製完了');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`作成された大会グループID: ${createdGroupIds.join(', ')}`);
  console.log(`合計: ${createdGroupIds.length}件`);
}

main().catch(console.error);
