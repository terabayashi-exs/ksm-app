#!/usr/bin/env node

import { createClient } from '@libsql/client';

// 開発環境の設定
const devDatabase = createClient({
  url: 'libsql://ksm-dev-asditd.aws-ap-northeast-1.turso.io',
  authToken: 'eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3NTEyNDQwMzUsImlkIjoiMDM5NDVjMGYtYTg4Ny00ZjRlLWJkNGEtNTE1YzY0ZTVjOTdlIiwicmlkIjoiYWRmMWM2NDYtYWJhZS00OTJkLWI5N2UtMTM1MjgzOGE2N2Y1In0.ICP4YE3wIDH8Y51jac0O1591qr4oxGVkCAgIMvDAEqzzTpvvTNIY1C7zFy6U4JF6OvZkfg2vSCnfdgdkebnWCA'
});

// 本番環境の設定
const prodDatabase = createClient({
  url: 'libsql://ksm-prod-asditd.aws-ap-northeast-1.turso.io',
  authToken: 'eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3NTEyNzcyMzEsImlkIjoiODYzZDdiZGItYmJhMy00YTY1LWJkMmEtNWI3YmI4NzFiMGMzIiwicmlkIjoiNTY4MjgwMTEtYjdjNi00YmU1LThiMmMtYjZjOTg4M2RmMjc4In0.TD-vd-nxW-Hfu-se8ScYaFyA41ZkvUO5az3dFkz-7YnPNp1ofum6NgUBKVGPnMaXoJvdpLxIxZbZdfEUi8A_Cg'
});

console.log('開発環境と本番環境のデータベースを比較します...\n');

async function getTournaments(db, envName) {
  try {
    const result = await db.execute(`
      SELECT 
        tournament_id,
        tournament_name,
        status,
        tournament_dates,
        recruitment_start_date,
        recruitment_end_date,
        created_at,
        updated_at
      FROM t_tournaments
      ORDER BY tournament_id
    `);
    return result.rows;
  } catch (error) {
    console.error(`${envName}のデータベース接続エラー:`, error);
    return [];
  }
}

// 日付ベースのステータスを計算
function calculateStatus(tournament) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  // 募集日程の確認
  const recruitmentStart = tournament.recruitment_start_date 
    ? new Date(tournament.recruitment_start_date) 
    : null;
  const recruitmentEnd = tournament.recruitment_end_date 
    ? new Date(tournament.recruitment_end_date) 
    : null;

  // 大会日程の確認
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

  // DBのstatusが'completed'の場合は終了とする
  if (tournament.status === 'completed') {
    return 'completed';
  }

  // 1. 募集前：募集開始日が未来の場合
  if (recruitmentStart && today < recruitmentStart) {
    return 'before_recruitment';
  }

  // 2. 募集中：募集開始日 <= 現在 <= 募集終了日
  if (recruitmentStart && recruitmentEnd && 
      today >= recruitmentStart && today <= recruitmentEnd) {
    return 'recruiting';
  }

  // 3. 開催前：募集終了日 < 現在 < 大会開始日
  if (recruitmentEnd && tournamentStartDate && 
      today > recruitmentEnd && today < tournamentStartDate) {
    return 'before_event';
  }

  // 4. 開催中：大会期間中
  if (tournamentStartDate && tournamentEndDate && 
      today >= tournamentStartDate && today <= tournamentEndDate) {
    return 'ongoing';
  }

  // 5. 終了：大会期間終了後
  if (tournamentEndDate && today > tournamentEndDate) {
    return 'completed';
  }

  // デフォルト：判定できない場合は募集前とする
  return 'before_recruitment';
}

// データの比較
async function compareEnvironments() {
  const devTournaments = await getTournaments(devDatabase, '開発環境');
  const prodTournaments = await getTournaments(prodDatabase, '本番環境');

  console.log('=== 開発環境 ===');
  console.log(`大会数: ${devTournaments.length}`);
  
  devTournaments.forEach(t => {
    const calculatedStatus = calculateStatus(t);
    console.log(`\n大会ID: ${t.tournament_id}`);
    console.log(`名称: ${t.tournament_name}`);
    console.log(`DBステータス: ${t.status}`);
    console.log(`計算ステータス: ${calculatedStatus}`);
    console.log(`募集開始: ${t.recruitment_start_date}`);
    console.log(`募集終了: ${t.recruitment_end_date}`);
    console.log(`大会日程: ${t.tournament_dates}`);
    console.log(`作成日時: ${t.created_at}`);
    console.log(`更新日時: ${t.updated_at}`);
  });

  console.log('\n\n=== 本番環境 ===');
  console.log(`大会数: ${prodTournaments.length}`);
  
  prodTournaments.forEach(t => {
    const calculatedStatus = calculateStatus(t);
    console.log(`\n大会ID: ${t.tournament_id}`);
    console.log(`名称: ${t.tournament_name}`);
    console.log(`DBステータス: ${t.status}`);
    console.log(`計算ステータス: ${calculatedStatus}`);
    console.log(`募集開始: ${t.recruitment_start_date}`);
    console.log(`募集終了: ${t.recruitment_end_date}`);
    console.log(`大会日程: ${t.tournament_dates}`);
    console.log(`作成日時: ${t.created_at}`);
    console.log(`更新日時: ${t.updated_at}`);
  });

  // 差異の特定
  console.log('\n\n=== 差異の分析 ===');
  
  // 同じIDの大会を比較
  devTournaments.forEach(devT => {
    const prodT = prodTournaments.find(p => p.tournament_id === devT.tournament_id);
    if (prodT) {
      console.log(`\n大会ID ${devT.tournament_id} (${devT.tournament_name}):`);
      
      if (devT.status !== prodT.status) {
        console.log(`  ❌ DBステータスが異なる: 開発=${devT.status}, 本番=${prodT.status}`);
      }
      
      if (devT.tournament_dates !== prodT.tournament_dates) {
        console.log(`  ❌ 大会日程が異なる:`);
        console.log(`     開発: ${devT.tournament_dates}`);
        console.log(`     本番: ${prodT.tournament_dates}`);
      }
      
      if (devT.recruitment_start_date !== prodT.recruitment_start_date) {
        console.log(`  ❌ 募集開始日が異なる: 開発=${devT.recruitment_start_date}, 本番=${prodT.recruitment_start_date}`);
      }
      
      if (devT.recruitment_end_date !== prodT.recruitment_end_date) {
        console.log(`  ❌ 募集終了日が異なる: 開発=${devT.recruitment_end_date}, 本番=${prodT.recruitment_end_date}`);
      }

      const devCalcStatus = calculateStatus(devT);
      const prodCalcStatus = calculateStatus(prodT);
      if (devCalcStatus !== prodCalcStatus) {
        console.log(`  ⚠️ 計算ステータスが異なる: 開発=${devCalcStatus}, 本番=${prodCalcStatus}`);
      }
    } else {
      console.log(`\n大会ID ${devT.tournament_id}: 本番環境に存在しない`);
    }
  });

  // 本番環境のみに存在する大会
  prodTournaments.forEach(prodT => {
    const devT = devTournaments.find(d => d.tournament_id === prodT.tournament_id);
    if (!devT) {
      console.log(`\n大会ID ${prodT.tournament_id}: 開発環境に存在しない（本番環境のみ）`);
    }
  });
}

compareEnvironments().then(() => {
  console.log('\n\n比較完了');
  process.exit(0);
}).catch(error => {
  console.error('エラー:', error);
  process.exit(1);
});