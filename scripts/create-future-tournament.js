#!/usr/bin/env node

import { createClient } from '@libsql/client';

// 開発環境の設定
const devDatabase = createClient({
  url: 'libsql://ksm-dev-asditd.aws-ap-northeast-1.turso.io',
  authToken: 'eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3NTEyNDQwMzUsImlkIjoiMDM5NDVjMGYtYTg4Ny00ZjRlLWJkNGEtNTE1YzY0ZTVjOTdlIiwicmlkIjoiYWRmMWM2NDYtYWJhZS00OTJkLWI5N2UtMTM1MjgzOGE2N2Y1In0.ICP4YE3wIDH8Y51jac0O1591qr4oxGVkCAgIMvDAEqzzTpvvTNIY1C7zFy6U4JF6OvZkfg2vSCnfdgdkebnWCA'
});

console.log('開発環境に未来の日程を持つテスト大会を作成します...\n');

async function createFutureTournament() {
  try {
    // 日付を今日から1週間後に設定（開催予定状態をテスト）
    const today = new Date();
    const futureDate = new Date(today);
    futureDate.setDate(today.getDate() + 7);
    
    const testDate = futureDate.toISOString().split('T')[0];
    const recruitmentEnd = new Date(today);
    recruitmentEnd.setDate(today.getDate() + 5);
    const recruitmentEndDate = recruitmentEnd.toISOString().split('T')[0];
    
    console.log(`テスト大会を作成します:`);
    console.log(`現在: ${today.toISOString().split('T')[0]}`);
    console.log(`募集開始: ${today.toISOString().split('T')[0]}`);
    console.log(`募集終了: ${recruitmentEndDate}`);
    console.log(`大会日程: ${testDate}`);
    console.log(`DBステータス: planning（意図的に開催予定のまま）\n`);

    // 開発環境にテスト用大会を作成
    const result = await devDatabase.execute(`
      INSERT INTO t_tournaments (
        tournament_name,
        format_id,
        venue_id,
        team_count,
        court_count,
        tournament_dates,
        match_duration_minutes,
        break_duration_minutes,
        win_points,
        draw_points,
        loss_points,
        walkover_winner_goals,
        walkover_loser_goals,
        status,
        visibility,
        public_start_date,
        recruitment_start_date,
        recruitment_end_date,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', '+9 hours'), datetime('now', '+9 hours'))
    `, [
      'テスト大会（ステータス問題確認用）',
      1, // format_id
      1, // venue_id  
      8, // team_count
      2, // court_count
      JSON.stringify({"1": testDate}), // tournament_dates
      15, // match_duration_minutes
      5,  // break_duration_minutes
      3,  // win_points
      1,  // draw_points  
      0,  // loss_points
      5,  // walkover_winner_goals
      0,  // walkover_loser_goals
      'planning', // status - 意図的にplanningのまま
      'preparing', // visibility
      testDate, // public_start_date
      today.toISOString().split('T')[0], // recruitment_start_date
      recruitmentEndDate // recruitment_end_date
    ]);

    console.log(`✅ テスト大会が作成されました（ID: ${result.lastInsertRowid}）`);

    // 確認: 作成された大会のデータを表示
    const confirmResult = await devDatabase.execute(`
      SELECT 
        tournament_id,
        tournament_name,
        status,
        tournament_dates,
        recruitment_start_date,
        recruitment_end_date
      FROM t_tournaments 
      WHERE tournament_id = ?
    `, [result.lastInsertRowid]);

    if (confirmResult.rows.length > 0) {
      const tournament = confirmResult.rows[0];
      console.log('\n作成されたテスト大会:');
      console.log(`ID: ${tournament.tournament_id}`);
      console.log(`名前: ${tournament.tournament_name}`);
      console.log(`DBステータス: ${tournament.status}`);
      console.log(`大会日程: ${tournament.tournament_dates}`);
      console.log(`募集開始: ${tournament.recruitment_start_date}`);
      console.log(`募集終了: ${tournament.recruitment_end_date}`);
    }

    return result.lastInsertRowid;

  } catch (error) {
    console.error('テスト大会作成エラー:', error);
    return null;
  }
}

