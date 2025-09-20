// 大会43の競技種別を詳細調査するスクリプト
const { createClient } = require('@libsql/client');
require('dotenv').config({ path: '.env.local' });

const client = createClient({
  url: process.env.DATABASE_URL,
  authToken: process.env.DATABASE_AUTH_TOKEN,
});

async function investigateTournament43() {
  try {
    console.log('=== 大会43 競技種別詳細調査 ===\n');
    
    // 1. 大会43の基本情報を取得
    const tournamentResult = await client.execute(`
      SELECT 
        t.tournament_id,
        t.tournament_name,
        t.format_id,
        t.created_at,
        tf.format_name,
        tf.sport_code,
        tf.target_team_count,
        tf.format_description
      FROM t_tournaments t
      LEFT JOIN m_tournament_formats tf ON t.format_id = tf.format_id
      WHERE t.tournament_id = 43
    `);
    
    if (tournamentResult.rows.length === 0) {
      console.log('❌ 大会43が見つかりません');
      return;
    }
    
    const tournament = tournamentResult.rows[0];
    console.log('📋 大会43基本情報:');
    console.log(`  大会名: ${tournament.tournament_name}`);
    console.log(`  作成日時: ${tournament.created_at}`);
    console.log(`  フォーマットID: ${tournament.format_id}`);
    console.log(`  フォーマット名: ${tournament.format_name}`);
    console.log(`  競技種別コード: ${tournament.sport_code}`);
    console.log(`  対象チーム数: ${tournament.target_team_count}`);
    console.log(`  説明: ${tournament.format_description}`);
    
    // 2. m_tournament_formatsテーブルの該当フォーマットを詳細確認
    const formatResult = await client.execute(`
      SELECT * FROM m_tournament_formats WHERE format_id = ?
    `, [tournament.format_id]);
    
    console.log('\n📊 フォーマット詳細情報:');
    if (formatResult.rows.length > 0) {
      const format = formatResult.rows[0];
      Object.keys(format).forEach(key => {
        console.log(`  ${key}: ${format[key]}`);
      });
    }
    
    // 3. システムが実際にどの競技種別として認識しているかをチェック
    console.log('\n🔍 システム認識チェック:');
    
    // getTournamentSportCodeを模擬
    const sportCodeQuery = await client.execute(`
      SELECT tf.sport_code
      FROM t_tournaments t
      JOIN m_tournament_formats tf ON t.format_id = tf.format_id
      WHERE t.tournament_id = ?
    `, [43]);
    
    const actualSportCode = sportCodeQuery.rows[0]?.sport_code || 'pk_championship';
    console.log(`  システム認識の競技種別: ${actualSportCode}`);
    
    // 4. 大会ルール設定を確認
    const rulesResult = await client.execute(`
      SELECT 
        phase,
        tie_breaking_enabled,
        tie_breaking_rules,
        sport_code
      FROM t_tournament_rules 
      WHERE tournament_id = 43
      ORDER BY phase
    `);
    
    console.log('\n⚙️ 大会ルール設定:');
    if (rulesResult.rows.length > 0) {
      rulesResult.rows.forEach(rule => {
        console.log(`  ${rule.phase}フェーズ:`);
        console.log(`    競技種別: ${rule.sport_code}`);
        console.log(`    タイブレーキング有効: ${rule.tie_breaking_enabled ? 'はい' : 'いいえ'}`);
        if (rule.tie_breaking_rules) {
          try {
            const parsedRules = JSON.parse(rule.tie_breaking_rules);
            console.log('    順位決定ルール:');
            parsedRules.forEach(r => {
              const typeMap = {
                'points': '勝点',
                'goal_difference': '得失点差',
                'goals_for': '総得点',
                'head_to_head': '直接対決',
                'lottery': '抽選'
              };
              console.log(`      ${r.order}. ${typeMap[r.type] || r.type}`);
            });
          } catch (e) {
            console.log(`    ルール解析エラー: ${e.message}`);
          }
        }
      });
    } else {
      console.log('  ルール設定なし（デフォルト設定使用）');
    }
    
    // 5. 同じフォーマットを使用している他の大会を確認
    const similarTournamentsResult = await client.execute(`
      SELECT 
        tournament_id,
        tournament_name,
        created_at
      FROM t_tournaments 
      WHERE format_id = ? AND tournament_id != 43
      ORDER BY created_at DESC
      LIMIT 5
    `, [tournament.format_id]);
    
    console.log('\n🔗 同じフォーマットを使用する他の大会:');
    if (similarTournamentsResult.rows.length > 0) {
      similarTournamentsResult.rows.forEach(t => {
        console.log(`  大会${t.tournament_id}: ${t.tournament_name} (作成: ${t.created_at})`);
      });
    } else {
      console.log('  同じフォーマットを使用する他の大会なし');
    }
    
    // 6. 大会43の複製元を推測（作成日時が近い大会を確認）
    const recentTournamentsResult = await client.execute(`
      SELECT 
        tournament_id,
        tournament_name,
        format_id,
        created_at,
        tf.sport_code
      FROM t_tournaments t
      LEFT JOIN m_tournament_formats tf ON t.format_id = tf.format_id
      WHERE t.created_at < (SELECT created_at FROM t_tournaments WHERE tournament_id = 43)
      ORDER BY t.created_at DESC
      LIMIT 10
    `);
    
    console.log('\n📅 大会43作成前の直近大会（複製元候補）:');
    recentTournamentsResult.rows.forEach(t => {
      console.log(`  大会${t.tournament_id}: ${t.tournament_name} (${t.sport_code}) - ${t.created_at}`);
    });
    
    // 7. 判定結果
    console.log('\n🎯 調査結果サマリー:');
    console.log(`  大会43の競技種別: ${tournament.sport_code || 'null'}`);
    console.log(`  システム認識: ${actualSportCode}`);
    
    if (tournament.sport_code === 'soccer') {
      console.log('  ✅ 大会43はサッカー競技として設定されています');
      console.log('  ⚠️  calculateMultiSportBlockStandingsの使用が適切である可能性があります');
    } else if (tournament.sport_code === 'pk_championship') {
      console.log('  ✅ 大会43はPK選手権として設定されています');
      console.log('  ✅ calculateBlockStandingsの使用が適切です');
    } else {
      console.log('  ❓ 競技種別が不明または設定されていません');
      console.log(`  🔧 デフォルト動作: ${actualSportCode}`);
    }
    
  } catch (error) {
    console.error('調査エラー:', error);
  } finally {
    client.close();
  }
}

investigateTournament43();