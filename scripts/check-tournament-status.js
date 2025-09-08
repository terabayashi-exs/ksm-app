const { createClient } = require('@libsql/client');

// 本番環境のデータベース接続情報
const PROD_DB_URL = "libsql://ksm-main-asditd.aws-ap-northeast-1.turso.io";
const PROD_DB_TOKEN = "eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3NTY0NjIwODcsImlkIjoiOTYxYzExMWMtZWRkZS00NGFhLTljZmYtMWE3OTBkNDZjMDQzIiwicmlkIjoiZjBlZGMzZDgtYzBhYS00ZjBjLThiMWYtNDdiN2JmMTQ4Y2JiIn0.rWO9p3UvjUKogEB7Dd3YQKiIBkHzgdL8xaXISyZkw9nPfOlQ_mlNIAkMK6YP3DIRNPQhvDmReLNqpC4-ayJ1Bg";

// 動的ステータス判定ロジック（lib/tournament-status.tsから複製）
function calculateTournamentStatus(tournament) {
  // JST基準での現在日付を取得
  const now = new Date();
  const jstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000); // JST に変換
  const today = new Date(jstNow.getFullYear(), jstNow.getMonth(), jstNow.getDate());

  console.log(`現在時刻（JST）: ${jstNow.toISOString()}`);
  console.log(`今日の日付: ${today.toISOString().split('T')[0]}`);

  // 募集日程の確認（JST 00:00として解釈）
  const recruitmentStart = tournament.recruitment_start_date 
    ? new Date(tournament.recruitment_start_date + 'T00:00:00+09:00')
    : null;
  const recruitmentEnd = tournament.recruitment_end_date 
    ? new Date(tournament.recruitment_end_date + 'T23:59:59+09:00')
    : null;

  // 大会日程の確認
  let tournamentStartDate = null;
  let tournamentEndDate = null;

  try {
    const tournamentDates = JSON.parse(tournament.tournament_dates);
    const dates = Object.values(tournamentDates)
      .filter(date => date)
      .map(date => new Date(date + 'T00:00:00+09:00'))
      .sort((a, b) => a.getTime() - b.getTime());
    
    if (dates.length > 0) {
      tournamentStartDate = dates[0];
      // 大会最終日は23:59:59まで「開催中」とする
      const lastDate = dates[dates.length - 1];
      tournamentEndDate = new Date(lastDate.getTime());
      tournamentEndDate.setHours(23, 59, 59, 999);
    }
  } catch (error) {
    console.warn('tournament_datesのJSON解析に失敗:', tournament.tournament_dates, error);
  }

  console.log(`  募集開始: ${recruitmentStart ? recruitmentStart.toISOString() : 'なし'}`);
  console.log(`  募集終了: ${recruitmentEnd ? recruitmentEnd.toISOString() : 'なし'}`);
  console.log(`  大会開始: ${tournamentStartDate ? tournamentStartDate.toISOString() : 'なし'}`);
  console.log(`  大会終了: ${tournamentEndDate ? tournamentEndDate.toISOString() : 'なし'}`);

  // DBのstatusが'completed'の場合は終了とする
  if (tournament.status === 'completed') {
    return 'completed';
  }

  // 1. 募集前：募集開始日が未来の場合
  if (recruitmentStart && today < recruitmentStart) {
    console.log('  → 募集前（募集開始日が未来）');
    return 'before_recruitment';
  }

  // 2. 募集中：募集開始日 <= 現在 <= 募集終了日
  if (recruitmentStart && recruitmentEnd && 
      today >= recruitmentStart && today <= recruitmentEnd) {
    console.log('  → 募集中');
    return 'recruiting';
  }

  // 3. 開催前：募集終了日 < 現在 < 大会開始日
  if (recruitmentEnd && tournamentStartDate && 
      today > recruitmentEnd && today < tournamentStartDate) {
    console.log('  → 開催前');
    return 'before_event';
  }

  // 4. 開催中：大会期間中
  if (tournamentStartDate && tournamentEndDate && 
      today >= tournamentStartDate && today <= tournamentEndDate) {
    console.log('  → 開催中');
    return 'ongoing';
  }

  // 5. 終了：大会期間終了後
  if (tournamentEndDate && today > tournamentEndDate) {
    console.log('  → 終了（大会期間終了）');
    return 'completed';
  }

  // デフォルト：判定できない場合は募集前とする
  console.log('  → 募集前（デフォルト）');
  return 'before_recruitment';
}

async function checkTournamentStatus() {
  const client = createClient({
    url: PROD_DB_URL,
    authToken: PROD_DB_TOKEN
  });

  try {
    console.log('=== 本番環境大会ステータス詳細確認 ===\n');

    // 全大会のステータス関連データを取得
    const tournaments = await client.execute(`
      SELECT 
        tournament_id,
        tournament_name,
        status,
        tournament_dates,
        recruitment_start_date,
        recruitment_end_date,
        created_at
      FROM t_tournaments
      ORDER BY tournament_id
    `);

    console.log(`取得した大会数: ${tournaments.rows.length}\n`);

    for (const tournament of tournaments.rows) {
      console.log(`\n【大会ID: ${tournament.tournament_id}】`);
      console.log(`大会名: ${tournament.tournament_name}`);
      console.log(`DBステータス: ${tournament.status}`);
      console.log(`募集開始日: ${tournament.recruitment_start_date || 'なし'}`);
      console.log(`募集終了日: ${tournament.recruitment_end_date || 'なし'}`);
      console.log(`大会日程: ${tournament.tournament_dates || 'なし'}`);
      
      // 動的ステータス判定を実行
      const calculatedStatus = calculateTournamentStatus(tournament);
      console.log(`動的ステータス: ${calculatedStatus}`);
      
      // 管理画面での表示判定
      let displayCategory = 'なし';
      if (calculatedStatus === 'recruiting' || calculatedStatus === 'before_event') {
        displayCategory = '募集中';
      } else if (calculatedStatus === 'ongoing') {
        displayCategory = '開催中';
      } else if (calculatedStatus === 'completed') {
        displayCategory = '表示されない（終了済み）';
      }
      console.log(`管理画面表示: ${displayCategory}`);
      console.log('─'.repeat(50));
    }

  } catch (error) {
    console.error('エラーが発生しました:', error);
    process.exit(1);
  }
}

// 実行
checkTournamentStatus().catch(console.error);