// ステータス計算のテスト
function calculateStatus(tournament) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const recruitmentStart = tournament.recruitment_start_date 
    ? new Date(tournament.recruitment_start_date) 
    : null;
  const recruitmentEnd = tournament.recruitment_end_date 
    ? new Date(tournament.recruitment_end_date) 
    : null;

  let tournamentStartDate = null;
  let tournamentEndDate = null;

  try {
    const tournamentDates = JSON.parse(tournament.tournament_dates);
    const dates = Object.values(tournamentDates)
      .filter(date => date)
      .map(date => new Date(date))
      .sort((a, b) => a.getTime() - b.getTime());
    
    if (dates.length > 0) {
      tournamentStartDate = dates[0];
      tournamentEndDate = dates[dates.length - 1];
    }
  } catch (error) {
    console.warn('tournament_datesのJSON解析に失敗:', tournament.tournament_dates, error);
  }

  console.log(`\nデバッグ情報:`);
  console.log(`  今日: ${today.toISOString().split('T')[0]}`);
  console.log(`  募集開始: ${recruitmentStart ? recruitmentStart.toISOString().split('T')[0] : 'なし'}`);
  console.log(`  募集終了: ${recruitmentEnd ? recruitmentEnd.toISOString().split('T')[0] : 'なし'}`);
  console.log(`  大会開始: ${tournamentStartDate ? tournamentStartDate.toISOString().split('T')[0] : 'なし'}`);
  console.log(`  大会終了: ${tournamentEndDate ? tournamentEndDate.toISOString().split('T')[0] : 'なし'}`);

  if (tournament.status === 'completed') {
    console.log(`  判定: DBステータスがcompletedのためcompleted`);
    return 'completed';
  }

  if (recruitmentStart && today < recruitmentStart) {
    console.log(`  判定: 募集開始前のためbefore_recruitment`);
    return 'before_recruitment';
  }

  if (recruitmentStart && recruitmentEnd && 
      today >= recruitmentStart && today <= recruitmentEnd) {
    console.log(`  判定: 募集期間中のためrecruiting`);
    return 'recruiting';
  }

  if (recruitmentEnd && tournamentStartDate && 
      today > recruitmentEnd && today < tournamentStartDate) {
    console.log(`  判定: 募集終了後・大会前のためbefore_event`);
    return 'before_event';
  }

  if (tournamentStartDate && tournamentEndDate && 
      today >= tournamentStartDate && today <= tournamentEndDate) {
    console.log(`  判定: 大会期間中のためongoing`);
    return 'ongoing';
  }

  if (tournamentEndDate && today > tournamentEndDate) {
    console.log(`  判定: 大会終了後のためcompleted`);
    return 'completed';
  }

  console.log(`  判定: デフォルトのためbefore_recruitment`);
  return 'before_recruitment';
}

// メイン処理
async function main() {
  const tournamentId = await createFutureTournament();
  
  if (tournamentId) {
    // 作成した大会の動的ステータス判定をテスト
    console.log('\n=== 動的ステータス判定テスト ===');
    const testResult = await devDatabase.execute(`
      SELECT 
        tournament_id,
        tournament_name,
        status,
        tournament_dates,
        recruitment_start_date,
        recruitment_end_date
      FROM t_tournaments 
      WHERE tournament_id = ?
    `, [tournamentId]);

    if (testResult.rows.length > 0) {
      const tournament = testResult.rows[0];
      const calculatedStatus = calculateStatus(tournament);
      
      console.log(`\nDBステータス: ${tournament.status}`);
      console.log(`計算ステータス: ${calculatedStatus}`);
      
      if (tournament.status !== calculatedStatus) {
        console.log(`⚠️  ステータス不一致が検出されました！`);
        console.log(`     DBステータス「${tournament.status}」vs 動的計算「${calculatedStatus}」`);
        
        if (calculatedStatus === 'recruiting' || calculatedStatus === 'before_event') {
          console.log(`✅ 修正後のダッシュボードAPIでは「募集中」として表示されます`);
        } else if (calculatedStatus === 'ongoing') {
          console.log(`✅ 修正後のダッシュボードAPIでは「開催中」として表示されます`);
        } else {
          console.log(`ℹ️  修正後のダッシュボードAPIでは表示されません（完了済み扱い）`);
        }
      } else {
        console.log(`✅ ステータスは一致しています`);
      }
    }
  }

  process.exit(0);
}

main().catch(error => {
  console.error('エラー:', error);
  process.exit(1);
});