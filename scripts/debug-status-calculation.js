#!/usr/bin/env node

// 修正されたcalculateTournamentStatus関数をテスト
function calculateTournamentStatus(tournament) {
  // JST基準での現在日付を取得
  const now = new Date();
  const jstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000); // JST に変換
  const today = new Date(jstNow.getFullYear(), jstNow.getMonth(), jstNow.getDate());

  console.log('=== デバッグ情報 ===');
  console.log('UTC now:', now.toISOString());
  console.log('JST now:', jstNow.toISOString());
  console.log('today (JST基準):', today.toISOString());

  // 募集日程の確認（JST 00:00として解釈）
  const recruitmentStart = tournament.recruitment_start_date 
    ? new Date(tournament.recruitment_start_date + 'T00:00:00+09:00')
    : null;
  const recruitmentEnd = tournament.recruitment_end_date 
    ? new Date(tournament.recruitment_end_date + 'T23:59:59+09:00')
    : null;

  console.log('recruitmentStart:', recruitmentStart ? recruitmentStart.toISOString() : 'null');
  console.log('recruitmentEnd:', recruitmentEnd ? recruitmentEnd.toISOString() : 'null');

  // 大会日程の確認
  let tournamentStartDate = null;
  let tournamentEndDate = null;

  try {
    const tournamentDates = JSON.parse(tournament.tournament_dates);
    const dates = Object.values(tournamentDates)
      .filter(date => date)
      .map(date => new Date((date) + 'T00:00:00+09:00'))
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

  console.log('tournamentStartDate:', tournamentStartDate ? tournamentStartDate.toISOString() : 'null');
  console.log('tournamentEndDate:', tournamentEndDate ? tournamentEndDate.toISOString() : 'null');

  // DBのstatusが'completed'の場合は終了とする
  if (tournament.status === 'completed') {
    console.log('判定: DBステータスがcompletedのため -> completed');
    return 'completed';
  }

  // 1. 募集前：募集開始日が未来の場合
  if (recruitmentStart && today < recruitmentStart) {
    console.log('判定: 募集開始前 (', today.toISOString(), '<', recruitmentStart.toISOString(), ') -> before_recruitment');
    return 'before_recruitment';
  }

  // 2. 募集中：募集開始日 <= 現在 <= 募集終了日
  if (recruitmentStart && recruitmentEnd && 
      today >= recruitmentStart && today <= recruitmentEnd) {
    console.log('判定: 募集期間中 -> recruiting');
    return 'recruiting';
  }

  // 3. 開催前：募集終了日 < 現在 < 大会開始日
  if (recruitmentEnd && tournamentStartDate && 
      today > recruitmentEnd && today < tournamentStartDate) {
    console.log('判定: 募集終了後・大会前 -> before_event');
    return 'before_event';
  }

  // 4. 開催中：大会期間中
  if (tournamentStartDate && tournamentEndDate && 
      today >= tournamentStartDate && today <= tournamentEndDate) {
    console.log('判定: 大会期間中 -> ongoing');
    return 'ongoing';
  }

  // 5. 終了：大会期間終了後
  if (tournamentEndDate && today > tournamentEndDate) {
    console.log('判定: 大会終了後 -> completed');
    return 'completed';
  }

  // デフォルト：判定できない場合は募集前とする
  console.log('判定: デフォルト -> before_recruitment');
  return 'before_recruitment';
}

const testTournament = {
  status: 'planning',
  tournament_dates: '{"1":"2025-09-12"}',
  recruitment_start_date: '2025-09-05',
  recruitment_end_date: '2025-09-10'
};

console.log('テスト大会データ:', testTournament);
const result = calculateTournamentStatus(testTournament);
console.log('最終結果:', result);