// マイグレーション: t_tournament_teamsテーブルにteam_nameとteam_omissionフィールドを追加
import { createClient } from "@libsql/client";
import fs from 'fs';
import path from 'path';

const FALLBACK_CONFIG = {
  url: "libsql://ksm-dev-asditd.aws-ap-northeast-1.turso.io",
  authToken: "eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3NTEyNDQwMzUsImlkIjoiMDM5NDVjMGYtYTg4Ny00ZjRlLWJkNGEtNTE1YzY0ZTVjOTdlIiwicmlkIjoiYWRmMWM2NDYtYWJhZS00OTJkLWI5N2UtMTM1MjgzOGE2N2Y1In0.ICP4YE3wIDH8Y51jac0O1591qr4oxGVkCAgIMvDAEqzzTpvvTNIY1C7zFy6U4JF6OvZkfg2vSCnfdgdkebnWCA"
};

async function runMigration() {
  console.log('🚀 大会チーム名フィールド追加マイグレーション開始...');

  // データベース接続
  const db = createClient({
    url: process.env.DATABASE_URL || FALLBACK_CONFIG.url,
    authToken: process.env.DATABASE_AUTH_TOKEN || FALLBACK_CONFIG.authToken,
  });

  try {
    // Step 1: 現在のテーブル構造を確認
    console.log('📋 現在のテーブル構造を確認中...');
    const tableInfo = await db.execute("PRAGMA table_info(t_tournament_teams)");
    const existingColumns = tableInfo.rows.map(row => row.name);
    
    console.log('既存のカラム:', existingColumns.join(', '));

    // team_nameとteam_omissionが既に存在するかチェック
    const hasTeamName = existingColumns.includes('team_name');
    const hasTeamOmission = existingColumns.includes('team_omission');

    if (hasTeamName && hasTeamOmission) {
      console.log('✅ team_nameとteam_omissionフィールドは既に存在します。');
      return;
    }

    // Step 2: フィールド追加
    if (!hasTeamName) {
      console.log('📝 team_nameフィールドを追加中...');
      await db.execute("ALTER TABLE t_tournament_teams ADD COLUMN team_name TEXT NOT NULL DEFAULT ''");
      console.log('✅ team_nameフィールドを追加しました。');
    }

    if (!hasTeamOmission) {
      console.log('📝 team_omissionフィールドを追加中...');
      await db.execute("ALTER TABLE t_tournament_teams ADD COLUMN team_omission TEXT NOT NULL DEFAULT ''");
      console.log('✅ team_omissionフィールドを追加しました。');
    }

    // Step 3: 既存データの確認と更新
    console.log('🔍 既存データを確認中...');
    const existingTeams = await db.execute(`
      SELECT 
        tt.tournament_team_id,
        tt.tournament_id,
        tt.team_id,
        tt.team_name,
        tt.team_omission,
        m.team_name as master_team_name,
        m.team_omission as master_team_omission
      FROM t_tournament_teams tt
      LEFT JOIN m_teams m ON tt.team_id = m.team_id
      WHERE tt.team_name = '' OR tt.team_omission = ''
    `);

    if (existingTeams.rows.length > 0) {
      console.log(`📋 ${existingTeams.rows.length}件の既存データを更新中...`);
      
      for (const team of existingTeams.rows) {
        const masterTeamName = team.master_team_name || `チーム${team.team_id}`;
        const masterTeamOmission = team.master_team_omission || 
          (masterTeamName.length > 6 ? masterTeamName.substr(0, 6) : masterTeamName);

        await db.execute(`
          UPDATE t_tournament_teams 
          SET 
            team_name = ?,
            team_omission = ?
          WHERE tournament_team_id = ?
        `, [masterTeamName, masterTeamOmission, team.tournament_team_id]);
      }
      console.log('✅ 既存データの更新が完了しました。');
    }

    // Step 4: 一意性制約の追加を試行
    console.log('🔒 一意性制約の追加を試行中...');
    try {
      // 重複チェック
      const duplicateNames = await db.execute(`
        SELECT tournament_id, team_name, COUNT(*) as count
        FROM t_tournament_teams
        WHERE team_name != ''
        GROUP BY tournament_id, team_name
        HAVING COUNT(*) > 1
      `);

      const duplicateOmissions = await db.execute(`
        SELECT tournament_id, team_omission, COUNT(*) as count
        FROM t_tournament_teams
        WHERE team_omission != ''
        GROUP BY tournament_id, team_omission
        HAVING COUNT(*) > 1
      `);

      if (duplicateNames.rows.length > 0 || duplicateOmissions.rows.length > 0) {
        console.log('⚠️  重複するチーム名・略称が検出されました。一意性制約の追加をスキップします。');
        if (duplicateNames.rows.length > 0) {
          console.log('重複するチーム名:', duplicateNames.rows);
        }
        if (duplicateOmissions.rows.length > 0) {
          console.log('重複する略称:', duplicateOmissions.rows);
        }
      } else {
        await db.execute(`
          CREATE UNIQUE INDEX IF NOT EXISTS idx_tournament_teams_unique_name 
          ON t_tournament_teams(tournament_id, team_name)
        `);
        await db.execute(`
          CREATE UNIQUE INDEX IF NOT EXISTS idx_tournament_teams_unique_omission 
          ON t_tournament_teams(tournament_id, team_omission)
        `);
        console.log('✅ 一意性制約を追加しました。');
      }
    } catch (error) {
      console.log('⚠️  一意性制約の追加中にエラーが発生しました（継続可能）:', error.message);
    }

    // Step 5: 結果確認
    console.log('🔍 マイグレーション結果を確認中...');
    const updatedTableInfo = await db.execute("PRAGMA table_info(t_tournament_teams)");
    console.log('更新後のカラム:', updatedTableInfo.rows.map(row => `${row.name} (${row.type})`).join(', '));

    const sampleData = await db.execute(`
      SELECT 
        tournament_id,
        team_id,
        team_name,
        team_omission,
        assigned_block,
        block_position
      FROM t_tournament_teams 
      LIMIT 5
    `);
    
    if (sampleData.rows.length > 0) {
      console.log('📋 サンプルデータ:');
      sampleData.rows.forEach(row => {
        console.log(`  - 大会${row.tournament_id}: "${row.team_name}" (${row.team_omission}) [マスター:${row.team_id}]`);
      });
    }

    console.log('🎉 マイグレーション完了！');

  } catch (error) {
    console.error('❌ マイグレーション中にエラーが発生しました:', error);
    throw error;
  }
}

// スクリプト実行
runMigration().catch(console.error);